import { useLayoutEffect, useState, type ReactNode } from "react"

const CLAMP = { 2: "line-clamp-2", 3: "line-clamp-3" } as const

interface ClampedTextProps {
  children: ReactNode
  /** Lines shown until expanded. */
  lines?: keyof typeof CLAMP
  as?: "p" | "h2" | "h3"
  id?: string
  /** Text styles, on the wrapper so the toggle matches the text's size and line height. */
  className?: string
}

/** Text clamped to a few lines, with a "more" toggle only when it overflows. Screen readers always get the full text. */
export function ClampedText({ children, lines = 2, as: Tag = "p", id, className = "" }: ClampedTextProps) {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(false)

  // Re-measure while clamped, and whenever the column width changes.
  useLayoutEffect(() => {
    if (!el || open) return
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1)
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [el, open, children])

  return (
    <div className={`relative min-w-0 flex-1 ${className}`}>
      <Tag ref={setEl} id={id} className={`break-words ${open ? "" : CLAMP[lines]}`}>
        {children}
      </Tag>
      {(overflows || open) && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={`cursor-pointer rounded-sm font-medium not-italic text-base-content/60 hover:text-base-content hover:underline focus-visible:outline-2 focus-visible:outline-primary ${
            // Collapsed: sits over the end of the last line, fading the cut-off text.
            open ? "" : "absolute right-0 bottom-0 bg-linear-to-r from-transparent to-base-100 to-40% pl-6"
          }`}
        >
          {open ? "less" : "more"}
        </button>
      )}
    </div>
  )
}
