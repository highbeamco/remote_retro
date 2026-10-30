defmodule RemoteRetro.Repo.IAMAuth do
  @moduledoc """
  Cloud SQL IAM database authentication: the Repo logs in as an IAM database user
  (the Cloud Run service account) with a short-lived Google OAuth access token as
  its Postgres password.

  `config/runtime.exs` turns this on in prod when `DATABASE_URL`'s user is a
  service account (`name@project.iam`, urlencoded as `name%40project.iam`) with no
  password, by setting the Repo's DBConnection `:configure` hook to `configure/1`.
  The hook runs before every connect, so reconnects get a fresh token (they last ~1h).

  Tokens come from the Goth shared with Vertex AI (`RemoteRetro.Goth`, see
  `RemoteRetro.AI.Credentials`): the metadata server on Cloud Run. They carry the
  `cloud-platform` scope, which Cloud SQL accepts for IAM logins. Goth's metadata
  source can't request any other scope, so the narrower `sqlservice.login` would
  only apply to JSON-key credentials.
  """
  require Logger

  alias RemoteRetro.AI.Credentials

  @doc "Whether `config/runtime.exs` pointed the Repo's `:configure` hook here."
  def enabled? do
    match?({__MODULE__, _, _}, Application.get_env(:remote_retro, RemoteRetro.Repo)[:configure])
  end

  @doc "The shared Goth, which must start before the Repo; empty unless enabled."
  def children, do: if(enabled?(), do: [Credentials.goth_child_spec()], else: [])

  @doc """
  DBConnection `:configure` hook: sets `:password` to a fresh access token, leaving
  opts untouched when a password is already set. When no token can be fetched it
  logs why and sets an empty password, so Postgres rejects the login like any other
  bad password and DBConnection backs off and retries the connect.
  """
  @spec configure(keyword(), (-> {:ok, String.t()} | {:error, term()})) :: keyword()
  def configure(opts, fetch_token \\ &token/0) do
    if opts[:password] do
      opts
    else
      case fetch_token.() do
        {:ok, token} ->
          Keyword.put(opts, :password, token)

        {:error, reason} ->
          Logger.error("Cloud SQL IAM auth: could not fetch an access token: #{inspect(reason)}")
          # Not left unset: Postgrex `Keyword.fetch!`es :password during auth, which
          # would crash the connection process instead of failing the login.
          Keyword.put(opts, :password, "")
      end
    end
  end

  defp token, do: Credentials.token()
end
