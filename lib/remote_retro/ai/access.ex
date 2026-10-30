defmodule RemoteRetro.AI.Access do
  @moduledoc """
  Who may trigger paid AI features.

  Google sign-in is open to anyone. AI is not: a user qualifies only when
  Google has verified their email and one of these holds:

    * their Workspace hosted domain (`hd`) is in the allow-list, or
    * Google did not send `hd` and the verified email's domain is in the allow-list.

  An `hd` claim that is present but not allowed always loses, even when the
  email domain matches. That is the claim Google says to trust for Workspace
  membership; the email-domain fallback covers dev sign-in (no Google
  assertion) and the occasional userinfo response that omits `hd`.

  The allow-list is `config :remote_retro, :ai, :allowed_domains`
  (`AI_ALLOWED_DOMAINS`). Unset or empty allows nobody.

  Gating is per acting user, which for every AI call is the facilitator at
  that moment. An allowed facilitator can run AI in a room that also has
  outside guests (they see the result; they don't start the paid call). A
  facilitator who isn't allowed cannot, even if a colleague who is allowed
  is in the room. Handing the role across that line turns AI on or off for
  the next action.
  """

  alias RemoteRetro.Accounts.User

  @doc "Workspace domains that may use AI, lowercased, without a leading `@`. Empty when unset."
  def allowed_domains do
    case Keyword.get(ai_config(), :allowed_domains, []) do
      domains when is_list(domains) ->
        domains |> Enum.map(&normalize_domain/1) |> Enum.reject(&is_nil/1) |> Enum.uniq()

      _ ->
        []
    end
  end

  @doc "True when `user` may trigger AI under the current allow-list."
  def member?(%User{email_verified: true} = user) do
    domains = allowed_domains()

    case normalize_domain(user.hosted_domain) do
      hd when is_binary(hd) -> hd in domains
      _ -> email_domain(user.email) in domains
    end
  end

  def member?(_user), do: false

  @doc "Pulls `email_verified` and `hd` out of a Google userinfo (or dev-login) map."
  def claims_from_google(info) when is_map(info) do
    %{
      email_verified: verified?(info["email_verified"]),
      hosted_domain: normalize_domain(info["hd"])
    }
  end

  @doc "Lowercases a domain and strips a leading `@`. Anything that isn't a single domain becomes nil."
  def normalize_domain(domain) when is_binary(domain) do
    domain = domain |> String.trim() |> String.trim_leading("@") |> String.downcase()

    if domain == "" or String.contains?(domain, ["@", "/", " ", ","]), do: nil, else: domain
  end

  def normalize_domain(_domain), do: nil

  defp verified?(value) when value in [true, "true"], do: true
  defp verified?(_value), do: false

  defp email_domain(email) when is_binary(email) do
    case String.split(email, "@") do
      [local, domain] when local != "" -> normalize_domain(domain)
      _ -> nil
    end
  end

  defp email_domain(_email), do: nil

  defp ai_config, do: Application.get_env(:remote_retro, :ai, [])
end
