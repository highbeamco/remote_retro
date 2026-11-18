import { useState } from "react"
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
import { deleteIdea, seedSampleIdeas, updateIdea } from "../store/thunks"
import type { Category, Idea } from "../types"

const TAB_PANEL_ID = "idea-category-panel"
const tabId = (category: Category) => `idea-tab-${category}`

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

function IdeaColumn({ category, ideas, showHeading = true }: { category: Category; ideas: Idea[]; showHeading?: boolean }) {
  const dispatch = useAppDispatch()
  const me = useAppSelector(selectCurrentUserId)
  const isFacilitator = useAppSelector(selectIsFacilitator)
  const meta = CATEGORY_META[category]
  const headingId = `column-${category}`

  return (
    <section aria-labelledby={headingId} className="flex h-full min-h-0 flex-col rounded-box bg-base-300/40 p-1.5">
      <h2
        id={headingId}
        className={`flex items-center gap-2 px-1.5 pt-1 pb-2 text-sm font-semibold ${showHeading ? "" : "sr-only"}`}
      >
        <CategoryIcon category={category} size="sm" />
        {meta.label}
        <span className="ml-auto text-xs font-normal tabular-nums text-base-content/50">
          <span className="sr-only">, </span>
          {ideas.length}
          <span className="sr-only"> {ideas.length === 1 ? "idea" : "ideas"}</span>
        </span>
      </h2>
      {ideas.length === 0 ? (
        <p className="px-2 py-6 text-center text-sm text-base-content/50">No ideas yet</p>
      ) : (
        // Fills the column and scrolls only on overflow; side padding keeps card shadows unclipped.
        <ul className="-mx-1.5 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain px-1.5 pb-0.5 [scrollbar-width:thin]">
          {ideas.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              canEdit={idea.user_id === me || isFacilitator}
              onSave={(body) => dispatch(updateIdea({ id: idea.id, body }))}
              onDelete={() => dispatch(deleteIdea(idea.id))}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

export function IdeaGeneration() {
  const categories = useAppSelector(selectCategories)
  const byCategory = useAppSelector(selectIdeasByCategory)
  const isDesktop = useIsDesktop()
  const [category, setCategory] = useState<Category>(categories[0])

  // h-full + flex-1 columns reach the bottom of the screen; the min-h floors make very short screens scroll the page instead.
  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-3 p-3 sm:p-4">
      <h1 className="sr-only">Ideas</h1>
      <IdeaForm categories={categories} category={category} onCategoryChange={setCategory} status={<TypingIndicator />} />
      <DevSeedButton />

      {isDesktop ? (
        <div className="grid min-h-64 flex-1 grid-cols-3 grid-rows-[minmax(0,1fr)] gap-3">
          {categories.map((c) => (
            <IdeaColumn key={c} category={c} ideas={byCategory[c] ?? []} />
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
                {CATEGORY_META[c].label}
                <span className="text-xs opacity-60">
                  <span className="sr-only">, </span>
                  {byCategory[c]?.length ?? 0}
                  <span className="sr-only"> ideas</span>
                </span>
              </button>
            ))}
          </div>
          <div role="tabpanel" id={TAB_PANEL_ID} aria-labelledby={tabId(category)} className="min-h-0 flex-1">
            <IdeaColumn category={category} ideas={byCategory[category] ?? []} showHeading={false} />
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
