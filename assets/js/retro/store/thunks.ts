import { PushError } from "../channel"
import { VOTE_LIMIT } from "../constants"
import type { Category, Group, Idea, Retro, Stage, TimerCommand, TimerState, Vote } from "../types"
import { createAppAsyncThunk } from "./hooks"
import type { AppDispatch } from "./index"
import { selectMyVotesLeft } from "./selectors"
import type { TimerSliceState } from "./slices"
import {
  groupUpserted,
  ideaRemoved,
  retroUpdated,
  ideaUpserted,
  timerCommandSent,
  timerCommandSettled,
  toastShown,
  voteAdded,
  voteRemoved,
} from "./slices"

const REASON_MESSAGES: Record<string, string> = {
  not_found: "It no longer exists.",
  forbidden: "You don't have permission to do that.",
  invalid_stage: "That isn't possible in the current stage.",
  ai_busy: "Ideas are still being grouped. Try again in a moment.",
  ai_disabled: "AI grouping isn't set up on this server.",
  ai_forbidden: "AI grouping isn't available for this account.",
  regroup_limit: "Grouping can only be re-run twice per retro.",
  timer_changed: "The timer changed. Try again.",
  vote_limit: `You've already used all ${VOTE_LIMIT} votes.`,
  invalid: "Please check what you entered and try again.",
  unknown: "Something went wrong. Please try again.",
  timeout: "The server didn't respond. Check your connection and try again.",
}

export function reasonOf(error: unknown): string {
  return error instanceof PushError ? error.reason : "unknown"
}

export function friendlyMessage(reason: string): string {
  return REASON_MESSAGES[reason] ?? "Something went wrong. Please try again."
}

/** Shows an error toast for a failed push and returns the reason (for rejectWithValue). */
function report(dispatch: AppDispatch, error: unknown, context: string): string {
  const reason = reasonOf(error)
  dispatch(toastShown("error", `${context} ${friendlyMessage(reason)}`))
  return reason
}

// Optimistic records use negative ids so they never collide with database ids.
let tempIdSeq = 0
export const nextTempId = () => --tempIdSeq
export const isTempId = (id: number) => id < 0

export interface CreateIdeaParams {
  category: Category
  body: string
  assignee_id?: number | null
}

export const createIdea = createAppAsyncThunk(
  "ideas/create",
  async (params: CreateIdeaParams, { dispatch, getState, extra, rejectWithValue }) => {
    const state = getState()
    const tempId = nextTempId()
    dispatch(
      ideaUpserted({
        id: tempId,
        retro_id: state.retro?.id ?? "",
        user_id: state.ui.currentUserId,
        category: params.category,
        body: params.body,
        x: null,
        y: null,
        group_id: null,
        assignee_id: params.assignee_id ?? null,
        inserted_at: new Date().toISOString(),
      }),
    )
    try {
      const reply = await extra.channel.push<"idea:create", { idea?: Idea }>("idea:create", params)
      dispatch(ideaRemoved(tempId))
      // The broadcast may also deliver it; upsert is idempotent.
      if (reply?.idea) dispatch(ideaUpserted(reply.idea))
      return reply?.idea ?? null
    } catch (error) {
      dispatch(ideaRemoved(tempId))
      return rejectWithValue(report(dispatch, error, "Your idea wasn't saved."))
    }
  },
)

export interface UpdateIdeaParams {
  id: number
  body?: string
  category?: Category
  assignee_id?: number | null
}

export const updateIdea = createAppAsyncThunk(
  "ideas/update",
  async (params: UpdateIdeaParams, { dispatch, getState, extra, rejectWithValue }) => {
    const previous = getState().ideas.entities[params.id]
    if (!previous) return rejectWithValue("not_found")
    dispatch(ideaUpserted({ ...previous, ...params }))
    try {
      const reply = await extra.channel.push<"idea:update", { idea?: Idea }>("idea:update", params)
      if (reply?.idea) dispatch(ideaUpserted(reply.idea))
      return reply?.idea ?? null
    } catch (error) {
      dispatch(ideaUpserted(previous))
      return rejectWithValue(report(dispatch, error, "Your edit wasn't saved."))
    }
  },
)

