defmodule RemoteRetro.Retros do
  @moduledoc "Retros, participation and the full-state snapshot sent to clients."
  require Logger
  import Ecto.Query

  alias RemoteRetro.{
    Accounts,
    AI,
    Broadcast,
    Emails,
    Formats,
    Groups,
    Layout,
    Mailer,
    Repo,
    Stages,
    Timer
  }

  alias RemoteRetro.Retros.{Retro, Participation}
  alias RemoteRetro.Accounts.User
  alias RemoteRetro.Ideas.Idea
  alias RemoteRetro.Groups.Group
  alias RemoteRetro.Votes.Vote

  def get_retro(id) do
    case Ecto.UUID.cast(id) do
      {:ok, uuid} -> Repo.get(Retro, uuid)
      :error -> nil
    end
  end

  def get_retro!(id), do: Repo.get!(Retro, id)

  def create_retro(%User{id: user_id}, format) do
    Repo.transact(fn ->
      with {:ok, retro} <-
             %Retro{}
             |> Retro.create_changeset(%{format: format, facilitator_id: user_id})
             |> Repo.insert(),
           :ok <- participate(retro, user_id) do
        {:ok, retro}
      end
    end)
  end

  @doc "Retros the user has participated in, newest first."
  def list_retros_for_user(%User{id: user_id}, limit \\ 20) do
    Repo.all(
      from r in Retro,
        join: p in Participation,
        on: p.retro_id == r.id and p.user_id == ^user_id,
        order_by: [desc: r.inserted_at],
        limit: ^limit
    )
  end

  def participate(%Retro{id: retro_id}, user_id) do
    now = DateTime.utc_now()

    Repo.insert_all(
      Participation,
      [%{retro_id: retro_id, user_id: user_id, inserted_at: now, updated_at: now}],
      on_conflict: :nothing,
      conflict_target: [:user_id, :retro_id]
    )

    :ok
  end

  def facilitator?(%Retro{facilitator_id: fid}, user_id), do: fid == user_id

  def participant?(retro_id, user_id) do
    Repo.exists?(
      from p in Participation, where: p.retro_id == ^retro_id and p.user_id == ^user_id
    )
  end

  @doc "Re-reads the retro holding a row lock until the surrounding transaction ends."
  def lock_retro!(retro_id),
    do: Repo.one!(from r in Retro, where: r.id == ^retro_id, lock: "FOR UPDATE")

  # Facilitator-triggered AI re-groupings allowed per retro. Each one is a paid model call,
  # so the cap is enforced here (atomically, in the database), not just by hiding the button.
  @max_regroups 2

  def max_regroups, do: @max_regroups

  @doc """
  Facilitator-only: re-runs AI grouping in Group & label, at most `max_regroups/0` times per
  retro. The facilitator must be allowed to use AI (`RemoteRetro.AI.Access`); guests in
  the room don't matter, and a facilitator who isn't allowed is rejected even if a
  colleague who is allowed is participating. Only ideas that aren't already in a group
  are considered, so groups people (or an earlier pass) made stay as they are. Returns
  `{:ok, :started}`, or `{:ok, :nothing_to_group}` when fewer than two ideas are left
  ungrouped (which doesn't use up a re-run). Errors include `:regroup_limit` and
  `:ai_forbidden`.
  """
  def regroup(%Retro{} = retro, actor_id) do
    with :ok <- ensure_facilitator(retro, actor_id),
         :ok <- ensure_stage(retro, "grouping"),
         :ok <- ensure_ai_idle(retro),
         :ok <- ensure_ai_access(actor_id),
         :ok <- claim_regroup(retro.id) do
      case AI.Runner.start(:grouping, retro.id) do
        # The runner broadcasts the retro (now busy, with the new count) to everyone.
        :ok ->
          {:ok, :started}

        :skipped ->
          release_regroup(retro.id)
          {:ok, :nothing_to_group}
      end
    end
  end

  # Takes one re-run in a single conditional UPDATE, so concurrent presses can't exceed the cap.
  defp claim_regroup(retro_id) do
    {count, _} =
      Repo.update_all(
        from(r in Retro, where: r.id == ^retro_id and r.ai_regroups < ^@max_regroups),
        inc: [ai_regroups: 1]
      )

    if count == 1, do: :ok, else: {:error, :regroup_limit}
  end

  defp release_regroup(retro_id) do
    Repo.update_all(from(r in Retro, where: r.id == ^retro_id and r.ai_regroups > 0),
      inc: [ai_regroups: -1]
    )
  end

  @doc "Guards shared by mutations: the retro must not be mid AI pass."
  def ensure_ai_idle(%Retro{ai_status: nil}), do: :ok
  def ensure_ai_idle(%Retro{}), do: {:error, :ai_busy}

  # `:ai_disabled` when Gemini isn't configured, so a missing project isn't reported
  # as an org mismatch. `:ai_forbidden` when it is configured and this user isn't allowed.
  defp ensure_ai_access(user_id) do
    cond do
      not AI.enabled?() -> {:error, :ai_disabled}
      ai_member?(user_id) -> :ok
      true -> {:error, :ai_forbidden}
    end
  end

  # Membership only. Callers that talk to the runner let it no-op when Gemini is off.
  defp ai_member?(user_id) when is_integer(user_id) do
    case Accounts.get_user(user_id) do
      %User{} = user -> AI.Access.member?(user)
      _ -> false
    end
  end

  defp ai_member?(_user_id), do: false

  def ensure_stage(%Retro{stage: stage}, stages) when is_list(stages),
    do: if(stage in stages, do: :ok, else: {:error, :invalid_stage})

  def ensure_stage(retro, stage), do: ensure_stage(retro, [stage])

  def ensure_facilitator(retro, user_id),
    do: if(facilitator?(retro, user_id), do: :ok, else: {:error, :forbidden})

  @doc """
  Facilitator-only: runs a `RemoteRetro.Timer` command (`:start`, `:pause`, `:reset`,
  `{:set_minutes, n}`) in a timed stage. Returns `{:ok, timer_view}`.
  """
  def timer_command(%Retro{id: retro_id}, actor_id, command) do
    Repo.transact(fn ->
      retro = lock_retro!(retro_id)
      now = DateTime.utc_now()

      with :ok <- ensure_facilitator(retro, actor_id),
           :ok <- if(Timer.timed_stage?(retro.stage), do: :ok, else: {:error, :invalid_stage}),
           {:ok, attrs} <- Timer.command(command, retro, now),
           {:ok, updated} <- update_retro(retro, attrs) do
        {:ok, Timer.view(updated, now)}
      end
    end)
  end

  @doc """
  Moves the retro one stage forward or back on behalf of the facilitator.
  Every move resets the stage timer (`RemoteRetro.Timer`) to idle.

  Entering `grouping` lays out unpositioned ideas and syncs groups; moving
  forward from `grouping` to `voting` syncs groups once more. After commit,
  every client gets a fresh `snapshot` and, on entering `grouping`, the AI
  runner is started for a grouping pass when the facilitator is allowed to use
  AI and it hasn't succeeded yet (the runner decides whether AI is enabled).
  Groups left unlabeled stay unlabeled: nothing is auto-labeled on the way into
  `voting`.

  Moving forward into `closed` emails the action items to every participant
  (see `deliver_action_items/1`), in the background unless `:async_mail` is
  false. Moving back from `closed` re-opens the retro with no side effects.
  """
  def change_stage(%Retro{id: retro_id}, to_stage, actor_id) do
    result =
      Repo.transact(fn ->
        retro = lock_retro!(retro_id)

        with :ok <- ensure_facilitator(retro, actor_id),
             :ok <- ensure_ai_idle(retro),
             :ok <- ensure_adjacent(retro.stage, to_stage),
             {:ok, updated} <-
               update_retro(retro, Map.put(Timer.reset_attrs(), :stage, to_stage)),
             :ok <- enter_stage(retro.stage, updated) do
          {:ok, {retro.stage, updated}}
        end
      end)

    with {:ok, {from, retro}} <- result do
      # Start the AI first: it marks the retro busy synchronously, so the snapshot
      # below already carries `ai_status` and clients never see an idle new stage
      # flash before the busy overlay. Snapshots read fresh state, so even a very
      # fast AI pass can't leave clients stale.
      start_ai(from, retro)
      Broadcast.snapshot(retro.id)
      after_commit(from, retro)
      {:ok, Repo.reload!(retro)}
    end
  end

  defp ensure_adjacent(from, to) when is_binary(to),
    do:
      if(Stages.valid?(to) and Stages.adjacent?(from, to),
        do: :ok,
        else: {:error, :invalid_stage}
      )

  defp ensure_adjacent(_from, _to), do: {:error, :invalid_stage}

  defp enter_stage(_from, %Retro{stage: "grouping", id: id}) do
    {:ok, _} = Layout.place_unpositioned(id)
    {:ok, _} = Groups.sync(id)
    :ok
  end

  defp enter_stage("grouping", %Retro{stage: "voting", id: id}) do
    {:ok, _} = Groups.sync(id)
    :ok
  end

  defp enter_stage(_from, %Retro{}), do: :ok

  # The acting facilitator has to be allowed. Outside participants don't unlock a pass,
  # and a pass started by an allowed facilitator still updates the whole room.
  defp start_ai(_from, %Retro{
         stage: "grouping",
         ai_grouped_at: nil,
         facilitator_id: facilitator_id,
         id: id
       }) do
    if ai_member?(facilitator_id), do: AI.Runner.start(:grouping, id), else: :skipped
  end

  defp start_ai(_from, %Retro{}), do: :skipped

  defp after_commit("action-items", %Retro{stage: "closed", id: id}) do
    if Application.get_env(:remote_retro, :async_mail, true) do
      {:ok, _pid} =
        Task.Supervisor.start_child(RemoteRetro.TaskSupervisor, fn -> deliver_and_log(id) end)

      :ok
    else
      deliver_and_log(id)
    end
  end

  defp after_commit(_from, %Retro{}), do: :ok

  defp deliver_and_log(retro_id) do
    case deliver_action_items(retro_id) do
      {:error, reason} ->
        Logger.warning(
          "Action-item email for retro #{retro_id} failed: #{inspect(mail_error(reason))}"
        )

      _ ->
        :ok
    end
  rescue
    e ->
      Logger.error("Action-item email for retro #{retro_id} crashed: #{inspect(e.__struct__)}")
  end

  # Adapter errors can echo the request (addresses, idea text); log the shape only.
  defp mail_error({status, _body}) when is_integer(status), do: {:http_status, status}
  defp mail_error(reason) when is_atom(reason), do: reason
  defp mail_error(%{__struct__: struct}), do: struct
  defp mail_error(_), do: :unknown

  @doc """
  Emails the retro's action items to each participant with an address, one
  message each. Returns:

    * `:skipped` when there are no action items
    * `:unchanged` when these exact action items (id, body, owner) were
      already emailed for this retro, so re-closing doesn't spam
    * `{:ok, sent_count}` after sending; the digest is stored first
    * `{:error, reason}` when nothing could be sent (the digest is restored,
      so the next close tries again)
  """
  def deliver_action_items(retro_id) do
    items = list_action_items(retro_id)

    if items == [] do
      :skipped
    else
      digest = action_items_digest(items)
      retro = get_retro!(retro_id)

      if claim_digest(retro_id, digest) do
        send_action_items(retro, items, digest)
      else
        :unchanged
      end
    end
  end

  defp send_action_items(retro, items, digest) do
    results =
      retro
      |> Emails.action_items(items, list_participants(retro.id))
      |> Enum.map(&Mailer.deliver/1)

    case Enum.split_with(results, &match?({:ok, _}, &1)) do
      {[], [{:error, reason} | _]} ->
        Repo.update_all(
          from(r in Retro, where: r.id == ^retro.id and r.action_items_emailed_digest == ^digest),
          set: [action_items_emailed_digest: retro.action_items_emailed_digest]
        )

        {:error, reason}

      {sent, failed} ->
        if failed != [],
          do: Logger.warning("Action-item email for retro #{retro.id}: #{length(failed)} failed")

        {:ok, length(sent)}
    end
  end

  # Atomically records the digest; false when it was already the stored one.
  defp claim_digest(retro_id, digest) do
    {count, _} =
      Repo.update_all(
        from(r in Retro,
          where:
            r.id == ^retro_id and
              (is_nil(r.action_items_emailed_digest) or r.action_items_emailed_digest != ^digest)
        ),
        set: [action_items_emailed_digest: digest]
      )

    count == 1
  end

  @doc "Action items of a retro, oldest first, with `:assignee` preloaded."
  def list_action_items(retro_id) do
    Repo.all(
      from i in Idea,
        where: i.retro_id == ^retro_id and i.category == ^Formats.action_item(),
        order_by: i.id,
        preload: :assignee
    )
  end

  @doc "sha256 (hex) of the action items' `{id, body, assignee_id}`, order-independent."
  def action_items_digest(items) do
    items
    |> Enum.map(&[&1.id, &1.body, &1.assignee_id])
    |> Enum.sort()
    |> Jason.encode!()
    |> then(&:crypto.hash(:sha256, &1))
    |> Base.encode16(case: :lower)
  end

  @doc "Hands the facilitator role to another participant (current facilitator only)."
  def change_facilitator(%Retro{id: retro_id}, actor_id, user_id) do
    Repo.transact(fn ->
      retro = lock_retro!(retro_id)

      with :ok <- ensure_facilitator(retro, actor_id),
           :ok <- ensure_participant(retro_id, user_id) do
        update_retro(retro, %{facilitator_id: user_id})
      end
    end)
  end

  defp ensure_participant(retro_id, user_id) when is_integer(user_id),
    do: if(participant?(retro_id, user_id), do: :ok, else: {:error, :invalid})

  defp ensure_participant(_retro_id, _user_id), do: {:error, :invalid}

  def update_retro(%Retro{} = retro, attrs), do: retro |> Retro.changeset(attrs) |> Repo.update()

  def list_participants(retro_id) do
    Repo.all(
      from u in User,
        join: p in Participation,
        on: p.user_id == u.id and p.retro_id == ^retro_id,
        order_by: p.inserted_at
    )
  end

  @doc """
  Everything a client needs to render the room.

  Pass the joining user to include `ai_enabled` for that viewer (Gemini configured
  and their account may use it). Room-wide broadcasts omit it: the flag is per
  person, and a later snapshot must not turn AI controls on for someone else.
  """
  def snapshot(retro_id, viewer \\ nil)

  def snapshot(retro_id, %User{} = viewer) do
    retro_id |> snapshot_payload() |> Map.put(:ai_enabled, AI.available_to?(viewer))
  end

  def snapshot(retro_id, _viewer), do: snapshot_payload(retro_id)

  defp snapshot_payload(retro_id) do
    retro = get_retro!(retro_id)

    %{
      retro: retro,
      timer: Timer.view(retro),
      users: list_participants(retro_id),
      ideas: Repo.all(from i in Idea, where: i.retro_id == ^retro_id, order_by: i.id),
      groups: Repo.all(from g in Group, where: g.retro_id == ^retro_id, order_by: g.id),
      votes:
        Repo.all(
          from v in Vote,
            join: g in Group,
            on: g.id == v.group_id,
            where: g.retro_id == ^retro_id,
            order_by: v.id
        )
    }
  end
end
