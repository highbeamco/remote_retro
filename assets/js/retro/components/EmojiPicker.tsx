import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { EMOJI_GROUPS, searchEmoji, type EmojiEntry } from "../emoji"

interface EmojiPickerProps {
  id?: string
  className?: string
  onPick: (emoji: string) => void
  onClose: () => void
}

/**
 * Searchable emoji grid. The search box starts focused; Enter picks the first match, arrow keys
 * move through the grid, Escape closes.
 */
export function EmojiPicker({ id, className = "", onPick, onClose }: EmojiPickerProps) {
  const [query, setQuery] = useState("")
  const results = useMemo(() => searchEmoji(query), [query])
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const searching = query.trim() !== ""

  // The list may end near the bottom of a scrolling sidebar or dialog.
  useEffect(() => {
    rootRef.current?.scrollIntoView?.({ block: "nearest" })
  }, [])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      // Cancelling also keeps a surrounding <dialog> open.
      e.preventDefault()
      e.stopPropagation()
      onClose()
      return
    }
    const target = e.target
    const buttons = [...(gridRef.current?.querySelectorAll<HTMLButtonElement>("button[data-emoji]") ?? [])]
    if (target === inputRef.current) {
      if (e.key === "Enter" && !e.nativeEvent.isComposing && results[0]) {
        e.preventDefault()
        onPick(results[0].emoji)
      } else if (e.key === "ArrowDown" && buttons[0]) {
        e.preventDefault()
        buttons[0].focus()
      }
      return
    }
    if (!e.key.startsWith("Arrow") || !(target instanceof HTMLButtonElement)) return
    e.preventDefault()
    // Up from the top row goes back to the search box.
    const next = neighbour(buttons, target, e.key) ?? (e.key === "ArrowUp" ? inputRef.current : null)
    next?.focus()
  }

  return (
    <div
      ref={rootRef}
      id={id}
      role="dialog"
      aria-label="Pick a reaction"
      onKeyDown={onKeyDown}
      className={`w-full max-w-80 rounded-box bg-base-100 p-2 shadow-lg ring-1 ring-base-300 ${className}`}
    >
      <input
        ref={inputRef}
        type="search"
        autoFocus
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search emoji"
        aria-label="Search emoji"
        className="input input-sm w-full"
      />
      <div ref={gridRef} className="mt-2 max-h-60 overflow-y-auto overscroll-contain">
        {!searching ? (
          EMOJI_GROUPS.map((group) => (
            <div key={group.name}>
              <h3 className="sticky top-0 bg-base-100 px-1 pt-1 pb-0.5 text-xs font-medium text-base-content/60">
                {group.name}
              </h3>
              <EmojiGrid entries={group.emoji} onPick={onPick} />
            </div>
          ))
        ) : results.length > 0 ? (
          <EmojiGrid entries={results} onPick={onPick} />
        ) : (
          <p className="px-1 py-6 text-center text-sm text-base-content/60">No emoji match “{query.trim()}”.</p>
        )}
      </div>
    </div>
  )
}

function EmojiGrid({ entries, onPick }: { entries: readonly EmojiEntry[]; onPick: (emoji: string) => void }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(1.75rem,1fr))]">
      {entries.map(({ emoji, name }) => (
        <button
          key={emoji}
          type="button"
          data-emoji={emoji}
          aria-label={name}
          title={name}
          onClick={() => onPick(emoji)}
          className="grid aspect-square place-items-center rounded-field text-xl leading-none transition-transform hover:scale-110 hover:bg-base-200 focus-visible:bg-base-200 focus-visible:outline-2 focus-visible:outline-primary"
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}

/** Where an arrow key goes: the previous/next button, or the closest one in the row above/below. */
function neighbour(buttons: HTMLButtonElement[], from: HTMLButtonElement, key: string): HTMLButtonElement | null {
  const i = buttons.indexOf(from)
  if (key === "ArrowLeft") return buttons[i - 1] ?? null
  if (key === "ArrowRight") return buttons[i + 1] ?? null
  if (key !== "ArrowUp" && key !== "ArrowDown") return null
  const origin = from.getBoundingClientRect()
  let best: HTMLButtonElement | null = null
  let bestScore = Infinity
  for (const button of buttons) {
    const rect = button.getBoundingClientRect()
    const dy = key === "ArrowDown" ? rect.top - origin.top : origin.top - rect.top
    if (dy < 1) continue
    // The nearest row wins; within it, the closest column.
    const score = dy * 1000 + Math.abs(rect.left - origin.left)
    if (score < bestScore) {
      best = button
      bestScore = score
    }
  }
  return best
}
