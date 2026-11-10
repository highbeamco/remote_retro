import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react"
import { Board } from "../board/Board"
import { moveIdea } from "../board/thunks"
import { CategoryIcon } from "../components/CategoryIcon"
import { MAX_LABEL_LENGTH, cardHeight } from "../constants"
import { useAppDispatch, useAppSelector } from "../store/hooks"
import {
  selectAiStatus,
  selectAllIdeas,
  selectGroupsWithIdeas,
  selectIsFacilitator,
  type GroupWithIdeas,
} from "../store/selectors"
import { ideaMovedLocally } from "../store/slices"
import { regroupIdeas, updateGroupLabel } from "../store/thunks"
import type { Idea } from "../types"
import { freeSlot, joinPosition, toCards, type Card, type Point } from "./listMoves"

type View = "list" | "board"
const SAVE_DEBOUNCE_MS = 400
const DRAG_TYPE = "application/x-retro-idea"

/**
 * Group & label: the board for dragging ideas into groups (labels float above each
 * group), and a list view for naming groups clearly. Same data, two views. Always
 * opens on the board; the List choice lasts only while you're in the stage.
 */
export function Grouping() {
  const [view, choose] = useState<View>("board")

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The list view has its own visible h1. */}
      {view === "board" && <h1 className="sr-only">Group &amp; label</h1>}
      <div className="flex items-center justify-end gap-2 border-b border-base-300 bg-base-100 px-4 py-2">
        <RegroupButton />
        <div role="tablist" aria-label="Grouping view" className="tabs tabs-box tabs-sm">
          {(["board", "list"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              className={`tab gap-1.5 ${view === key ? "tab-active" : ""}`}
              onClick={() => choose(key)}
            >
              <span className={`${key === "list" ? "hero-list-bullet-micro" : "hero-squares-2x2-micro"} size-4`} aria-hidden="true" />
              {key === "list" ? "List" : "Board"}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1">{view === "list" ? <LabelList onRegroup={() => choose("board")} /> : <Board mode="grouping" />}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Moving ideas from the list: work out a board position, then move the card there.
// The server re-derives groups from card overlap and broadcasts `groups:synced`.

export type MoveTarget = { kind: "group"; groupId: number } | { kind: "idea"; ideaId: number } | { kind: "ungrouped" }

/** Board position that puts `ideaId` into `target`, or null when it's already there. */
export function listMovePosition(ideas: Idea[], groupSizes: Map<number, number>, ideaId: number, target: MoveTarget): Point | null {
  const onBoard = ideas.filter((i) => i.category !== "action-item")
  const dragged = onBoard.find((i) => i.id === ideaId)
  if (!dragged) return null
  const inMultiGroup = dragged.group_id != null && (groupSizes.get(dragged.group_id) ?? 0) > 1
  if (target.kind === "ungrouped" && !inMultiGroup) return null
  if (target.kind === "group" && dragged.group_id === target.groupId) return null
  if (target.kind === "idea" && target.ideaId === ideaId) return null

  const cards = toCards(onBoard.filter((i) => i.id !== ideaId))
  const h = cardHeight(dragged.body)
  if (target.kind === "ungrouped") return freeSlot(cards, h)
  const inTarget = (c: Card) => (target.kind === "group" ? c.groupId === target.groupId : c.id === target.ideaId)
  return joinPosition(cards.filter(inTarget), cards.filter((c) => !inTarget(c)), h)
}

const targetKey = (t: MoveTarget) => (t.kind === "ungrouped" ? "ungrouped" : `${t.kind}:${t.kind === "group" ? t.groupId : t.ideaId}`)

interface DragState {
  ideaId: number
  /** The multi-idea group it came from, or null for an ungrouped idea. */
  fromGroupId: number | null
}

interface ListDnd {
  dragging: DragState | null
  overKey: string | null
  busy: boolean
  groups: GroupWithIdeas[]
  start: (state: DragState) => void
  end: () => void
  hover: (key: string | null) => void
  move: (ideaId: number, target: MoveTarget) => void
}

const ListDndContext = createContext<ListDnd | null>(null)
const useListDnd = () => useContext(ListDndContext)!

function canDrop(dragging: DragState | null, target: MoveTarget) {
  if (!dragging) return false
  if (target.kind === "ungrouped") return dragging.fromGroupId != null
  if (target.kind === "group") return dragging.fromGroupId !== target.groupId
  return target.ideaId !== dragging.ideaId
}

/** Drag-over/drop handlers + highlight state for one drop target. */
function useDropTarget(target: MoveTarget) {
  const dnd = useListDnd()
  const key = targetKey(target)
  const allowed = canDrop(dnd.dragging, target)
  return {
    active: allowed && dnd.overKey === key,
    allowed,
    props: {
      onDragOver: (e: DragEvent) => {
        if (!allowed) return
        e.preventDefault()
        e.stopPropagation()
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move"
        if (dnd.overKey !== key) dnd.hover(key)
      },
      onDragLeave: (e: DragEvent) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        if (dnd.overKey === key) dnd.hover(null)
      },
      onDrop: (e: DragEvent) => {
        if (!allowed) return
        e.preventDefault()
        e.stopPropagation()
        const id = dnd.dragging?.ideaId ?? Number(e.dataTransfer?.getData(DRAG_TYPE))
        dnd.end()
        if (id) dnd.move(id, target)
      },
    },
  }
}

function LabelList({ onRegroup }: { onRegroup: () => void }) {
  const dispatch = useAppDispatch()
  const groups = useAppSelector(selectGroupsWithIdeas)
  const ideas = useAppSelector(selectAllIdeas)
  const busy = useAppSelector(selectAiStatus) != null
  const [dragging, setDragging] = useState<DragState | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)
  const multi = groups.filter((g) => g.ideas.length > 1)
  const singles = groups.filter((g) => g.ideas.length === 1)
  const unlabeled = multi.filter((g) => !g.label).length

  useEffect(() => {
    if (busy) setDragging(null)
  }, [busy])

  const dnd: ListDnd = {
    dragging,
    overKey,
    busy,
    groups: multi,
    start: setDragging,
    end: () => {
      setDragging(null)
      setOverKey(null)
    },
    hover: setOverKey,
    move: (ideaId, target) => {
      if (busy) return
      const sizes = new Map(groups.map((g) => [g.id, g.ideas.length]))
      const to = listMovePosition(ideas, sizes, ideaId, target)
      const idea = ideas.find((i) => i.id === ideaId)
      if (!to || !idea) return
      const from = idea.x != null && idea.y != null ? { x: idea.x, y: idea.y } : undefined
      dispatch(ideaMovedLocally({ id: ideaId, ...to }))
      void dispatch(moveIdea({ id: ideaId, ...to, from }))
    },
  }

  return (
    <ListDndContext.Provider value={dnd}>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h1 className="text-xl font-semibold">Name each group</h1>
              <p className="text-sm text-base-content/70">
                Give each group a short title so it's easy to vote on. Drag an idea by its handle (or use its Move menu)
                to regroup it, or{" "}
                <button type="button" className="link" onClick={onRegroup}>
                  switch to the board
                </button>
                .
              </p>
            </div>
            {multi.length > 0 && (
              <span className={`badge ${unlabeled ? "badge-warning badge-soft" : "badge-success badge-soft"}`} role="status">
                {unlabeled ? `${unlabeled} of ${multi.length} unlabeled` : "All groups labeled"}
              </span>
            )}
          </header>

          {multi.length === 0 ? (
            <p className="rounded-box border border-dashed border-base-300 p-6 text-center text-sm text-base-content/60">
              No groups yet — every idea stands on its own. Drag one idea onto another to group them.
            </p>
          ) : (
            // Masonry (like voting): big and small groups pack without dead space.
            <ul className="gap-3 sm:columns-2 xl:columns-3">
              {multi.map((group) => (
                <li key={group.id} className="mb-3 break-inside-avoid">
                  <GroupLabelCard group={group} />
                </li>
              ))}
            </ul>
          )}

          {(singles.length > 0 || dragging?.fromGroupId != null) && <UngroupedSection singles={singles} />}
        </div>
      </div>
    </ListDndContext.Provider>
  )
}

function UngroupedSection({ singles }: { singles: GroupWithIdeas[] }) {
  const { active, allowed, props } = useDropTarget({ kind: "ungrouped" })
  return (
    <section
      aria-labelledby="ungrouped-heading"
      {...props}
      className={`-m-2 space-y-2 rounded-box p-2 transition-colors ${
        active ? "bg-primary/10 outline-2 outline-primary outline-dashed" : allowed ? "outline-2 outline-base-300 outline-dashed" : ""
      }`}
    >
      <h2 id="ungrouped-heading" className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-base-content/70">
        Ungrouped ideas ({singles.length})
        {allowed && <span className="font-normal text-base-content/60">Drop here to take it out of its group</span>}
      </h2>
      {singles.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {singles.map((group) => (
            <UngroupedIdea key={group.id} idea={group.ideas[0]} />
          ))}
        </ul>
      ) : (
        <p className="rounded-box border border-dashed border-base-300 p-4 text-center text-sm text-base-content/50">
          Nothing here yet
        </p>
      )}
    </section>
  )
}

