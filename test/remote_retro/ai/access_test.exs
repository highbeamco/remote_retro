defmodule RemoteRetro.AI.AccessTest do
  # Not async: toggles the global :ai allow-list.
  use RemoteRetro.DataCase, async: false
  import RemoteRetro.Fixtures
  alias RemoteRetro.Accounts
  alias RemoteRetro.Accounts.User
  alias RemoteRetro.AI.Access

  setup do
    previous = Application.get_env(:remote_retro, :ai)
    on_exit(fn -> Application.put_env(:remote_retro, :ai, previous) end)
    Application.put_env(:remote_retro, :ai, enabled: true, allowed_domains: ["highbeam.co"])
    :ok
  end

  defp user(attrs) do
    struct!(
      %User{email: "person@highbeam.co", email_verified: true, hosted_domain: "highbeam.co"},
      attrs
    )
  end

  test "a verified Workspace domain in the allow-list is allowed" do
    assert Access.member?(user(%{}))
    assert Access.member?(user(%{hosted_domain: "Highbeam.CO", email: "A@Highbeam.CO"}))
  end

  test "a present hosted domain that isn't allowed loses, even if the email matches" do
    refute Access.member?(user(%{hosted_domain: "other.com", email: "sam@highbeam.co"}))
  end

  test "with no hosted domain, a verified email domain in the allow-list is enough" do
    assert Access.member?(user(%{hosted_domain: nil, email: "dev@highbeam.co"}))
    assert Access.member?(user(%{hosted_domain: "  ", email: "dev@highbeam.co"}))
  end

  test "unverified emails and other domains are rejected" do
    refute Access.member?(user(%{email_verified: false}))
    refute Access.member?(user(%{hosted_domain: nil, email: "ada@gmail.com"}))
    refute Access.member?(user(%{hosted_domain: "corp.highbeam.co", email: "a@corp.highbeam.co"}))
    refute Access.member?(nil)
  end

  test "the allow-list is configuration, and an empty list allows nobody" do
    Application.put_env(:remote_retro, :ai, enabled: true, allowed_domains: ["example.com"])

    assert Access.member?(user(%{email: "a@example.com", hosted_domain: "example.com"}))
    refute Access.member?(user(%{email: "a@highbeam.co", hosted_domain: "highbeam.co"}))

    Application.put_env(:remote_retro, :ai, enabled: true, allowed_domains: [])
    refute Access.member?(user(%{}))
  end

  test "an unset allow-list allows nobody" do
    Application.put_env(:remote_retro, :ai, enabled: true)
    assert Access.allowed_domains() == []
    refute Access.member?(user(%{}))

    Application.put_env(:remote_retro, :ai, enabled: true, allowed_domains: nil)
    assert Access.allowed_domains() == []
  end

  test "sign-in stores the Google claims and refreshes them next time" do
    assert {:ok, user} =
             Accounts.upsert_from_google(%{
               "email" => "ada@highbeam.co",
               "name" => "Ada",
               "given_name" => "Ada",
               "email_verified" => "true",
               "hd" => " Highbeam.CO "
             })

    assert user.email_verified
    assert user.hosted_domain == "highbeam.co"
    assert Access.member?(user)

    assert {:ok, updated} =
             Accounts.upsert_from_google(%{
               "email" => "ada@highbeam.co",
               "name" => "Ada",
               "given_name" => "Ada",
               "email_verified" => true,
               "hd" => "elsewhere.com"
             })

    assert updated.id == user.id
    assert updated.hosted_domain == "elsewhere.com"
    refute Access.member?(updated)
  end

  test "claims without a hosted domain leave it unset" do
    user = user_fixture(%{"email" => "ada@highbeam.co", "email_verified" => true})
    assert user.email_verified
    assert user.hosted_domain == nil
    assert Access.member?(user)
  end
end
