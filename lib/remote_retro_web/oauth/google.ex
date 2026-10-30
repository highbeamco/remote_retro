defmodule RemoteRetroWeb.OAuth.Google do
  @moduledoc "Google OAuth 2 sign-in (authorization code flow)."

  @scope "openid email profile"
  @userinfo_url "https://openidconnect.googleapis.com/v1/userinfo"

  def authorize_url!, do: OAuth2.Client.authorize_url!(client(), scope: @scope)

  def fetch_user_info!(code) do
    client = OAuth2.Client.get_token!(client(), code: code)
    %{body: info} = OAuth2.Client.get!(client, @userinfo_url)
    merge_identity(info, id_token_claims(client.token))
  end

  @doc """
  Fills `email_verified` and `hd` from the ID token when userinfo omits them.

  The token is the one Google just returned on the token endpoint, so the
  payload is used without a second signature check.
  """
  def merge_identity(info, claims) when is_map(info) and is_map(claims) do
    verified = Map.get(info, "email_verified", Map.get(claims, "email_verified"))
    hd = present(info["hd"]) || present(claims["hd"])

    info
    |> Map.put("email_verified", verified)
    |> then(fn info ->
      if hd, do: Map.put(info, "hd", hd), else: Map.delete(info, "hd")
    end)
  end

  @doc false
  def id_token_claims(%OAuth2.AccessToken{other_params: params}) when is_map(params) do
    (Map.get(params, "id_token") || Map.get(params, :id_token)) |> decode_jwt_payload()
  end

  def id_token_claims(_token), do: %{}

  defp present(value) when is_binary(value) do
    trimmed = String.trim(value)
    if trimmed == "", do: nil, else: trimmed
  end

  defp present(_value), do: nil

  defp decode_jwt_payload(token) when is_binary(token) do
    case String.split(token, ".", parts: 3) do
      [_header, payload, _sig] ->
        case Base.url_decode64(payload, padding: false) do
          {:ok, json} ->
            case Jason.decode(json) do
              {:ok, claims} when is_map(claims) -> claims
              _ -> %{}
            end

          :error ->
            %{}
        end

      _ ->
        %{}
    end
  end

  defp decode_jwt_payload(_token), do: %{}

  defp client do
    config = Application.fetch_env!(:remote_retro, :google_oauth)

    OAuth2.Client.new(
      strategy: OAuth2.Strategy.AuthCode,
      client_id: config[:client_id],
      client_secret: config[:client_secret],
      redirect_uri: config[:redirect_uri],
      site: "https://accounts.google.com",
      authorize_url: "https://accounts.google.com/o/oauth2/v2/auth",
      token_url: "https://oauth2.googleapis.com/token",
      token_method: :post
    )
    |> OAuth2.Client.put_serializer("application/json", Jason)
  end
end
