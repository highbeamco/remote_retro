import { useEffect, type CSSProperties } from "react"
import { useAppDispatch, useAppSelector } from "../store/hooks"
import { selectFloatingReactions } from "../store/selectors"
import { floatingReactionDone, type FloatingReaction } from "../store/slices"

/** How long each emoji floats (the CSS animation runs for exactly this long). */
export const FLOAT_MS = 3500

/**
 * Reactions drifting up the screen, above the board. Decorative: the participant list shows who
 * reacted. With reduced motion they fade in place instead (see app.css).
 */
export function FloatingReactions() {
  const reactions = useAppSelector(selectFloatingReactions)
  if (reactions.length === 0) return null
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {reactions.map((reaction) => (
        <Floater key={reaction.id} reaction={reaction} />
      ))}
    </div>
  )
}

function Floater({ reaction }: { reaction: FloatingReaction }) {
  const dispatch = useAppDispatch()
  useEffect(() => {
    const timer = setTimeout(() => dispatch(floatingReactionDone(reaction.id)), FLOAT_MS)
    return () => clearTimeout(timer)
  }, [dispatch, reaction.id])

  const style = {
    left: `${reaction.x}%`,
    animationDuration: `${FLOAT_MS}ms`,
    "--sway": `${reaction.sway}px`,
  } as CSSProperties
  return (
    <span className="reaction-float absolute bottom-8 text-5xl leading-none" style={style}>
      <span className="reaction-sway">{reaction.emoji}</span>
    </span>
  )
}
