import { CATEGORY_META } from "../categories"
import type { Category } from "../types"

// Distinct shape *and* colour per category so they read at a glance (and without colour).
const STYLES: Record<Category, { icon: string; text: string; disc: string }> = {
  happy: { icon: "hero-hand-thumb-up-mini", text: "text-success", disc: "bg-success/15" },
  sad: { icon: "hero-hand-thumb-down-mini", text: "text-error", disc: "bg-error/15" },
  confused: { icon: "hero-question-mark-circle-mini", text: "text-warning", disc: "bg-warning/20" },
  start: { icon: "hero-play-mini", text: "text-success", disc: "bg-success/15" },
  stop: { icon: "hero-stop-mini", text: "text-error", disc: "bg-error/15" },
  continue: { icon: "hero-arrow-path-mini", text: "text-info", disc: "bg-info/15" },
  "action-item": { icon: "hero-check-mini", text: "text-primary", disc: "bg-primary/15" },
}

const SIZES = {
  xs: { box: "size-4", icon: "size-3" },
  sm: { box: "size-5", icon: "size-3.5" },
  md: { box: "size-6", icon: "size-4" },
}

interface CategoryIconProps {
  category: Category
  size?: keyof typeof SIZES
  /** Announce the category to screen readers (off when a visible label sits next to it). */
  labelled?: boolean
  /** Just the coloured glyph, without the tinted disc (for dense lists). */
  plain?: boolean
}

export function CategoryIcon({ category, size = "md", labelled = false, plain = false }: CategoryIconProps) {
  const { icon, text, disc } = STYLES[category]
  const { box, icon: iconSize } = SIZES[size]
  return (
    <span
      className={`inline-grid shrink-0 place-items-center ${box} ${text} ${plain ? "" : `rounded-full ${disc}`}`}
      role={labelled ? "img" : undefined}
      aria-label={labelled ? CATEGORY_META[category].label : undefined}
      aria-hidden={labelled ? undefined : true}
      title={CATEGORY_META[category].label}
    >
      <span className={`${icon} ${iconSize}`} />
    </span>
  )
}
