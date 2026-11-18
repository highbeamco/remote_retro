import type { ReactNode } from "react"
import { CategoryIcon } from "./CategoryIcon"
import { groupTitle, type GroupWithIdeas } from "../store/selectors"

interface GroupCardProps {
  group: GroupWithIdeas
  /** Rendered in the card's footer (vote controls, tallies…). */
  footer?: ReactNode
  /** Rendered next to the title (e.g. rank). */
  badge?: ReactNode
  compact?: boolean
  /** Heading level for the title, to follow the page outline (styling doesn't change). */
  headingLevel?: 2 | 3
  /** Outline the card (e.g. it holds your votes). */
  highlighted?: boolean
}

/** A group of ideas; singletons show the lone idea's text as the title. */
export function GroupCard({ group, footer, badge, compact = false, headingLevel = 3, highlighted = false }: GroupCardProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3"
  const title = groupTitle(group)
  const singleton = group.ideas.length === 1
  const titleId = `group-${group.id}-title`

  return (
    <article
      aria-labelledby={titleId}
      className={`card bg-base-100 shadow-sm transition-shadow ${highlighted ? "ring-2 ring-primary/50" : ""}`}
    >
      <div className={`card-body gap-2 ${compact ? "p-3" : "p-4"}`}>
        <div className="flex items-start gap-2">
          {badge}
          <Heading
            id={titleId}
            className={`min-w-0 flex-1 break-words ${singleton && !group.label ? "text-sm" : "font-semibold"} ${title ? "" : "text-base-content/50 italic"}`}
          >
            {singleton && !group.label && (
              <span className="mr-1.5 inline-block align-[-5px]">
                <CategoryIcon category={group.ideas[0].category} />
              </span>
            )}
            {title ?? "Unlabeled group"}
          </Heading>
        </div>
        {/* A labelled singleton (e.g. a group that lost all but one idea) still shows its idea. */}
        {(!singleton || group.label) && (
          <ul className={`text-base-content/75 ${compact ? "space-y-0.5 text-[0.8125rem] leading-snug" : "space-y-1 text-sm"}`}>
            {group.ideas.map((idea) => (
              <li key={idea.id} className="flex gap-1.5">
                <CategoryIcon category={idea.category} size="sm" labelled />
                <span className="min-w-0 break-words">{idea.body}</span>
              </li>
            ))}
          </ul>
        )}
        {footer && <div className={compact ? "pt-0.5" : "pt-1"}>{footer}</div>}
      </div>
    </article>
  )
}
