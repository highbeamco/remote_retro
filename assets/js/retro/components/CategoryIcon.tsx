import { CATEGORY_META } from "../categories"
import type { Category } from "../types"

// Distinct shape *and* colour per category so they read at a glance (and without colour).
const STYLES: Record<Category, { icon: string; tone: string }> = {
  happy: { icon: "hero-hand-thumb-up-mini", tone: "bg-success/15 text-success" },
  sad: { icon: "hero-hand-thumb-down-mini", tone: "bg-error/15 text-error" },
  confused: { icon: "hero-question-mark-circle-mini", tone: "bg-warning/20 text-warning" },
  start: { icon: "hero-play-mini", tone: "bg-success/15 text-success" },
  stop: { icon: "hero-stop-mini", tone: "bg-error/15 text-error" },
  continue: { icon: "hero-arrow-path-mini", tone: "bg-info/15 text-info" },
  "action-item": { icon: "hero-check-mini", tone: "bg-primary/15 text-primary" },
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
}

export function CategoryIcon({ category, size = "md", labelled = false }: CategoryIconProps) {
  const { icon, tone } = STYLES[category]
  const { box, icon: iconSize } = SIZES[size]
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-full ${box} ${tone}`}
      role={labelled ? "img" : undefined}
      aria-label={labelled ? CATEGORY_META[category].label : undefined}
      aria-hidden={labelled ? undefined : true}
      title={CATEGORY_META[category].label}
    >
      <span className={`${icon} ${iconSize}`} />
    </span>
  )
}
