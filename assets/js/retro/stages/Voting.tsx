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

/** Your votes on this group as dots, then remove/add. Quiet until you vote. */
function VoteControls({ group, votesLeft }: { group: GroupWithIdeas; votesLeft: number }) {
  const dispatch = useAppDispatch()
  const mine = group.myVoteCount
  const name = groupTitle(group) ?? "this group"
  const voteButton = useRef<HTMLButtonElement>(null)
  const refocus = useRef(false)

  // The remove button disappears with your last vote here; keep keyboard focus on the card.
  useEffect(() => {
    if (refocus.current && mine === 0) voteButton.current?.focus()
    refocus.current = false
  }, [mine])

  return (
    <div className="flex items-center justify-end gap-1">
      {mine > 0 && (
        <>
          <span className="mr-1 flex gap-1" aria-hidden="true">
            {Array.from({ length: mine }, (_, i) => (
              <span key={i} className="size-2 rounded-full bg-primary" />
            ))}
          </span>
          <span className="sr-only">
            {mine} {mine === 1 ? "vote" : "votes"} from you
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-square text-base-content/60"
            onClick={() => {
              refocus.current = mine === 1
              dispatch(retractVoteOnGroup(group.id))
            }}
            aria-label={`Remove a vote from ${name}`}
            title="Remove a vote"
          >
            <span className="hero-minus-micro size-4" aria-hidden="true" />
          </button>
        </>
      )}
      <button
        ref={voteButton}
        type="button"
        className="btn btn-ghost btn-sm gap-1"
        disabled={votesLeft === 0}
        onClick={() => dispatch(createVote(group.id))}
        aria-label={`Vote for ${name}`}
        title="Vote"
      >
        <span className={`hero-plus-micro size-4 ${votesLeft > 0 ? "text-primary" : ""}`} aria-hidden="true" />
        Vote
      </button>
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
            <GroupCard
              compact
              group={group}
              highlighted={group.myVoteCount > 0}
              footer={<VoteControls group={group} votesLeft={votesLeft} />}
            />
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
