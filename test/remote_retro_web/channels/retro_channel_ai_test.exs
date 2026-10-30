defmodule RemoteRetroWeb.RetroChannelAITest do
  # Not async: toggles the global :ai config.
  use RemoteRetroWeb.ChannelCase, async: false
  import Mox
  alias RemoteRetro.AI.RunnerMock

  setup :verify_on_exit!

  setup do
    previous = Application.get_env(:remote_retro, :ai)
    on_exit(fn -> Application.put_env(:remote_retro, :ai, previous) end)
    Application.put_env(:remote_retro, :ai, enabled: true, allowed_domains: ["highbeam.co"])
    :ok
  end

  defp room(user, retro) do
    {socket, snapshot} = join_retro(user, retro)
    {socket, snapshot}
  end

  test "an allowed facilitator can re-run grouping" do
    facilitator = highbeam_user_fixture()
    retro = retro_fixture(facilitator, %{stage: "grouping"})
    id = retro.id
    expect(RunnerMock, :start, fn :grouping, ^id -> :ok end)
    {socket, snapshot} = room(facilitator, retro)

    assert snapshot.ai_enabled
    assert_reply push(socket, "ai:regroup", %{}), :ok, %{status: "started"}
  end

  test "a disallowed facilitator is rejected and does not start a pass" do
    facilitator = user_fixture(%{"email" => "ada@gmail.com", "email_verified" => true})
    retro = retro_fixture(facilitator, %{stage: "grouping"})
    {socket, snapshot} = room(facilitator, retro)

    refute snapshot.ai_enabled
    assert_reply push(socket, "ai:regroup", %{}), :error, %{reason: "ai_forbidden"}
  end

  test "an unverified highbeam address and a mismatched hosted domain are rejected" do
    unverified =
      user_fixture(%{
        "email" => "pat@highbeam.co",
        "email_verified" => false,
        "hd" => "highbeam.co"
      })

    retro = retro_fixture(unverified, %{stage: "grouping"})
    {socket, _snapshot} = room(unverified, retro)
    assert_reply push(socket, "ai:regroup", %{}), :error, %{reason: "ai_forbidden"}

    aliased =
      user_fixture(%{"email" => "sam@highbeam.co", "email_verified" => true, "hd" => "other.com"})

    aliased_retro = retro_fixture(aliased, %{stage: "grouping"})
    {aliased_socket, _} = room(aliased, aliased_retro)
    assert_reply push(aliased_socket, "ai:regroup", %{}), :error, %{reason: "ai_forbidden"}
  end

  test "a guest cannot regroup, and the join flag follows the viewer" do
    facilitator = highbeam_user_fixture()
    guest = user_fixture(%{"email" => "ada@gmail.com", "email_verified" => true})
    retro = retro_fixture(facilitator, %{stage: "grouping"})
    :ok = RemoteRetro.Retros.participate(retro, guest.id)

    {_socket, facilitator_snapshot} = room(facilitator, retro)
    {guest_socket, guest_snapshot} = room(guest, retro)

    assert facilitator_snapshot.ai_enabled
    refute guest_snapshot.ai_enabled

    assert_reply push(guest_socket, "ai:regroup", %{}), :error, %{reason: "forbidden"}
  end

  test "entering grouping starts AI only for an allowed facilitator" do
    allowed = highbeam_user_fixture()
    allowed_retro = retro_fixture(allowed, %{stage: "idea-generation"})
    id = allowed_retro.id
    expect(RunnerMock, :start, fn :grouping, ^id -> :ok end)
    {socket, _} = room(allowed, allowed_retro)
    assert_reply push(socket, "retro:stage", %{"stage" => "grouping"}), :ok, _

    denied = user_fixture(%{"email" => "ada@gmail.com", "email_verified" => true})
    denied_retro = retro_fixture(denied, %{stage: "idea-generation"})
    {denied_socket, _} = room(denied, denied_retro)
    assert_reply push(denied_socket, "retro:stage", %{"stage" => "grouping"}), :ok, _
  end

  test "room-wide snapshot broadcasts omit ai_enabled" do
    facilitator = highbeam_user_fixture()
    retro = retro_fixture(facilitator)
    {socket, _} = room(facilitator, retro)

    assert_reply push(socket, "retro:stage", %{"stage" => "prime-directive"}), :ok, _
    assert_broadcast "snapshot", payload
    refute Map.has_key?(payload, :ai_enabled)
  end

  test "reports ai_disabled when Gemini isn't configured, before the org check" do
    Application.put_env(:remote_retro, :ai, enabled: false, allowed_domains: ["highbeam.co"])
    facilitator = user_fixture(%{"email" => "ada@gmail.com", "email_verified" => true})
    retro = retro_fixture(facilitator, %{stage: "grouping"})
    {socket, snapshot} = room(facilitator, retro)

    refute snapshot.ai_enabled
    assert_reply push(socket, "ai:regroup", %{}), :error, %{reason: "ai_disabled"}
  end
end
