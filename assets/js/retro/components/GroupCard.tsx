import type { ReactNode } from "react"
import { CategoryIcon } from "./CategoryIcon"
import { groupTitle, type GroupWithIdeas } from "../store/selectors"

interface GroupCardProps {
  group: GroupWithIdeas
  /** Rendered at the end of the title row (e.g. vote controls). */
  actions?: ReactNode
  /** Rendered before the title (e.g. rank). */
  badge?: ReactNode
  compact?: boolean
  /** Heading level for the title, to follow the page outline (styling doesn't change). */
  headingLevel?: 2 | 3
}

/** A group of ideas, all shown in full; singletons show the lone idea's text as the title. */
export function GroupCard({ group, actions, badge, compact = false, headingLevel = 3 }: GroupCardProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3"
  const title = groupTitle(group)
  // A bare singleton's title is its idea, so there's no idea list under it.
  const ideaAsTitle = group.ideas.length === 1 && !group.label
  const titleId = `group-${group.id}-title`

  return (
    <article aria-labelledby={titleId} className="card bg-base-100 shadow-sm">
      <div className={`card-body ${compact ? "gap-1.5 p-3" : "gap-2 p-4"}`}>
        <div className="flex items-start gap-2">
          {badge}
          <Heading
            id={titleId}
            className={`min-w-0 flex-1 break-words text-sm leading-5 ${ideaAsTitle ? "" : "font-semibold"} ${title ? "" : "text-base-content/50 italic"}`}
          >
            {ideaAsTitle && (
              <span className="mr-1 inline-block align-[-5px]">
                <CategoryIcon category={group.ideas[0].category} size="sm" plain />
              </span>
            )}
            {title ?? "Unlabeled group"}
          </Heading>
          {actions}
        </div>
        {/* A labelled singleton (e.g. a group that lost all but one idea) still shows its idea. */}
        {!ideaAsTitle && (
          <ul className={`space-y-1 text-base-content/70 ${compact ? "text-xs" : "text-sm"}`}>
            {group.ideas.map((idea) => (
              <li key={idea.id} className="flex gap-1.5">
                <CategoryIcon category={idea.category} size={compact ? "xs" : "sm"} labelled plain />
                <span className="min-w-0 flex-1 break-words">{idea.body}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  )
}
