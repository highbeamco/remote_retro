defmodule RemoteRetro.AI.Credentials do
  @moduledoc """
  Google Application Default Credentials for Vertex AI and Cloud SQL IAM auth (see
  `RemoteRetro.Repo.IAMAuth`), backed by one shared Goth (`RemoteRetro.Goth`).

  Source resolution (first match wins):

    1. `GOOGLE_APPLICATION_CREDENTIALS` (path to a JSON key file), if the file exists
    2. `~/.config/gcloud/application_default_credentials.json` (written by
       `gcloud auth application-default login`), if it exists
    3. the GCE/Cloud Run metadata server

  Supported JSON types: `service_account`, `authorized_user` and
  `impersonated_service_account` (Goth fetches the source credential's token,
  which is then exchanged via the IAM Credentials `generateAccessToken` API).
  """
  require Logger

  @goth RemoteRetro.Goth
  @scope "https://www.googleapis.com/auth/cloud-platform"

  @type impersonation :: %{url: String.t(), delegates: [String.t()]} | nil

  @doc "Goth child for the supervision tree (started when AI or Cloud SQL IAM auth is on)."
  def goth_child_spec(name \\ @goth) do
    {source, _impersonation} = resolve()
    # Goth raises after `max_retries` failed refreshes; keep retrying (with its
    # 30s-capped backoff) instead of crash-looping the app when creds are missing.
    Supervisor.child_spec({Goth, name: name, source: source, max_retries: 1_000}, id: name)
  end

  @doc "Returns a bearer token from the Goth named `name` (the shared one by default)."
  @spec token(term()) :: {:ok, String.t()} | {:error, term()}
  def token(name \\ @goth) do
    with {:ok, %Goth.Token{token: token}} <- fetch_goth(name) do
      {_source, impersonation} = resolve()
      maybe_impersonate(token, impersonation)
    end
  end

  @doc "Resolves the Goth source (and impersonation target, if any) from the environment."
  @spec resolve() :: {term(), impersonation}
  def resolve do
    case credentials_path() do
      nil ->
        {:metadata, nil}

      path ->
        case path |> File.read!() |> Jason.decode() do
          {:ok, creds} ->
            source_for(creds)

          {:error, _} ->
            Logger.warning(
              "Google credentials: could not parse credentials file #{path}; falling back to metadata server"
            )

            {:metadata, nil}
        end
    end
  end

  @doc false
  def source_for(%{"type" => "service_account"} = creds), do: {{:service_account, creds}, nil}
  def source_for(%{"type" => "authorized_user"} = creds), do: {{:refresh_token, creds}, nil}

  def source_for(
        %{
          "type" => "impersonated_service_account",
          "source_credentials" => source,
          "service_account_impersonation_url" => url
        } =
          creds
      ) do
    {inner, _} = source_for(source)
    {inner, %{url: url, delegates: creds["delegates"] || []}}
  end

  def source_for(%{"type" => type}) do
    Logger.warning(
      "Google credentials: unsupported credentials type #{inspect(type)}; falling back to metadata server"
    )

    {:metadata, nil}
  end

  def source_for(_), do: {:metadata, nil}

  defp credentials_path do
    env_path = System.get_env("GOOGLE_APPLICATION_CREDENTIALS")

    gcloud_path =
      Path.join([
        System.user_home() || "/nonexistent",
        ".config",
        "gcloud",
        "application_default_credentials.json"
      ])

    cond do
      env_path not in [nil, ""] and File.regular?(env_path) ->
        env_path

      env_path not in [nil, ""] and not File.regular?(gcloud_path) ->
        Logger.warning(
          "Google credentials: GOOGLE_APPLICATION_CREDENTIALS file not found; using metadata server"
        )

        nil

      File.regular?(gcloud_path) ->
        gcloud_path

      true ->
        nil
    end
  end

  defp fetch_goth(name) do
    Goth.fetch(name)
  rescue
    e -> {:error, e}
  catch
    :exit, reason -> {:error, {:goth_unavailable, reason}}
  end

  defp maybe_impersonate(token, nil), do: {:ok, token}

  defp maybe_impersonate(token, %{url: url, delegates: delegates}) do
    case Req.post(url,
           json: %{scope: [@scope], delegates: delegates, lifetime: "3600s"},
           auth: {:bearer, token},
           retry: :transient,
           max_retries: 1
         ) do
      {:ok, %{status: 200, body: %{"accessToken" => access_token}}} -> {:ok, access_token}
      {:ok, %{status: status}} -> {:error, {:impersonation_failed, status}}
      {:error, reason} -> {:error, reason}
    end
  end
end
