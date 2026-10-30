defmodule RemoteRetroWeb.RetroChannelTest do
  use RemoteRetroWeb.ChannelCase, async: true
  import Mox
  alias RemoteRetro.{Groups, Ideas, Repo, Retros}

  setup :verify_on_exit!

  setup do
    facilitator = user_fixture()
    %{facilitator: facilitator, guest: user_fixture()}
  end

  defp room(user, retro) do
    {socket, _snapshot} = join_retro(user, retro)
    socket
  end

  describe "ideas" do
    test "create replies with the idea and broadcasts it to others", %{facilitator: f} do
      retro = retro_fixture(f, %{stage: "idea-generation"})
      socket = room(f, retro)

      ref = push(socket, "idea:create", %{"category" => "happy", "body" => " Shipped! "})
      assert_reply ref, :ok, %{idea: %{body: "Shipped!", user_id: user_id, id: id}}
      assert user_id == f.id
      assert_broadcast "idea:upserted", %{idea: %{id: ^id}}
    end

    test "create is gated by stage, category and validity", %{facilitator: f} do
      retro = retro_fixture(f, %{stage: "grouping"})
      socket = room(f, retro)

      assert_reply push(socket, "idea:create", %{"category" => "happy", "body" => "x"}),
                   :error,
                   %{reason: "invalid_stage"}

      Repo.update!(Ecto.Changeset.change(retro, stage: "idea-generation"))

      assert_reply push(socket, "idea:create", %{"category" => "start", "body" => "x"}),
                   :error,
                   %{reason: "invalid", errors: %{category: _}}

      assert_reply push(socket, "idea:create", %{"category" => "happy", "body" => "  "}),
                   :error,
                   %{reason: "invalid", errors: %{body: _}}

      assert_reply push(socket, "idea:create", %{
                     "category" => "action-item",
                     "body" => "x",
                     "assignee_id" => f.id
                   }),
                   :error,
                   %{reason: "invalid_stage"}
    end

    test "action items need the action-items stage and a participant assignee", %{
      facilitator: f,
      guest: g
    } do
      retro = retro_fixture(f, %{stage: "action-items"})
      socket = room(f, retro)
      stranger = user_fixture()

      assert_reply push(socket, "idea:create", %{"category" => "action-item", "body" => "Fix CI"}),
                   :error,
                   %{errors: %{assignee_id: _}}

      assert_reply push(socket, "idea:create", %{
                     "category" => "action-item",
                     "body" => "Fix CI",
                     "assignee_id" => stranger.id
                   }),
                   :error,
                   %{errors: %{assignee_id: ["must be a participant"]}}

      assert_reply push(socket, "idea:create", %{"category" => "happy", "body" => "x"}),
                   :error,
                   %{reason: "invalid_stage"}

      :ok = Retros.participate(retro, g.id)

      ref =
        push(socket, "idea:create", %{
          "category" => "action-item",
          "body" => "Fix CI",
          "assignee_id" => g.id
        })

      assert_reply ref, :ok, %{idea: %{assignee_id: assignee_id}}
      assert assignee_id == g.id
    end

    test "update/delete: author or facilitator only", %{facilitator: f, guest: g} do
      retro = retro_fixture(f, %{stage: "idea-generation"})
      mine = idea_fixture(retro, g)
      theirs = idea_fixture(retro, f)
      guest = room(g, retro)
      facil = room(f, retro)

      assert_reply push(guest, "idea:update", %{"id" => theirs.id, "body" => "hijack"}),
                   :error,
                   %{reason: "forbidden"}

      assert_reply push(guest, "idea:delete", %{"id" => theirs.id}), :error, %{
        reason: "forbidden"
      }

      assert_reply push(guest, "idea:update", %{"id" => mine.id, "body" => "edited"}), :ok, %{
        idea: %{body: "edited"}
      }

      assert_reply push(facil, "idea:update", %{
                     "id" => to_string(mine.id),
                     "body" => "by facilitator"
                   }),
                   :ok,
                   %{idea: %{body: "by facilitator"}}

      id = mine.id
      assert_reply push(facil, "idea:delete", %{"id" => mine.id}), :ok, %{id: ^id}
      assert_broadcast "idea:deleted", %{id: ^id}
      refute Ideas.get_idea(retro.id, mine.id)
    end

    test "ids from another retro are not found", %{facilitator: f} do
      retro = retro_fixture(f, %{stage: "idea-generation"})
      other = retro_fixture(f, %{stage: "idea-generation"})
      foreign = idea_fixture(other, f)
      socket = room(f, retro)

      assert_reply push(socket, "idea:update", %{"id" => foreign.id, "body" => "x"}), :error, %{
        reason: "not_found"
      }

      assert_reply push(socket, "idea:delete", %{"id" => foreign.id}), :error, %{
        reason: "not_found"
      }

      assert_reply push(socket, "idea:delete", %{"id" => "abc"}), :error, %{reason: "not_found"}
      assert Ideas.get_idea(other.id, foreign.id)
    end

    test "deleting during grouping re-syncs groups", %{facilitator: f} do
      retro = retro_fixture(f, %{stage: "grouping"})
      idea = idea_fixture(retro, f, %{x: 0.0, y: 0.0})
      {:ok, _} = Groups.sync(retro.id)
      socket = room(f, retro)

      assert_reply push(socket, "idea:delete", %{"id" => idea.id}), :ok, _
      assert_broadcast "groups:synced", %{groups: [], ideas: []}
    end
  end

  describe "board" do
    test "drag relays to others without persisting", %{facilitator: f} do
      retro = retro_fixture(f, %{stage: "grouping"})
      idea = idea_fixture(retro, f, %{x: 0.0, y: 0.0})
      socket = room(f, retro)

      assert_reply push(socket, "idea:drag", %{"id" => idea.id, "x" => 10, "y" => 20}), :ok, _
      user_id = f.id
      id = idea.id
      assert_broadcast "idea:dragged", %{id: ^id, x: 10, y: 20, user_id: ^user_id}
      assert Repo.reload!(idea).x == 0.0
    end

    test "move persists, regroups and broadcasts groups:synced", %{facilitator: f, guest: g} do
      retro = retro_fixture(f, %{stage: "grouping"})
      a = idea_fixture(retro, f, %{x: 0.0, y: 0.0})
      b = idea_fixture(retro, f, %{x: 1000.0, y: 0.0})
      {:ok, _} = Groups.sync(retro.id)
      socket = room(g, retro)

      assert_reply push(socket, "idea:move", %{"id" => b.id, "x" => 40, "y" => 30}), :ok, _
      assert_broadcast "groups:synced", %{groups: [_], ideas: ideas}
      assert %{x: 40.0, y: 30.0} = Enum.find(ideas, &(&1.id == b.id))
      assert Repo.reload!(a).group_id == Repo.reload!(b).group_id
    end

    test "move is rejected outside board stages and for bad coordinates", %{facilitator: f} do
      retro = retro_fixture(f, %{stage: "voting"})
      idea = idea_fixture(retro, f, %{x: 0.0, y: 0.0})
      socket = room(f, retro)

      assert_reply push(socket, "idea:move", %{"id" => idea.id, "x" => 1, "y" => 1}), :error, %{
        reason: "invalid_stage"
      }

      Repo.update!(Ecto.Changeset.change(retro, stage: "grouping"))

      assert_reply push(socket, "idea:move", %{"id" => idea.id, "x" => "1", "y" => 1}), :error, %{
        reason: "invalid"
      }
    end

    test "group:update sets a user label", %{facilitator: f, guest: g} do
      retro = retro_fixture(f, %{stage: "grouping"})
      group = group_fixture(retro)
      socket = room(g, retro)

      assert_reply push(socket, "group:update", %{"id" => group.id, "label" => " Tooling "}),
                   :ok,
                   %{group: %{label: "Tooling"}}

      assert_broadcast "group:updated", %{group: %{label: "Tooling", label_source: "user"}}
    end

    test "mutations are rejected while AI is busy", %{facilitator: f} do
      retro = retro_fixture(f, %{stage: "grouping"}) |> update_fixture!(%{ai_status: "grouping"})
      idea = idea_fixture(retro, f, %{x: 0.0, y: 0.0})
      group = group_fixture(retro)
      socket = room(f, retro)

      for {event, payload} <- [
            {"idea:move", %{"id" => idea.id, "x" => 1, "y" => 1}},
            {"idea:drag", %{"id" => idea.id, "x" => 1, "y" => 1}},
            {"idea:create", %{"category" => "happy", "body" => "x"}},
            {"idea:delete", %{"id" => idea.id}},
            {"group:update", %{"id" => group.id, "label" => "x"}},
            {"retro:stage", %{"stage" => "voting"}}
          ] do
        ref = push(socket, event, payload)
        assert_reply ref, :error, %{reason: "ai_busy"}
      end
    end
  end

  describe "votes" do
    test "limit of 3 per user per retro, own votes only", %{facilitator: f, guest: g} do
      retro = retro_fixture(f, %{stage: "voting"})
      group = group_fixture(retro)
      guest = room(g, retro)
      facil = room(f, retro)

      for _ <- 1..3,
          do: assert_reply(push(guest, "vote:create", %{"group_id" => group.id}), :ok, %{vote: _})

      assert_reply push(guest, "vote:create", %{"group_id" => group.id}), :error, %{
        reason: "vote_limit"
      }

      assert_broadcast "vote:created", %{vote: vote}

      assert_reply push(facil, "vote:delete", %{"id" => vote.id}), :error, %{reason: "forbidden"}
      vote_id = vote.id
      assert_reply push(guest, "vote:delete", %{"id" => vote.id}), :ok, %{id: ^vote_id}
      assert_broadcast "vote:deleted", %{id: ^vote_id}
      assert_reply push(guest, "vote:create", %{"group_id" => group.id}), :ok, _
    end

    test "only during voting and only on this retro's groups", %{facilitator: f} do
      retro = retro_fixture(f, %{stage: "voting"})
      foreign = group_fixture(retro_fixture(f))
      socket = room(f, retro)

      assert_reply push(socket, "vote:create", %{"group_id" => foreign.id}), :error, %{
        reason: "not_found"
      }

      Repo.update!(Ecto.Changeset.change(retro, stage: "grouping"))

      assert_reply push(socket, "vote:create", %{"group_id" => foreign.id}), :error, %{
        reason: "invalid_stage"
      }
    end
  end

  describe "retro" do
    test "stage changes: facilitator only, adjacent only, snapshot broadcast", %{
      facilitator: f,
      guest: g
    } do
      retro = retro_fixture(f)

      assert_reply push(room(g, retro), "retro:stage", %{"stage" => "prime-directive"}),
                   :error,
                   %{reason: "forbidden"}

      socket = room(f, retro)

      assert_reply push(socket, "retro:stage", %{"stage" => "grouping"}), :error, %{
        reason: "invalid_stage"
      }

      assert_reply push(socket, "retro:stage", %{"stage" => "prime-directive"}), :ok, %{
        retro: %{stage: "prime-directive"}
      }

      assert_broadcast "snapshot", %{
        retro: %{stage: "prime-directive"},
        ideas: [],
        groups: [],
        votes: []
      }
    end

    test "entering grouping does not start AI when the facilitator isn't allow-listed", %{
      facilitator: f
    } do
      retro = retro_fixture(f, %{stage: "idea-generation"})
      socket = room(f, retro)

      assert_reply push(socket, "retro:stage", %{"stage" => "grouping"}), :ok, _
    end

    test "re-opening a closed retro", %{facilitator: f} do
      retro = retro_fixture(f, %{stage: "closed"})
      socket = room(f, retro)

      assert_reply push(socket, "retro:stage", %{"stage" => "action-items"}), :ok, %{
        retro: %{stage: "action-items"}
      }

      assert_broadcast "snapshot", %{retro: %{stage: "action-items"}}
    end

    test "facilitator hand-over", %{facilitator: f, guest: g} do
      retro = retro_fixture(f)
      guest = room(g, retro)

      assert_reply push(guest, "retro:facilitator", %{"user_id" => g.id}), :error, %{
        reason: "forbidden"
      }

      assert_reply push(room(f, retro), "retro:facilitator", %{"user_id" => g.id}), :ok, _
      gid = g.id
      assert_broadcast "retro:updated", %{retro: %{facilitator_id: ^gid}}
    end

    test "typing is relayed to others", %{facilitator: f} do
      socket = room(f, retro_fixture(f))
      uid = f.id
      assert_reply push(socket, "user:typing", %{}), :ok, _
      assert_broadcast "user:typing", %{user_id: ^uid}
    end

    test "unknown events are rejected", %{facilitator: f} do
      socket = room(f, retro_fixture(f))
      assert_reply push(socket, "bogus", %{}), :error, %{reason: "invalid"}
    end
  end

  describe "timer" do
    test "the facilitator runs it and everyone gets the new state", %{facilitator: f} do
      retro = retro_fixture(f, %{stage: "idea-generation"})
      socket = room(f, retro)

      assert_reply push(socket, "timer:command", %{"command" => "set_minutes", "minutes" => 4}),
                   :ok,
                   %{timer: %{status: "idle", duration_ms: 240_000}}

      assert_reply push(socket, "timer:command", %{"command" => "start"}), :ok, %{
        timer: %{status: "running"}
      }

      assert_broadcast "timer:updated", %{timer: %{status: "running"}}

      assert_reply push(socket, "timer:command", %{"command" => "pause"}), :ok, %{
        timer: %{status: "paused", remaining_ms: remaining}
      }

      assert remaining in 230_000..240_000

      assert_reply push(socket, "timer:command", %{"command" => "reset"}), :ok, %{
        timer: %{status: "idle", remaining_ms: 240_000}
      }
    end

    test "only the facilitator, only in timed stages, only known commands", %{
      facilitator: f,
      guest: g
    } do
      retro = retro_fixture(f, %{stage: "voting"})

      assert_reply push(room(g, retro), "timer:command", %{"command" => "start"}), :error, %{
        reason: "forbidden"
      }

      socket = room(f, retro)

      assert_reply push(socket, "timer:command", %{"command" => "explode"}), :error, %{
        reason: "invalid"
      }

      assert_reply push(socket, "timer:command", %{"command" => "set_minutes", "minutes" => "4"}),
                   :error,
                   %{reason: "invalid"}

      assert_reply push(socket, "timer:command", %{"command" => "pause"}), :error, %{
        reason: "timer_changed",
        timer: %{status: "idle"}
      }

      Repo.update!(Ecto.Changeset.change(retro, stage: "action-items"))

      assert_reply push(socket, "timer:command", %{"command" => "start"}), :error, %{
        reason: "invalid_stage"
      }
    end

    test "changing stage resets it, and the snapshot carries it", %{facilitator: f} do
      retro = retro_fixture(f, %{stage: "idea-generation"})
      socket = room(f, retro)

      assert_reply push(socket, "timer:command", %{"command" => "set_minutes", "minutes" => 5}),
                   :ok,
                   _

      assert_reply push(socket, "timer:command", %{"command" => "start"}), :ok, _

      assert {:ok, _} = Retros.change_stage(retro, "prime-directive", f.id)

      assert_broadcast "snapshot", %{
        timer: %{status: "idle", duration_ms: 180_000, remaining_ms: 180_000}
      }
    end
  end
end
