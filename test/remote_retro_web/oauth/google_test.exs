defmodule RemoteRetroWeb.OAuth.GoogleTest do
  use ExUnit.Case, async: true

  alias RemoteRetroWeb.OAuth.Google

  defp jwt(claims) do
    header = Base.url_encode64(~s({"alg":"none"}), padding: false)
    payload = claims |> Jason.encode!() |> Base.url_encode64(padding: false)
    header <> "." <> payload <> ".sig"
  end

  test "userinfo wins, and the ID token fills hd and email_verified when userinfo omits them" do
    token = %OAuth2.AccessToken{
      other_params: %{"id_token" => jwt(%{"hd" => "highbeam.co", "email_verified" => true})}
    }

    assert Google.id_token_claims(token)["hd"] == "highbeam.co"

    merged =
      Google.merge_identity(
        %{"email" => "ada@highbeam.co", "name" => "Ada"},
        Google.id_token_claims(token)
      )

    assert merged["email_verified"] == true
    assert merged["hd"] == "highbeam.co"
  end

  test "a hosted domain already on userinfo is kept" do
    merged =
      Google.merge_identity(
        %{"email" => "ada@highbeam.co", "hd" => "highbeam.co", "email_verified" => true},
        %{"hd" => "other.com", "email_verified" => false}
      )

    assert merged["hd"] == "highbeam.co"
    assert merged["email_verified"] == true
  end

  test "a blank hosted domain is dropped so the email-domain fallback can apply" do
    merged = Google.merge_identity(%{"email" => "ada@highbeam.co", "hd" => "  "}, %{})
    refute Map.has_key?(merged, "hd")
  end

  test "a token without an id_token yields no claims" do
    assert Google.id_token_claims(%OAuth2.AccessToken{}) == %{}
    assert Google.id_token_claims(nil) == %{}
  end
end
