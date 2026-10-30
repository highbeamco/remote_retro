defmodule RemoteRetro.RetrosStageTest do
  use RemoteRetro.DataCase, async: true
  import RemoteRetro.Fixtures
  alias RemoteRetro.{Groups, Ideas, Retros}

  setup do
    facilitator = user_fixture()
    %{facilitator: facilitator, guest: user_fixture()}
  end

  defp subscribe(retro), do: Phoenix.PubSub.subscribe(RemoteRetro.PubSub, "retro:#{retro.id}")

  test "advances one stage and broadcasts a snapshot", %{facilitator: f} do
    retro = retro_fixture(f)
    subscribe(retro)

    assert {:ok, %{stage: "prime-directive"}} =
             Retros.change_stage(retro, "prime-directive", f.id)

    assert_receive %Phoenix.Socket.Broadcast{
      event: "snapshot",
      payload: %{retro: %{stage: "prime-directive"}}
    }
  end

  test "rejects non-facilitators, non-adjacent and unknown stages, and AI-busy retros", %{
    facilitator: f,
    guest: g
  } do
    retro = retro_fixture(f, %{stage: "idea-generation"})

    assert {:error, :forbidden} = Retros.change_stage(retro, "grouping", g.id)
    assert {:error, :invalid_stage} = Retros.change_stage(retro, "voting", f.id)
    assert {:error, :invalid_stage} = Retros.change_stage(retro, "nope", f.id)
    assert {:error, :invalid_stage} = Retros.change_stage(retro, nil, f.id)

    busy = update_fixture!(retro, %{ai_status: "grouping"})
    assert {:error, :ai_busy} = Retros.change_stage(busy, "grouping", f.id)
    assert Retros.get_retro!(retro.id).stage == "idea-generation"
  end

  test "entering grouping places ideas and syncs groups without AI when the facilitator isn't allow-listed",
       %{facilitator: f} do
    retro = retro_fixture(f, %{stage: "idea-generation"})
    idea_fixture(retro, f)
    idea_fixture(retro, f, %{category: "sad"})

    assert {:ok, _} = Retros.change_stage(retro, "grouping", f.id)
    ideas = Ideas.list_ideas(retro.id)
    assert Enum.all?(ideas, &(&1.x && &1.group_id))
    assert length(Groups.list_groups(retro.id)) == 2
  end

  test "AI grouping only runs until it has succeeded once", %{facilitator: f} do
    retro =
      retro_fixture(f, %{stage: "voting"})
      |> update_fixture!(%{ai_grouped_at: DateTime.utc_now()})

    # No expectation: a call would fail verify_on_exit!.
    assert {:ok, %{stage: "grouping"}} = Retros.change_stage(retro, "grouping", f.id)
  end

  test "moving on from grouping to voting syncs groups without starting the AI", %{
    facilitator: f
  } do
    retro = retro_fixture(f, %{stage: "grouping"})
    idea = idea_fixture(retro, f, %{x: 0.0, y: 0.0})
    # No expectation: a call would fail verify_on_exit!.

    assert {:ok, _} = Retros.change_stage(retro, "voting", f.id)
    assert Repo.reload!(idea).group_id
  end

  test "coming back to voting from action items does not relabel", %{facilitator: f} do
    retro = retro_fixture(f, %{stage: "action-items"})
    # No expectation: a call would fail verify_on_exit!.
    assert {:ok, %{stage: "voting"}} = Retros.change_stage(retro, "voting", f.id)
  end

  test "going back from voting keeps votes", %{facilitator: f} do
    retro = retro_fixture(f, %{stage: "voting"})
    group = group_fixture(retro)
    idea_fixture(retro, f, %{x: 0.0, y: 0.0, group_id: group.id})
    vote = vote_fixture(group, f)

    assert {:ok, _} = Retros.change_stage(retro, "grouping", f.id)
    assert Repo.reload(vote)
  end

  test "a facilitator who isn't allowed to use AI still changes stage, without starting AI" do
    facilitator = user_fixture(%{"email" => "ada@gmail.com", "email_verified" => true})
    retro = retro_fixture(facilitator, %{stage: "idea-generation"})
    idea_fixture(retro, facilitator)
    idea_fixture(retro, facilitator, %{category: "sad"})

    assert {:ok, %{stage: "grouping"}} = Retros.change_stage(retro, "grouping", facilitator.id)
  end

  test "closing without action items and re-opening have no side effects", %{facilitator: f} do
    retro = retro_fixture(f, %{stage: "action-items"})
    assert {:ok, closed} = Retros.change_stage(retro, "closed", f.id)
    assert {:ok, %{stage: "action-items"}} = Retros.change_stage(closed, "action-items", f.id)
    Swoosh.TestAssertions.assert_no_email_sent()
  end

  test "change_facilitator hands over to participants only", %{facilitator: f, guest: g} do
    retro = retro_fixture(f)
    stranger = user_fixture()

    assert {:error, :forbidden} = Retros.change_facilitator(retro, g.id, g.id)
    assert {:error, :invalid} = Retros.change_facilitator(retro, f.id, stranger.id)
    :ok = Retros.participate(retro, g.id)
    assert {:ok, %{facilitator_id: gid}} = Retros.change_facilitator(retro, f.id, g.id)
    assert gid == g.id
  end
end