export const deleteIdea = createAppAsyncThunk(
  "ideas/delete",
  async (id: number, { dispatch, getState, extra, rejectWithValue }) => {
    const previous = getState().ideas.entities[id]
    if (!previous) return rejectWithValue("not_found")
    dispatch(ideaRemoved(id))
    try {
      await extra.channel.push("idea:delete", { id })
      return id
    } catch (error) {
      dispatch(ideaUpserted(previous))
      return rejectWithValue(report(dispatch, error, "That couldn't be deleted."))
    }
  },
)

export const createVote = createAppAsyncThunk(
  "votes/create",
  async (groupId: number, { dispatch, getState, extra, rejectWithValue }) => {
    const state = getState()
    if (selectMyVotesLeft(state) <= 0) {
      dispatch(toastShown("info", REASON_MESSAGES.vote_limit))
      return rejectWithValue("vote_limit")
    }
    const tempId = nextTempId()
    dispatch(voteAdded({ id: tempId, user_id: state.ui.currentUserId, group_id: groupId }))
    try {
      const reply = await extra.channel.push<"vote:create", { vote?: Vote }>("vote:create", { group_id: groupId })
      dispatch(voteRemoved(tempId))
      if (reply?.vote) dispatch(voteAdded(reply.vote))
      return reply?.vote ?? null
    } catch (error) {
      dispatch(voteRemoved(tempId))
      return rejectWithValue(report(dispatch, error, "Your vote wasn't counted."))
    }
  },
)

export const deleteVote = createAppAsyncThunk(
  "votes/delete",
  async (id: number, { dispatch, getState, extra, rejectWithValue }) => {
    const previous = getState().votes.entities[id]
    // An optimistic vote hasn't reached the server yet; nothing to retract.
    if (!previous || isTempId(id)) return rejectWithValue("not_found")
    dispatch(voteRemoved(id))
    try {
      await extra.channel.push("vote:delete", { id })
      return id
    } catch (error) {
      dispatch(voteAdded(previous))
      return rejectWithValue(report(dispatch, error, "Your vote wasn't removed."))
    }
  },
)

/** Retracts one of the current user's votes on a group. */
export const retractVoteOnGroup = createAppAsyncThunk(
  "votes/retractOnGroup",
  async (groupId: number, { dispatch, getState, rejectWithValue }) => {
    const { votes, ui } = getState()
    const mine = Object.values(votes.entities)
      .filter((v): v is Vote => v != null && v.user_id === ui.currentUserId && v.group_id === groupId && !isTempId(v.id))
      .sort((a, b) => b.id - a.id)
    if (mine.length === 0) return rejectWithValue("not_found")
    return dispatch(deleteVote(mine[0].id)).unwrap()
  },
)

export const updateGroupLabel = createAppAsyncThunk(
  "groups/updateLabel",
  async (params: { id: number; label: string }, { dispatch, getState, extra, rejectWithValue }) => {
    const previous = getState().groups.entities[params.id]
    if (!previous) return rejectWithValue("not_found")
    const label = params.label.trim() || null
    dispatch(groupUpserted({ ...previous, label, label_source: label ? "user" : null } satisfies Group))
    try {
      const reply = await extra.channel.push<"group:update", { group?: Group }>("group:update", params)
      if (reply?.group) dispatch(groupUpserted(reply.group))
      return params
    } catch (error) {
      dispatch(groupUpserted(previous))
      return rejectWithValue(report(dispatch, error, "The label wasn't saved."))
    }
  },
)

export const changeStage = createAppAsyncThunk(
  "retro/changeStage",
  async (stage: Stage, { dispatch, extra, rejectWithValue }) => {
    try {
      // The server broadcasts a full snapshot to everyone (sender included), so the
      // reply's retro isn't applied here: it would switch stages before the data arrives.
      await extra.channel.push("retro:stage", { stage })
      return stage
    } catch (error) {
      return rejectWithValue(report(dispatch, error, "The stage couldn't be changed."))
    }
  },
)

