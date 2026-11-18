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

/** Beside the title: a quiet "+ Vote", then a tinted "− ●● +" stepper. Fixed width so voting never rewraps the title. */
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
    <div className="flex w-19 shrink-0 justify-end">
      <div className={`flex items-center rounded-full ${mine > 0 ? "bg-primary/15" : ""}`}>
        {mine > 0 && (
          <>
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
            <span className="flex gap-0.5 px-0.5" aria-hidden="true">
              {Array.from({ length: mine }, (_, i) => (
                <span key={i} className="size-2 rounded-full bg-primary" />
              ))}
            </span>
            <span className="sr-only">
              {mine} {mine === 1 ? "vote" : "votes"} from you
            </span>
          </>
        )}
        {/* Same element in both states, so focus stays put as the control changes shape. */}
        <button
          ref={addButton}
          type="button"
          className={`btn btn-ghost btn-xs rounded-full text-base-content/70 ${mine > 0 ? "btn-circle" : "gap-0.5"}`}
          disabled={votesLeft === 0}
          onClick={() => {
            if (votesLeft === 1) refocus.current = "remove"
            dispatch(createVote(group.id))
          }}
          aria-label={`Vote for ${name}`}
          title="Vote"
        >
          <span className="hero-plus-micro size-3.5" aria-hidden="true" />
          {mine === 0 && "Vote"}
        </button>
      </div>
    </div>
  )
}

interface GroupSectionProps {
  id: string
  title: string
  groups: GroupWithIdeas[]
  votesLeft: number
}

function GroupSection({ id, title, groups, votesLeft }: GroupSectionProps) {
  if (groups.length === 0) return null
  return (
    <section aria-labelledby={id} className="mb-4">
      <h2 id={id} className="mb-2 flex items-baseline gap-2 px-1 text-sm font-semibold text-base-content/70">
        {title}
        <span className="text-xs font-normal tabular-nums text-base-content/50">
          <span className="sr-only">, </span>
          {groups.length}
        </span>
      </h2>
      {/* Masonry: cards keep their natural height, so big and small groups pack tightly. */}
      <ul className="columns-1 gap-3 md:columns-2 xl:columns-3 2xl:columns-4">
        {groups.map((group) => (
          <li key={group.id} className="mb-3 break-inside-avoid">
            <GroupCard compact group={group} actions={<VoteControl group={group} votesLeft={votesLeft} />} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Voting() {
  const groups = useAppSelector(selectVotingGroups)
  const votesLeft = useAppSelector(selectMyVotesLeft)
  const multi = groups.filter((group) => group.ideas.length > 1)
  const single = groups.filter((group) => group.ideas.length === 1)

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
        <>
          <GroupSection id="voting-groups" title="Groups" groups={multi} votesLeft={votesLeft} />
          <GroupSection id="voting-singles" title="Single ideas" groups={single} votesLeft={votesLeft} />
        </>
      )}
    </div>
  )
}
