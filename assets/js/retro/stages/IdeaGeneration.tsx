import { useState, type DragEvent } from "react"
import { CATEGORY_META } from "../categories"
import { CategoryIcon } from "../components/CategoryIcon"
import { IdeaCard } from "../components/IdeaCard"
import { IdeaForm } from "../components/IdeaForm"
import { useIsDesktop } from "../hooks/useMediaQuery"
import { useAppDispatch, useAppSelector } from "../store/hooks"
import {
  selectCategories,
  selectCurrentUserId,
  selectIdeasByCategory,
  selectIsFacilitator,
  selectTypingUserIds,
  selectUsersById,
} from "../store/selectors"
import { deleteIdea, isTempId, seedSampleIdeas, updateIdea } from "../store/thunks"
import type { Category, Idea } from "../types"

const TAB_PANEL_ID = "idea-category-panel"
const tabId = (category: Category) => `idea-tab-${category}`

/** "Happy, 2 ideas" as one text node: split across spans, name computation can drop the spaces. */
function CategoryName({ category, count }: { category: Category; count: number }) {
  return <span className="sr-only">{`${CATEGORY_META[category].label}, ${count} ${count === 1 ? "idea" : "ideas"}`}</span>
}

function TypingIndicator() {
  const typing = useAppSelector(selectTypingUserIds)
  const users = useAppSelector(selectUsersById)
  const me = useAppSelector(selectCurrentUserId)
  const names = typing.filter((id) => id !== me).map((id) => users[id]?.given_name ?? "Someone")
  return (
    <span className="min-w-0 truncate text-base-content/60" aria-live="polite">
      {names.length === 1 && `${names[0]} is typing…`}
      {names.length === 2 && `${names[0]} and ${names[1]} are typing…`}
      {names.length > 2 && `${names.length} people are typing…`}
    </span>
  )
}

/** Desktop drag state shared by the columns: the idea in flight and the column under it. */
interface ColumnDrag {
  dragging: Idea | null
  over: Category | null
  setDragging: (idea: Idea | null) => void
  setOver: (category: Category | null) => void
}

interface IdeaColumnProps {
  category: Category
  ideas: Idea[]
  categories: readonly Category[]
  showHeading?: boolean
  drag?: ColumnDrag
}

function IdeaColumn({ category, ideas, categories, showHeading = true, drag }: IdeaColumnProps) {
  const dispatch = useAppDispatch()
  const me = useAppSelector(selectCurrentUserId)
  const isFacilitator = useAppSelector(selectIsFacilitator)
  const meta = CATEGORY_META[category]
  const headingId = `column-${category}`
  const moveTargets = categories.filter((c) => c !== category)
  const move = (id: number, to: Category) => dispatch(updateIdea({ id, category: to }))
  const dropAllowed = drag?.dragging != null && drag.dragging.category !== category
  const dropActive = dropAllowed && drag?.over === category

  const dropProps = drag && {
    onDragOver: (e: DragEvent) => {
      if (!dropAllowed) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move"
      if (drag.over !== category) drag.setOver(category)
    },
    onDragLeave: (e: DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
      if (drag.over === category) drag.setOver(null)
    },
    onDrop: (e: DragEvent) => {
      if (!dropAllowed) return
      e.preventDefault()
      void move(drag.dragging!.id, category)
      // The card remounts in this column, so its own dragend never fires.
      drag.setDragging(null)
      drag.setOver(null)
    },
  }

  return (
    <section
      aria-labelledby={headingId}
      {...dropProps}
      className={`flex h-full min-h-0 flex-col rounded-box p-1.5 transition-colors ${
        dropActive
          ? "bg-primary/10 outline-2 outline-primary outline-dashed"
          : `bg-base-300/40 ${dropAllowed ? "outline-2 outline-base-content/20 outline-dashed" : ""}`
      }`}
    >
      <h2
        id={headingId}
        className={`flex items-center gap-2 px-1.5 pt-1 pb-2 text-sm font-semibold ${showHeading ? "" : "sr-only"}`}
      >
        <CategoryIcon category={category} size="sm" />
        <span aria-hidden="true">{meta.label}</span>
        <span className="ml-auto text-xs font-normal tabular-nums text-base-content/50" aria-hidden="true">
          {ideas.length}
        </span>
        <CategoryName category={category} count={ideas.length} />
      </h2>
      {ideas.length === 0 ? (
        <p className="px-2 py-6 text-center text-sm text-base-content/50">No ideas yet</p>
      ) : (
        // Fills the column and scrolls only on overflow; side padding keeps card shadows unclipped.
        <ul className="-mx-1.5 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain px-1.5 pb-0.5 [scrollbar-width:thin]">
          {ideas.map((idea) => {
            const canEdit = idea.user_id === me || isFacilitator
            return (
              <IdeaCard
                key={idea.id}
                idea={idea}
                canEdit={canEdit}
                onSave={(body) => dispatch(updateIdea({ id: idea.id, body }))}
                onDelete={() => dispatch(deleteIdea(idea.id))}
                moveTargets={moveTargets}
                onMove={(to) => move(idea.id, to)}
                dragProps={drag && canEdit && !isTempId(idea.id) ? cardDragProps(idea, drag) : undefined}
              />
            )
          })}
        </ul>
      )}
    </section>
  )
}