function UngroupedIdea({ idea }: { idea: Idea }) {
  const { active, props } = useDropTarget({ kind: "idea", ideaId: idea.id })
  return (
    <IdeaRow
      idea={idea}
      fromGroupId={null}
      dropProps={props}
      className={`rounded-box bg-base-100 p-2 shadow-sm ${active ? "ring-2 ring-primary" : ""}`}
    >
      {active && <span className="sr-only">Drop to group with this idea</span>}
    </IdeaRow>
  )
}

function GroupLabelCard({ group }: { group: GroupWithIdeas }) {
  const inputId = useId()
  const { active, props } = useDropTarget({ kind: "group", groupId: group.id })
  return (
    <article
      {...props}
      aria-label={group.label ? `Group: ${group.label}` : `Unlabeled group of ${group.ideas.length} ideas`}
      className={`card h-full bg-base-100 shadow-sm transition-shadow ${
        active ? "bg-primary/5 ring-2 ring-primary" : group.label ? "" : "ring-2 ring-warning/40"
      }`}
    >
      <div className="card-body gap-2 p-4">
        <LabelInput id={inputId} group={group} />
        <ul className="-mx-1 space-y-0.5 text-sm text-base-content/80">
          {group.ideas.map((idea) => (
            <IdeaRow key={idea.id} idea={idea} fromGroupId={group.id} className="rounded-field px-1 py-1" />
          ))}
        </ul>
      </div>
    </article>
  )
}

