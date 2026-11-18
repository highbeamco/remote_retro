import { useEffect, useRef } from "react"
import { VOTE_LIMIT } from "../constants"
import { GroupCard } from "../components/GroupCard"
import { useAppDispatch, useAppSelector } from "../store/hooks"
import { groupTitle, selectMyVotesLeft, selectVotingGroups, type GroupWithIdeas } from "../store/selectors"
import { createVote, retractVoteOnGroup } from "../store/thunks"

export function VotesLeft({ left }: { left: number }) {
  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <span className="flex gap-1" aria-hidden="true">
        {Array.from({ length: VOTE_LIMIT }, (_, i) => (
          <span
            key={i}
            className={`size-3 rounded-full transition-colors ${i < left ? "bg-primary" : "bg-base-300"}`}
          />
        ))}
      </span>
      <span className="text-sm font-medium">
        {left === 0 ? "All votes used" : `${left} ${left === 1 ? "vote" : "votes"} left`}
      </span>
    </div>
  )
}

/** Beside the title: a tinted "− ●●" then a fixed "+" pinned right, so repeat taps land on the same spot. */
function VoteControl({ group, votesLeft }: { group: GroupWithIdeas; votesLeft: number }) {
  const dispatch = useAppDispatch()
  const mine = group.myVoteCount
  const name = groupTitle(group) ?? "this group"
  const addButton = useRef<HTMLButtonElement>(null)
  const removeButton = useRef<HTMLButtonElement>(null)
  const refocus = useRef<"add" | "remove" | null>(null)

  // Keep keyboard focus here when the clicked button vanishes (last vote removed) or disables (last vote spent).
  useEffect(() => {
    if (refocus.current === "add" && mine === 0) addButton.current?.focus()
    if (refocus.current === "remove" && votesLeft === 0) removeButton.current?.focus()
    refocus.current = null
  }, [mine, votesLeft])

  return (
    // Fixed width and negative margin: voting never rewraps the title or grows the row.
    <div className="-my-1.5 flex w-24 shrink-0 items-center justify-end gap-0.5">
      {mine > 0 && (
        <div className="flex items-center rounded-full bg-primary/15">
          <button
            ref={removeButton}
            type="button"
            className="btn btn-ghost btn-xs btn-circle text-base-content/70"
            onClick={() => {
              if (mine === 1) refocus.current = "add"
              dispatch(retractVoteOnGroup(group.id))
            }}
            aria-label={`Remove a vote from ${name}`}
            title="Remove a vote"
          >
            <span className="hero-minus-micro size-3.5" aria-hidden="true" />
          </button>
          <span className="flex gap-0.5 pr-1.5 pl-0.5" aria-hidden="true">
            {Array.from({ length: mine }, (_, i) => (
              <span key={i} className="size-2 rounded-full bg-primary" />
            ))}
          </span>
          <span className="sr-only">
            {mine} {mine === 1 ? "vote" : "votes"} from you
          </span>
        </div>
      )}
      {/* Identical in every state: same element, size and spot, so focus and taps stay put. */}
      <button
        ref={addButton}
        type="button"
        className="btn btn-ghost btn-sm btn-circle text-base-content/60"
        disabled={votesLeft === 0}
        onClick={() => {
          if (votesLeft === 1) refocus.current = "remove"
          dispatch(createVote(group.id))
        }}
        aria-label={`Vote for ${name}`}
        title="Vote"
      >
        <span className="hero-plus size-4" aria-hidden="true" />
      </button>
    </div>
  )
}

export function Voting() {
  const groups = useAppSelector(selectVotingGroups)
  const votesLeft = useAppSelector(selectMyVotesLeft)

  return (
    <div className="mx-auto max-w-[1800px] px-3 pb-6 sm:px-4 lg:px-6">
      <div className="sticky top-0 z-10 -mx-3 mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-base-200/90 px-3 py-2 backdrop-blur sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h1 className="text-lg font-semibold">Vote on what matters most</h1>
          <p className="text-sm text-base-content/60">Totals stay hidden until the next stage.</p>
        </div>
        <VotesLeft left={votesLeft} />
      </div>
      {groups.length === 0 ? (
        <p className="py-16 text-center text-base-content/60">There's nothing to vote on yet.</p>
      ) : (
        <ul className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {groups.map((group) => (
            <li key={group.id}>
              <GroupCard
                compact
                headingLevel={2}
                group={group}
                actions={<VoteControl group={group} votesLeft={votesLeft} />}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