function cardDragProps(idea: Idea, drag: ColumnDrag) {
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      // Firefox only starts a drag once some data is set.
      e.dataTransfer?.setData("application/x-retro-idea", String(idea.id))
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move"
      drag.setDragging(idea)
    },
    onDragEnd: () => {
      drag.setDragging(null)
      drag.setOver(null)
    },
    className: `cursor-grab active:cursor-grabbing ${drag.dragging?.id === idea.id ? "opacity-40" : ""}`,
  }
}

export function IdeaGeneration() {
  const categories = useAppSelector(selectCategories)
  const byCategory = useAppSelector(selectIdeasByCategory)
  const isDesktop = useIsDesktop()
  const [category, setCategory] = useState<Category>(categories[0])
  const [dragging, setDragging] = useState<Idea | null>(null)
  const [over, setOver] = useState<Category | null>(null)
  const drag: ColumnDrag = { dragging, over, setDragging, setOver }

  // h-full + flex-1 columns reach the bottom of the screen; the min-h floors make very short screens scroll the page instead.
  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-3 p-3 sm:p-4">
      <h1 className="sr-only">Ideas</h1>
      <IdeaForm categories={categories} category={category} onCategoryChange={setCategory} status={<TypingIndicator />} />
      <DevSeedButton />

      {isDesktop ? (
        <div className="grid min-h-64 flex-1 grid-cols-3 grid-rows-[minmax(0,1fr)] gap-3">
          {categories.map((c) => (
            <IdeaColumn key={c} category={c} ideas={byCategory[c] ?? []} categories={categories} drag={drag} />
          ))}
        </div>
      ) : (
        <div className="flex min-h-72 flex-1 flex-col gap-2">
          <div role="tablist" aria-label="Categories" className="tabs tabs-box tabs-sm">
            {categories.map((c) => (
              <button
                key={c}
                id={tabId(c)}
                type="button"
                role="tab"
                aria-selected={c === category}
                aria-controls={TAB_PANEL_ID}
                className={`tab flex-1 gap-1 ${c === category ? "tab-active" : ""}`}
                onClick={() => setCategory(c)}
              >
                <CategoryIcon category={c} size="sm" />
                <span aria-hidden="true">{CATEGORY_META[c].label}</span>
                <span className="text-xs opacity-60" aria-hidden="true">
                  {byCategory[c]?.length ?? 0}
                </span>
                <CategoryName category={c} count={byCategory[c]?.length ?? 0} />
              </button>
            ))}
          </div>
          <div role="tabpanel" id={TAB_PANEL_ID} aria-labelledby={tabId(category)} className="min-h-0 flex-1">
            <IdeaColumn category={category} ideas={byCategory[category] ?? []} categories={categories} showHeading={false} />
          </div>
        </div>
      )}
    </div>
  )
}

/** Dev builds only: one click to fill the retro with sample ideas for testing. */
function DevSeedButton() {
  const dispatch = useAppDispatch()
  const devTools = useAppSelector((state) => state.ui.devTools)
  const [busy, setBusy] = useState(false)
  if (!devTools) return null

  return (
    <div className="flex justify-end">
      <button
        type="button"
        className="btn btn-xs btn-dash btn-warning gap-1"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          await dispatch(seedSampleIdeas())
          setBusy(false)
        }}
      >
        <span className="hero-beaker-micro size-3.5" aria-hidden="true" />
        Fill with sample ideas (dev)
      </button>
    </div>
  )
}