interface IdeaRowProps {
  idea: Idea
  fromGroupId: number | null
  className?: string
  dropProps?: ReturnType<typeof useDropTarget>["props"]
  children?: ReactNode
}

/** One draggable idea, with a keyboard-friendly "Move to…" menu. */
function IdeaRow({ idea, fromGroupId, className = "", dropProps, children }: IdeaRowProps) {
  const dnd = useListDnd()
  const isDragging = dnd.dragging?.ideaId === idea.id
  return (
    <li
      draggable={!dnd.busy}
      onDragStart={(e) => {
        if (dnd.busy) return e.preventDefault()
        e.dataTransfer?.setData(DRAG_TYPE, String(idea.id))
        e.dataTransfer?.setData("text/plain", idea.body)
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move"
        dnd.start({ ideaId: idea.id, fromGroupId })
      }}
      onDragEnd={dnd.end}
      {...dropProps}
      data-idea-id={idea.id}
      className={`group/row flex items-start gap-1.5 ${dnd.busy ? "" : "cursor-grab active:cursor-grabbing"} ${
        isDragging ? "opacity-40" : ""
      } ${dnd.dragging ? "" : "hover:bg-base-200/60"} ${className}`}
    >
      <span
        className="hero-bars-2-micro mt-0.5 size-4 shrink-0 text-base-content/30 group-hover/row:text-base-content/60"
        aria-hidden="true"
        title="Drag to move"
      />
      <CategoryIcon category={idea.category} size="sm" labelled />
      <span className="min-w-0 flex-1 break-words text-sm">{idea.body}</span>
      <MoveMenu idea={idea} fromGroupId={fromGroupId} />
      {children}
    </li>
  )
}

