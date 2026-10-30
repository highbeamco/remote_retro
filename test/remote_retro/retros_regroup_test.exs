defmodule RemoteRetro.RetrosRegroupTest do
  # Not async: toggles the global :ai config.
  use RemoteRetro.DataCase, async: false
  import Mox
  import RemoteRetro.Fixtures
  alias RemoteRetro.AI.RunnerMock
  alias RemoteRetro.Retros

  setup :verify_on_exit!

  setup do
    previous = Application.get_env(:remote_retro, :ai)
    on_exit(fn -> Application.put_env(:remote_retro, :ai, previous) end)
    facilitator = highbeam_user_fixture()

    %{
      facilitator: facilitator,
      guest: user_fixture(),
      retro: retro_fixture(facilitator, %{stage: "grouping"})
    }
  end

  defp enable_ai,
    do: Application.put_env(:remote_retro, :ai, enabled: true, allowed_domains: ["highbeam.co"])

  test "facilitator only, in Group & label, while the AI is idle", %{
    facilitator: f,
    guest: g,
    retro: retro
  } do
    enable_ai()
    assert {:error, :forbidden} = Retros.regroup(retro, g.id)
    assert {:error, :invalid_stage} = Retros.regroup(%{retro | stage: "voting"}, f.id)
    assert {:error, :ai_busy} = Retros.regroup(%{retro | ai_status: "grouping"}, f.id)
  end

  test "reports when AI isn't configured", %{facilitator: f, retro: retro} do
    Application.put_env(:remote_retro, :ai, enabled: false)
    assert {:error, :ai_disabled} = Retros.regroup(retro, f.id)
  end

  test "rejects a facilitator whose account isn't allowed to use AI", %{facilitator: f} do
    enable_ai()
    outsider = user_fixture(%{"email" => "ada@gmail.com", "email_verified" => true})
    outsider_retro = retro_fixture(outsider, %{stage: "grouping"})

    assert {:error, :ai_forbidden} = Retros.regroup(outsider_retro, outsider.id)
    # A colleague who is allowed doesn't unlock it for this facilitator.
    :ok = Retros.participate(outsider_retro, f.id)
    assert {:error, :ai_forbidden} = Retros.regroup(outsider_retro, outsider.id)

    unverified =
      user_fixture(%{
        "email" => "pat@highbeam.co",
        "email_verified" => false,
        "hd" => "highbeam.co"
      })

    unverified_retro = retro_fixture(unverified, %{stage: "grouping"})
    assert {:error, :ai_forbidden} = Retros.regroup(unverified_retro, unverified.id)

    aliased =
      user_fixture(%{
        "email" => "sam@highbeam.co",
        "email_verified" => true,
        "hd" => "other.com"
      })

    aliased_retro = retro_fixture(aliased, %{stage: "grouping"})
    assert {:error, :ai_forbidden} = Retros.regroup(aliased_retro, aliased.id)
  end

  test "starts a grouping pass even after the first one has run", %{facilitator: f, retro: retro} do
    enable_ai()
    retro = update_fixture!(retro, %{ai_grouped_at: DateTime.utc_now()})
    id = retro.id
    expect(RunnerMock, :start, fn :grouping, ^id -> :ok end)
    assert {:ok, :started} = Retros.regroup(retro, f.id)
  end

  test "says so when there's nothing left to group", %{facilitator: f, retro: retro} do
    enable_ai()
    expect(RunnerMock, :start, fn :grouping, _ -> :skipped end)
    assert {:ok, :nothing_to_group} = Retros.regroup(retro, f.id)
  end

  test "allows two re-runs per retro, then refuses", %{facilitator: f, retro: retro} do
    enable_ai()
    stub(RunnerMock, :start, fn :grouping, _ -> :ok end)
    assert {:ok, :started} = Retros.regroup(retro, f.id)
    assert {:ok, :started} = Retros.regroup(retro, f.id)
    assert {:error, :regroup_limit} = Retros.regroup(retro, f.id)
    assert Retros.get_retro!(retro.id).ai_regroups == Retros.max_regroups()
  end

  test "a re-run with nothing to group doesn't use one up", %{facilitator: f, retro: retro} do
    enable_ai()
    expect(RunnerMock, :start, 3, fn :grouping, _ -> :skipped end)
    for _ <- 1..3, do: assert({:ok, :nothing_to_group} = Retros.regroup(retro, f.id))
    assert Retros.get_retro!(retro.id).ai_regroups == 0
  end

  test "concurrent presses can't exceed the cap", %{facilitator: f, retro: retro} do
    enable_ai()
    stub(RunnerMock, :start, fn :grouping, _ -> :ok end)
    parent = self()

    results =
      1..6
      |> Enum.map(fn _ ->
        Task.async(fn ->
          Mox.allow(RunnerMock, parent, self())
          Retros.regroup(retro, f.id)
        end)
      end)
      |> Enum.map(&Task.await/1)

    assert Enum.count(results, &(&1 == {:ok, :started})) == 2
    assert Enum.count(results, &(&1 == {:error, :regroup_limit})) == 4
  end

  test "the count is visible to clients", %{retro: retro} do
    assert %{"ai_regroups" => 0} = retro |> Jason.encode!() |> Jason.decode!()
  end
end
