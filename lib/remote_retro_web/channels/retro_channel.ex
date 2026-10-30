defmodule RemoteRetroWeb.RetroChannel do
  @moduledoc """
  Real-time room for a single retro. Joins reply with a full snapshot;
  see the contract in the project notes for every event.

  Every handler re-reads the retro (stage, facilitator and `ai_status` change
  underneath us) and scopes lookups to `socket.assigns.retro_id`. Successful
  writes reply with the authoritative record and broadcast to everyone else;
  board regrouping (`groups:synced`) and room-wide state go to everyone.
  """
  use RemoteRetroWeb, :channel

  alias RemoteRetro.{Accounts, Groups, Ideas, Retros, Votes}
  alias RemoteRetroWeb.Presence
  alias RemoteRetroWeb.RetroChannel.Reply

  @impl true
  def join("retro:" <> retro_id, _params, socket) do
    with %Retros.Retro{} = retro <- Retros.get_retro(retro_id),
         %Accounts.User{} = user <- Accounts.get_user(socket.assigns.user_id) do
      :ok = Retros.participate(retro, user.id)
      send(self(), :after_join)
      {:ok, Retros.snapshot(retro.id, user), assign(socket, retro_id: retro.id, user: user)}
    else
      nil -> {:error, %{reason: "not_found"}}
    end
  end

  @impl true
  def handle_info(:after_join, socket) do
    user = socket.assigns.user
    # Participants who joined after others already loaded the room need to reach them.
    broadcast_from!(socket, "user:joined", %{user: user})

    {:ok, _} =
      Presence.track(socket, to_string(user.id), %{
        user_id: user.id,
        online_at: System.system_time(:second)
      })

    push(socket, "presence_state", Presence.list(socket))
    {:noreply, socket}
  end

  @impl true
  def handle_in("idea:create", params, socket) do
    case Ideas.create_idea(
           retro(socket),
           user_id(socket),
           take(params, ~w(category body assignee_id))
         ) do
      {:ok, idea} ->
        broadcast_from!(socket, "idea:upserted", %{idea: idea})
        Reply.ok(socket, %{idea: idea})

      error ->
        Reply.error(socket, error)
    end
  end

  def handle_in("idea:update", params, socket) do
    with {:ok, id} <- Reply.id(params, "id"),
         {:ok, idea} <-
           Ideas.update_idea(
             retro(socket),
             user_id(socket),
             id,
             take(params, ~w(category body assignee_id))
           ) do
      broadcast_from!(socket, "idea:upserted", %{idea: idea})
      Reply.ok(socket, %{idea: idea})
    else
      error -> Reply.error(socket, error)
    end
  end

  def handle_in("idea:delete", params, socket) do
    with {:ok, id} <- Reply.id(params, "id"),
         {:ok, %{idea: idea, synced: synced}} <-
           Ideas.delete_idea(retro(socket), user_id(socket), id) do
      broadcast_from!(socket, "idea:deleted", %{id: idea.id})
      if synced, do: broadcast!(socket, "groups:synced", synced)
      Reply.ok(socket, %{id: idea.id})
    else
      error -> Reply.error(socket, error)
    end
  end

  def handle_in("idea:drag", %{"x" => x, "y" => y} = params, socket)
      when is_number(x) and is_number(y) do
    with {:ok, id} <- Reply.id(params, "id"),
         :ok <- Ideas.authorize_drag(retro(socket), id) do
      broadcast_from!(socket, "idea:dragged", %{id: id, x: x, y: y, user_id: user_id(socket)})
      Reply.ok(socket, %{})
    else
      error -> Reply.error(socket, error)
    end
  end

  def handle_in("idea:move", params, socket) do
    with {:ok, id} <- Reply.id(params, "id"),
         {:ok, synced} <- Ideas.move_idea(retro(socket), id, params["x"], params["y"]) do
      broadcast!(socket, "groups:synced", synced)
      Reply.ok(socket, %{})
    else
      error -> Reply.error(socket, error)
    end
  end

  def handle_in("group:update", params, socket) do
    with {:ok, id} <- Reply.id(params, "id"),
         {:ok, group} <- Groups.update_label(retro(socket), id, params["label"]) do
      broadcast!(socket, "group:updated", %{group: group})
      Reply.ok(socket, %{group: group})
    else
      error -> Reply.error(socket, error)
    end
  end

  def handle_in("vote:create", params, socket) do
    with {:ok, group_id} <- Reply.id(params, "group_id"),
         {:ok, vote} <- Votes.create_vote(retro(socket), user_id(socket), group_id) do
      broadcast_from!(socket, "vote:created", %{vote: vote})
      Reply.ok(socket, %{vote: vote})
    else
      error -> Reply.error(socket, error)
    end
  end

  def handle_in("vote:delete", params, socket) do
    with {:ok, id} <- Reply.id(params, "id"),
         {:ok, vote} <- Votes.delete_vote(retro(socket), user_id(socket), id) do
      broadcast_from!(socket, "vote:deleted", %{id: vote.id})
      Reply.ok(socket, %{id: vote.id})
    else
      error -> Reply.error(socket, error)
    end
  end

  # The snapshot broadcast is sent by `Retros.change_stage/3` itself.
  def handle_in("retro:stage", %{"stage" => stage}, socket) do
    case Retros.change_stage(retro(socket), stage, user_id(socket)) do
      {:ok, retro} -> Reply.ok(socket, %{retro: retro})
      error -> Reply.error(socket, error)
    end
  end

  def handle_in("retro:facilitator", params, socket) do
    with {:ok, new_id} <- Reply.id(params, "user_id"),
         {:ok, retro} <- Retros.change_facilitator(retro(socket), user_id(socket), new_id) do
      broadcast!(socket, "retro:updated", %{retro: retro})
      Reply.ok(socket, %{retro: retro})
    else
      error -> Reply.error(socket, error)
    end
  end

  def handle_in("timer:command", %{"command" => command} = params, socket) do
    with {:ok, command} <- timer_command(command, params),
         {:ok, timer} <- Retros.timer_command(retro(socket), user_id(socket), command) do
      broadcast!(socket, "timer:updated", %{timer: timer})
      Reply.ok(socket, %{timer: timer})
    else
      error ->
        # Clients update optimistically; the current timer lets them snap back to the truth.
        {:reply, {:error, payload}, socket} = Reply.error(socket, error)
        timer = RemoteRetro.Timer.view(retro(socket))
        {:reply, {:error, Map.put(payload, :timer, timer)}, socket}
    end
  end

  def handle_in("ai:regroup", _params, socket) do
    case Retros.regroup(retro(socket), user_id(socket)) do
      {:ok, status} -> Reply.ok(socket, %{status: Atom.to_string(status)})
      error -> Reply.error(socket, error)
    end
  end

  def handle_in("user:typing", _params, socket) do
    broadcast_from!(socket, "user:typing", %{user_id: user_id(socket)})
    Reply.ok(socket, %{})
  end

  if Application.compile_env(:remote_retro, :dev_routes) do
    # Dev-only test data (see RemoteRetro.DevSeed); the clause doesn't exist in prod.
    def handle_in("dev:seed_ideas", _params, socket) do
      case RemoteRetro.DevSeed.seed_ideas(retro(socket)) do
        {:ok, count} ->
          RemoteRetro.Broadcast.snapshot(socket.assigns.retro_id)
          Reply.ok(socket, %{count: count})

        error ->
          Reply.error(socket, error)
      end
    end
  end

  def handle_in(_event, _params, socket), do: Reply.error(socket, {:error, :invalid})

  defp retro(socket), do: Retros.get_retro!(socket.assigns.retro_id)

  defp user_id(socket), do: socket.assigns.user.id

  defp take(params, keys), do: Map.take(params, keys)

  defp timer_command("start", _params), do: {:ok, :start}
  defp timer_command("pause", _params), do: {:ok, :pause}
  defp timer_command("reset", _params), do: {:ok, :reset}

  defp timer_command("set_minutes", %{"minutes" => minutes}) when is_integer(minutes),
    do: {:ok, {:set_minutes, minutes}}

  defp timer_command(_command, _params), do: {:error, :invalid}
end