const groupName = (g: GroupWithIdeas) => {
  if (g.label) return g.label
  const first = g.ideas[0]?.body ?? ""
  return `Unlabeled: “${first.length > 28 ? `${first.slice(0, 27)}…` : first}”`
}

function MoveMenu({ idea, fromGroupId }: { idea: Idea; fromGroupId: number | null }) {
  const dnd = useListDnd()
  return (
    <select
      aria-label={`Move “${idea.body}” to`}
      title="Move to…"
      className="select select-ghost select-xs w-[5.5rem] shrink-0 text-base-content/60"
      value=""
      disabled={dnd.busy}
      onChange={(e) => {
        const value = e.target.value
        if (value === "ungrouped") dnd.move(idea.id, { kind: "ungrouped" })
        else if (value.startsWith("group:")) dnd.move(idea.id, { kind: "group", groupId: Number(value.slice(6)) })
      }}
    >
      <option value="" disabled>
        Move to…
      </option>
      <option value="ungrouped" disabled={fromGroupId == null}>
        Ungrouped
      </option>
      {dnd.groups.map((g) => (
        <option key={g.id} value={`group:${g.id}`} disabled={g.id === fromGroupId}>
          {groupName(g)}
        </option>
      ))}
    </select>
  )
}

/** Debounced label field; keeps the user's text while focused even if a server echo arrives. */
function LabelInput({ id, group }: { id: string; group: GroupWithIdeas }) {
  const dispatch = useAppDispatch()
  const aiBusy = useAppSelector(selectAiStatus) != null
  const [value, setValue] = useState(group.label ?? "")
  const focused = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (!focused.current) setValue(group.label ?? "")
  }, [group.label])

  useEffect(() => () => clearTimeout(timer.current), [])

  const save = (label: string) => {
    clearTimeout(timer.current)
    if (label.trim() !== (group.label ?? "")) void dispatch(updateGroupLabel({ id: group.id, label }))
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="sr-only">
        Label for group of {group.ideas.length} ideas
      </label>
      <input
        id={id}
        className="input input-sm w-full font-semibold"
        placeholder="Add a label"
        maxLength={MAX_LABEL_LENGTH}
        value={value}
        disabled={aiBusy}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false
          save(value)
        }}
        onChange={(e) => {
          const next = e.target.value
          setValue(next)
          clearTimeout(timer.current)
          timer.current = setTimeout(() => save(next), SAVE_DEBOUNCE_MS)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur()
        }}
      />
      {group.label_source === "ai" && group.label && (
        <span className="badge badge-secondary badge-soft badge-sm shrink-0 gap-1" title="Suggested by AI">
          <span className="hero-sparkles-micro size-3.5" aria-hidden="true" />
          AI
        </span>
      )}
    </div>
  )
}

/** Facilitator-only: run AI grouping again over the ideas that aren't in a group yet. */
function RegroupButton() {
  const dispatch = useAppDispatch()
  const isFacilitator = useAppSelector(selectIsFacilitator)
  const aiEnabled = useAppSelector((state) => state.ui.aiEnabled)
  const aiBusy = useAppSelector(selectAiStatus) != null
  if (!isFacilitator || !aiEnabled) return null

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm gap-1.5"
      disabled={aiBusy}
      onClick={() => dispatch(regroupIdeas())}
      title="Group related ideas that aren't in a group yet. Existing groups stay as they are."
    >
      <span className="hero-sparkles-micro size-4" aria-hidden="true" />
      Re-run grouping
    </button>
  )
}
