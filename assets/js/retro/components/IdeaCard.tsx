import { useId, useState, type ReactNode } from "react"
import { isTempId } from "../store/thunks"
import type { Idea } from "../types"
import { CharCount } from "./CharCount"
import { validateIdeaBody } from "./validation"

interface IdeaCardProps {
  idea: Idea
  canEdit: boolean
  onSave: (body: string) => Promise<unknown> | void
  onDelete: () => void
  /** Extra content under the body (e.g. assignee). */
  meta?: ReactNode
}

/** Ideas are anonymous: the card never shows who wrote it. */
export function IdeaCard({ idea, canEdit, onSave, onDelete, meta }: IdeaCardProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(idea.body)
  const [error, setError] = useState<string | null>(null)
  const errorId = useId()
  const pending = isTempId(idea.id)

  const save = async () => {
    const problem = validateIdeaBody(draft)
    if (problem) {
      setError(problem)
      return
    }
    setEditing(false)
    if (draft.trim() !== idea.body) await onSave(draft.trim())
  }

  if (editing) {
    return (
      <li className="card bg-base-100 shadow-sm ring-2 ring-primary/40">
        <div className="card-body gap-1.5 p-2">
          <label className="sr-only" htmlFor={`edit-${idea.id}`}>
            Edit text
          </label>
          <textarea
            id={`edit-${idea.id}`}
            className={`textarea textarea-sm w-full ${error ? "textarea-error" : ""}`}
            rows={3}
            value={draft}
            autoFocus
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => {
              setDraft(e.target.value)
              if (error) setError(validateIdeaBody(e.target.value))
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false)
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                void save()
              }
            }}
          />
          {/* Error, count and actions share one row to keep the editing card short. */}
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <span id={errorId} className="mr-auto text-xs text-error">
              {error}
            </span>
            <CharCount value={draft} />
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary btn-xs" onClick={save}>
              Save
            </button>
          </div>
        </div>
      </li>
    )
  }

  return (
    <li className={`group card bg-base-100 shadow-sm transition-opacity ${pending ? "opacity-60" : ""}`}>
      <div className="card-body gap-1 px-2.5 py-2">
        <p className="text-sm leading-snug break-words whitespace-pre-wrap">
          {canEdit && (
            // Beside the first line only (-my-0.5 trims it to one line); hidden while saving so the text doesn't reflow.
            <span
              className={`float-right -my-0.5 ml-1.5 flex gap-0.5 text-base-content/50 opacity-70 group-hover:opacity-100 focus-within:opacity-100 ${pending ? "invisible" : ""}`}
            >
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-square"
                aria-label="Edit"
                title="Edit"
                disabled={pending}
                onClick={() => {
                  setDraft(idea.body)
                  setError(null)
                  setEditing(true)
                }}
              >
                <span className="hero-pencil-square-micro size-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-square hover:text-error"
                aria-label="Delete"
                title="Delete"
                disabled={pending}
                onClick={onDelete}
              >
                <span className="hero-trash-micro size-3.5" aria-hidden="true" />
              </button>
            </span>
          )}
          {idea.body}
        </p>
        {meta && <div className="min-w-0 text-xs text-base-content/50">{meta}</div>}
      </div>
    </li>
  )
}