export const handOffFacilitator = createAppAsyncThunk(
  "retro/handOffFacilitator",
  async (userId: number, { dispatch, extra, rejectWithValue }) => {
    try {
      const reply = await extra.channel.push<"retro:facilitator", { retro?: Retro }>("retro:facilitator", {
        user_id: userId,
      })
      if (reply?.retro) dispatch(retroUpdated(reply.retro))
      return userId
    } catch (error) {
      return rejectWithValue(report(dispatch, error, "Facilitation couldn't be handed off."))
    }
  },
)

/** Fire-and-forget typing notification; callers throttle. */
export const sendTyping = createAppAsyncThunk("presence/sendTyping", async (_: void, { extra }) => {
  await extra.channel.push("user:typing", {}).catch(() => undefined)
})

/** Dev only: fill the retro with sample ideas. The server broadcasts a snapshot. */
export const seedSampleIdeas = createAppAsyncThunk(
  "dev/seedIdeas",
  async (_: void, { dispatch, extra, rejectWithValue }) => {
    try {
      const { count } = await extra.channel.push<"dev:seed_ideas", { count: number }>("dev:seed_ideas", {})
      dispatch(toastShown("info", `Added ${count} sample ideas.`))
      return count
    } catch (error) {
      return rejectWithValue(report(dispatch, error, "Sample ideas weren't added."))
    }
  },
)

/** Facilitator: run AI grouping again over ideas that aren't in a group yet. */
export const regroupIdeas = createAppAsyncThunk("ai/regroup", async (_: void, { dispatch, extra, rejectWithValue }) => {
  try {
    const { status } = await extra.channel.push<"ai:regroup", { status: string }>("ai:regroup", {})
    if (status === "nothing_to_group") dispatch(toastShown("info", "Every idea is already in a group."))
    return status
  } catch (error) {
    return rejectWithValue(report(dispatch, error, "Couldn't re-run grouping."))
  }
})

/** What a timer command will do, so the view can change before the server confirms it. */
export function predictTimer(timer: TimerSliceState, command: TimerCommand, now: number): TimerState {
  const remaining =
    timer.status === "running" ? Math.max(0, timer.remaining_ms - (now - timer.receivedAt)) : timer.remaining_ms
  switch (command.command) {
    case "start":
      return {
        ...timer,
        status: "running",
        remaining_ms: timer.status === "paused" ? timer.remaining_ms : timer.duration_ms,
      }
    case "pause":
      return { ...timer, status: "paused", remaining_ms: remaining }
    case "reset":
      return { ...timer, status: "idle", remaining_ms: timer.duration_ms }
    case "set_minutes":
      return { ...timer, duration_ms: command.minutes * 60_000, remaining_ms: command.minutes * 60_000 }
  }
}

/**
 * Applies the command optimistically, then takes the server's state: its reply on success, or the
 * current timer it sends back with an error; if the push never got an answer, the view reverts.
 * Rapid clicks don't flicker: only the last outstanding command's result is applied.
 */
export const commandTimer = createAppAsyncThunk(
  "timer/command",
  async (command: TimerCommand, { dispatch, getState, extra, rejectWithValue }) => {
    const before = getState().timer
    if (before) dispatch(timerCommandSent(predictTimer(before, command, performance.now())))
    const settle = (timer: TimerSliceState | null) => before && dispatch(timerCommandSettled(timer))
    try {
      const { timer } = await extra.channel.push<"timer:command", { timer: TimerState }>("timer:command", command)
      settle({ ...timer, receivedAt: performance.now(), inFlight: 0 })
      return timer
    } catch (error) {
      const serverTimer = error instanceof PushError ? (error.details.timer as TimerState | undefined) : undefined
      settle(serverTimer ? { ...serverTimer, receivedAt: performance.now(), inFlight: 0 } : { ...before!, inFlight: 0 })
      return rejectWithValue(report(dispatch, error, "Couldn't update the timer."))
    }
  },
)
