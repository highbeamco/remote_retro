defmodule RemoteRetroWeb.AuthControllerTest do
  use RemoteRetroWeb.ConnCase, async: true

  alias RemoteRetro.Accounts

  test "dev login verifies the email and does not invent a hosted domain", %{conn: conn} do
    conn = get(conn, "/dev/login?email=ada@example.com")
    assert redirected_to(conn) == ~p"/retros"

    user = Accounts.get_user_by_email("ada@example.com")
    assert user.email_verified
    assert user.hosted_domain == nil
  end
end
