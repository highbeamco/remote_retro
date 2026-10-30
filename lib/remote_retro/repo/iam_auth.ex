defmodule RemoteRetro.Repo.IAMAuth do
  @moduledoc """
  Cloud SQL IAM database authentication: the Repo logs in as an IAM database user
  (the Cloud Run service account) with a short-lived Google OAuth access token as
  its Postgres password.

  `config/runtime.exs` turns this on in prod when `DATABASE_URL` has no password,
  by setting the Repo's DBConnection `:configure` hook to `configure/1`. The hook
  runs before every connect, so reconnects get a fresh token (they last ~1h).

  Tokens come from a dedicated Goth (`RemoteRetro.Repo.Goth`) that resolves
  credentials like Vertex AI does (`RemoteRetro.AI.Credentials`): the metadata
  server on Cloud Run. They carry the `cloud-platform` scope, which Cloud SQL
  accepts for IAM logins. Goth's metadata source can't request any other scope, so
  the narrower `sqlservice.login` would only apply to JSON-key credentials.
  """
  require Logger

  alias RemoteRetro.AI.Credentials

  @goth RemoteRetro.Repo.Goth

  @doc "Whether `config/runtime.exs` pointed the Repo's `:configure` hook here."
  def enabled? do
    match?({__MODULE__, _, _}, Application.get_env(:remote_retro, RemoteRetro.Repo)[:configure])
  end

  @doc "The token source, which must start before the Repo; empty unless enabled."
  def children, do: if(enabled?(), do: [Credentials.goth_child_spec(@goth)], else: [])

  @doc """
  DBConnection `:configure` hook: sets `:password` to a fresh access token, leaving
  opts untouched when a password is already set. Raises when no token can be
  fetched; DBConnection then restarts the connection, which retries.
  """
  @spec configure(keyword(), (-> {:ok, String.t()} | {:error, term()})) :: keyword()
  def configure(opts, fetch_token \\ &token/0) do
    if opts[:password] do
      opts
    else
      Keyword.put(opts, :password, fetch_token!(fetch_token))
    end
  end

  defp token, do: Credentials.token(@goth)

  defp fetch_token!(fetch_token) do
    case fetch_token.() do
      {:ok, token} ->
        token

      {:error, reason} ->
        message = "Cloud SQL IAM auth: could not fetch an access token: #{inspect(reason)}"
        # DBConnection hides exceptions raised while connecting, so log it too.
        Logger.error(message)
        raise message
    end
  end
end
