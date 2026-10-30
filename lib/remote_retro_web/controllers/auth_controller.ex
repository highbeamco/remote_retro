defmodule RemoteRetroWeb.AuthController do
  use RemoteRetroWeb, :controller

  alias RemoteRetro.Accounts
  alias RemoteRetroWeb.OAuth.Google

  def request(conn, _params), do: redirect(conn, external: Google.authorize_url!())

  def callback(conn, %{"code" => code}) do
    code |> Google.fetch_user_info!() |> sign_in(conn)
  end

  def callback(conn, _params) do
    conn |> put_flash(:error, "Google sign-in was cancelled.") |> redirect(to: ~p"/")
  end

  @doc """
  Dev-only: sign in as any email without Google (route only exists with :dev_routes).
  Optional `name` and `picture` params help exercise avatars.
  """
  def dev_login(conn, %{"email" => email} = params) do
    name = params["name"] || email |> String.split("@") |> hd() |> String.capitalize()

    # No Google assertion on this route (it isn't compiled into the prod router).
    # Marking the email verified lets the domain fallback in AI.Access apply, so
    # a dev login on a domain listed in AI_ALLOWED_DOMAINS can exercise AI locally.
    sign_in(
      %{
        "email" => email,
        "name" => name,
        "given_name" => name,
        "picture" => params["picture"],
        "email_verified" => true
      },
      conn
    )
  end

  def logout(conn, _params) do
    conn |> configure_session(drop: true) |> redirect(to: ~p"/")
  end

  defp sign_in(info, conn) do
    {:ok, user} = Accounts.upsert_from_google(info)
    return_to = get_session(conn, :return_to) || ~p"/retros"

    conn
    |> configure_session(renew: true)
    |> delete_session(:return_to)
    |> put_session(:user_id, user.id)
    |> redirect(to: return_to)
  end
end
