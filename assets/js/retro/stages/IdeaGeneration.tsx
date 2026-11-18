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

function TypingIndicator() {
  const typing = useAppSelector(selectTypingUserIds)
  const users = useAppSelector(selectUsersById)
  const me = useAppSelector(selectCurrentUserId)
  const names = typing.filter((id) => id !== me).map((id) => users[id]?.given_name ?? "Someone")
  return (
    <p className="h-5 px-1 text-xs text-base-content/60" aria-live="polite">
      {names.length === 1 && `${names[0]} is typing…`}
      {names.length === 2 && `${names[0]} and ${names[1]} are typing…`}
      {names.length > 2 && `${names.length} people are typing…`}
    </p>
  )
}

function IdeaColumn({ category, ideas, showHeading = true }: { category: Category; ideas: Idea[]; showHeading?: boolean }) {
  const dispatch = useAppDispatch()
  const me = useAppSelector(selectCurrentUserId)
  const isFacilitator = useAppSelector(selectIsFacilitator)
  const meta = CATEGORY_META[category]
  const headingId = `column-${category}`

  return (
    <section aria-labelledby={headingId} className="flex min-h-0 flex-col rounded-box bg-base-300/40 p-2">
      <h2
        id={headingId}
        className={`flex items-center gap-2 px-1 pt-1 pb-2 font-semibold ${showHeading ? "" : "sr-only"}`}
      >
        <CategoryIcon category={category} />
        {meta.label}
        <span className="badge badge-sm badge-ghost ml-auto">
          <span className="sr-only">, </span>
          {ideas.length}
          <span className="sr-only"> {ideas.length === 1 ? "idea" : "ideas"}</span>
        </span>
      </h2>
      {ideas.length === 0 ? (
        <p className="px-1 py-6 text-center text-sm text-base-content/50">No ideas yet</p>
      ) : (
        <ul className="flex flex-col gap-2 overflow-y-auto">
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

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-3 p-3 sm:p-4">
      <h1 className="sr-only">Ideas</h1>
      <IdeaForm categories={categories} category={category} onCategoryChange={setCategory} />
      <DevSeedButton />
      <TypingIndicator />

      {isDesktop ? (
        <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-[minmax(0,1fr)] gap-3">
          {categories.map((c) => (
            <IdeaColumn key={c} category={c} ideas={byCategory[c] ?? []} />
          ))}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div role="tablist" aria-label="Categories" className="tabs tabs-box tabs-sm">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={c === category}
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
          <div role="tabpanel" className="min-h-0 flex-1">
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
