import { Presence } from "phoenix"
import type { RetroChannel } from "../channel"
import type { AppDispatch } from "./index"
import {
  groupUpserted,
  groupsReplaced,
  ideaPositionsSynced,
  ideaRemoved,
  ideaUpserted,
  presenceSynced,
  reactionExpired,
  reactionReceived,
  retroUpdated,
  snapshotReceived,
  timerUpdated,
  toastShown,
  userTyping,
  userUpserted,
  voteAdded,
  voteRemoved,
} from "./slices"

const TYPING_TIMEOUT_MS = 3000
/** How long a reaction stays by its sender's name. */
export const REACTION_MS = 15_000

/**
 * Maps every server broadcast onto a store action. `idea:dragged` is not handled
 * here: the board subscribes to it directly so remote drags don't churn the store.
 */
export function bindChannel(channel: RetroChannel, dispatch: AppDispatch): void {
  channel.on("snapshot", (snapshot) => dispatch(snapshotReceived(snapshot)))
  channel.on("retro:updated", ({ retro }) => dispatch(retroUpdated(retro)))
  channel.on("user:joined", ({ user }) => dispatch(userUpserted(user)))
  channel.on("idea:upserted", ({ idea }) => dispatch(ideaUpserted(idea)))
  channel.on("idea:deleted", ({ id }) => dispatch(ideaRemoved(id)))
  channel.on("groups:synced", ({ groups, ideas }) => {
    dispatch(groupsReplaced(groups))
    dispatch(ideaPositionsSynced(ideas))
  })
  channel.on("group:updated", ({ group }) => dispatch(groupUpserted(group)))
  channel.on("vote:created", ({ vote }) => dispatch(voteAdded(vote)))
  channel.on("vote:deleted", ({ id }) => dispatch(voteRemoved(id)))
  channel.on("timer:updated", ({ timer }) => dispatch(timerUpdated(timer)))
  channel.on("ai:error", ({ message }) => dispatch(toastShown("error", message)))

  const typingTimers = new Map<number, ReturnType<typeof setTimeout>>()
  channel.on("user:typing", ({ user_id }) => {
    clearTimeout(typingTimers.get(user_id))
    dispatch(userTyping({ userId: user_id, typing: true }))
    typingTimers.set(
      user_id,
      setTimeout(() => dispatch(userTyping({ userId: user_id, typing: false })), TYPING_TIMEOUT_MS),
    )
  })

  // A newer reaction from the same person replaces theirs and restarts the clock.
  const reactionTimers = new Map<number, ReturnType<typeof setTimeout>>()
  channel.on("user:reaction", ({ user_id, emoji }) => {
    clearTimeout(reactionTimers.get(user_id))
    dispatch(reactionReceived({ userId: user_id, emoji }))
    reactionTimers.set(user_id, setTimeout(() => dispatch(reactionExpired(user_id)), REACTION_MS))
  })

  const presence = new Presence(channel.raw)
  presence.onSync(() => {
    const state: Record<string, { metas: { user_id: number; online_at: number; phx_ref: string }[] }> = {}
    presence.list((key, entry) => {
      state[key] = entry
    })
    dispatch(presenceSynced(state))
  })
}
