import { useId, useState } from "react"
import { VOTE_LIMIT } from "../constants"
import { emojiName } from "../emoji"
import { useAppDispatch, useAppSelector } from "../store/hooks"
import {
  selectContributors,
  selectCurrentUserId,
  selectIsFacilitator,
  selectReactionsByUser,
  selectRetro,
  selectStage,
  selectTypingUserIds,
  selectVoteCountsByUser,
  selectVotersRemaining,
} from "../store/selectors"
import { handOffFacilitator } from "../store/thunks"
import type { User } from "../types"
import { AddReaction } from "./AddReaction"
import { Avatar } from "./Avatar"
import { ConfirmDialog } from "./ConfirmDialog"

/**
 * Everyone online plus people who contributed and left, with facilitator badge, per-stage status
 * and facilitator hand-off (online only).
 */
export function UserList() {
  const dispatch = useAppDispatch()
  const contributors = useAppSelector(selectContributors)
  const [handOffTo, setHandOffTo] = useState<User | null>(null)
  const headingId = useId()
  const stage = useAppSelector(selectStage)

  return (
    <section aria-labelledby={headingId}>
      <div className="mb-2 flex items-center gap-2">
        <h2 id={headingId} className="flex items-center gap-2 text-sm font-semibold">
          Contributors <span className="badge badge-sm badge-ghost">{contributors.length}</span>
        </h2>
        {stage === "voting" && <VotingStatus />}
      </div>
      <ul aria-labelledby={headingId} className="space-y-1">
        {contributors.map(({ user, online }) => (
          <UserRow key={user.id} user={user} online={online} onHandOff={setHandOffTo} />
        ))}
      </ul>
      <ConfirmDialog
        open={handOffTo != null}
        title="Hand off facilitation"
        confirmLabel="Hand off"
        onCancel={() => setHandOffTo(null)}
        onConfirm={() => {
          if (handOffTo) dispatch(handOffFacilitator(handOffTo.id))
          setHandOffTo(null)
        }}
      >
        Make {handOffTo?.name} the facilitator? They'll control the stages and you won't be able to undo this
        yourself.
      </ConfirmDialog>
    </section>
  )
}

/** One participant. Offline rows are dimmed, have no online dot, and can't be handed facilitation. */
function UserRow({ user, online, onHandOff }: { user: User; online: boolean; onHandOff: (user: User) => void }) {
  const retro = useAppSelector(selectRetro)
  const currentUserId = useAppSelector(selectCurrentUserId)
  const isFacilitator = useAppSelector(selectIsFacilitator)
  const typing = useAppSelector(selectTypingUserIds)
  const voteCounts = useAppSelector(selectVoteCountsByUser)
  const reaction = useAppSelector(selectReactionsByUser)[user.id]

  const stage = retro?.stage
  const facilitator = user.id === retro?.facilitator_id
  const votes = voteCounts[user.id] ?? 0
  const me = user.id === currentUserId

  return (
    // `relative`: the reaction picker drops below the row.
    <li className="group relative flex items-center gap-2 rounded-box px-1 py-1.5 hover:bg-base-200">
      <div className={`relative ${online ? "" : "opacity-50 grayscale"}`}>
        <Avatar user={user} />
        {online && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-success ring-2 ring-base-100"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1">
          <p className={`min-w-0 truncate text-sm leading-tight ${online ? "" : "text-base-content/60"}`}>
            {user.name}
            {me && <span className="text-base-content/50"> (you)</span>}
            {/* The green dot / dimming is visual only. */}
            <span className="sr-only">{online ? ", online" : ", offline"}</span>
          </p>
          {/* Keyed so a new reaction pops in again. */}
          {reaction && (
            <span
              key={reaction.id}
              role="img"
              aria-label={`Reacted with ${emojiName(reaction.emoji)}`}
              title={emojiName(reaction.emoji)}
              className="reaction-pop shrink-0 text-base leading-none"
            >
              {reaction.emoji}
            </span>
          )}
          {me && <AddReaction />}
        </div>
        <p className="flex items-center gap-1 text-xs text-base-content/60">
          {facilitator && <span className="badge badge-xs badge-primary">Facilitator</span>}
          {online && stage === "idea-generation" && typing.includes(user.id) && <span>typing…</span>}
          {stage === "voting" &&
            (votes >= VOTE_LIMIT ? (
              <span className="text-success">
                <span className="hero-check-circle-micro size-3.5 align-[-3px]" aria-hidden="true" /> votes in
              </span>
            ) : (
              <span>
                {votes}/{VOTE_LIMIT} votes
              </span>
            ))}
        </p>
      </div>
      {online && isFacilitator && !facilitator && (
        <button
          type="button"
          className="btn btn-ghost btn-xs opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
          onClick={() => onHandOff(user)}
          aria-label={`Make ${user.name} the facilitator`}
          title="Make facilitator"
        >
          <span className="hero-arrows-right-left size-4" aria-hidden="true" />
        </button>
      )}
    </li>
  )
}

/** Overlapping avatars used as a compact trigger on small screens. */
export function AvatarStack({ users, max = 4 }: { users: User[]; max?: number }) {
  const shown = users.slice(0, max)
  const extra = users.length - shown.length
  return (
    <span className="flex -space-x-2">
      {shown.map((user) => (
        <Avatar key={user.id} user={user} size="xs" />
      ))}
      {extra > 0 && (
        <span className="inline-grid size-6 place-items-center rounded-full bg-base-300 text-[0.6rem] font-semibold ring-2 ring-base-100">
          +{extra}
        </span>
      )}
    </span>
  )
}

/** Terse, fixed-position voting progress so the list below never shifts. */
function VotingStatus() {
  const remaining = useAppSelector(selectVotersRemaining)
  return (
    <span role="status" aria-live="polite" className="ml-auto text-xs font-medium whitespace-nowrap">
      {remaining === 0 ? (
        <span className="flex items-center gap-1 text-success">
          <span className="hero-check-circle-micro size-4" aria-hidden="true" />
          All voted
        </span>
      ) : (
        <span className="text-base-content/60">{remaining} still voting</span>
      )}
    </span>
  )
}
