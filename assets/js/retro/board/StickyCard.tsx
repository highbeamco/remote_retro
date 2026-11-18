import { CategoryIcon } from "../components/CategoryIcon"
import { memo, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react"
import { CARD_W, cardHeight } from "../constants"
import { useAppDispatch } from "../store/hooks"
import { ideaMovedLocally } from "../store/slices"
import type { User } from "../types"
import type { PlacedIdea } from "./selectors"
import type { RemoteDragStore } from "./remoteDrags"
import { moveIdea, pushDrag } from "./thunks"
import { throttle, type Throttled } from "./throttle"

export const DRAG_PUSH_MS = 50
export const NUDGE = 10
const DRAG_THRESHOLD_PX = 3

/** Constant body type; `cardHeight` (constants.ts) sizes the card for it. */
export const BODY_FONT_PX = 14
export const BODY_LINE_PX = 20

const raf: (cb: () => void) => number =
  typeof requestAnimationFrame === "function" ? (cb) => requestAnimationFrame(cb) : (cb) => setTimeout(cb, 16) as unknown as number
const caf: (id: number) => void =
  typeof cancelAnimationFrame === "function" ? (id) => cancelAnimationFrame(id) : (id) => clearTimeout(id)

interface DragState {
  pointerId: number
  startClient: { x: number; y: number }
  from: { x: number; y: number }
  latest: { x: number; y: number }
  moved: boolean
  frame: number | null
  push: Throttled<[{ id: number; x: number; y: number }]>
}

export interface StickyCardProps {
  idea: PlacedIdea
  color: string | null
  scale: number
  disabled: boolean
  remoteDrags: RemoteDragStore
  users: Record<number, User | undefined>
}

export const StickyCard = memo(function StickyCard({ idea, color, scale, disabled, remoteDrags, users }: StickyCardProps) {
  const dispatch = useAppDispatch()
  const drag = useRef<DragState | null>(null)
  const [dragging, setDragging] = useState(false)
  const remote = useSyncExternalStore(remoteDrags.subscribe, () => remoteDrags.get(idea.id))
  const scaleRef = useRef(scale)
  scaleRef.current = scale

  // An authoritative position update ends any remote drag preview for this card.
  const prevPos = useRef({ x: idea.x, y: idea.y })
  useEffect(() => {
    if (prevPos.current.x !== idea.x || prevPos.current.y !== idea.y) {
      prevPos.current = { x: idea.x, y: idea.y }
      if (!drag.current) remoteDrags.clear(idea.id)
    }
  }, [idea.x, idea.y, idea.id, remoteDrags])

  useEffect(
    () => () => {
      if (drag.current?.frame != null) caf(drag.current.frame)
      drag.current?.push.cancel()
    },
    [],
  )

  const locked = Boolean(remote) && !dragging
  const blocked = disabled || locked

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    if (blocked || drag.current || (e.pointerType === "mouse" && e.button !== 0)) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    drag.current = {
      pointerId: e.pointerId,
      startClient: { x: e.clientX, y: e.clientY },
      from: { x: idea.x, y: idea.y },
      latest: { x: idea.x, y: idea.y },
      moved: false,
      frame: null,
      push: throttle((p) => dispatch(pushDrag(p)), DRAG_PUSH_MS),
    }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    e.stopPropagation()
    const dx = e.clientX - d.startClient.x
    const dy = e.clientY - d.startClient.y
    if (!d.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      d.moved = true
      setDragging(true)
    }
    const s = scaleRef.current
    d.latest = { x: Math.round(d.from.x + dx / s), y: Math.round(d.from.y + dy / s) }
    d.push({ id: idea.id, ...d.latest })
    if (d.frame == null) {
      d.frame = raf(() => {
        d.frame = null
        dispatch(ideaMovedLocally({ id: idea.id, ...d.latest }))
      })
    }
  }

  const endDrag = (e: PointerEvent<HTMLDivElement>, commit: boolean) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    e.stopPropagation()
    drag.current = null
    if (d.frame != null) caf(d.frame)
    d.push.cancel()
    setDragging(false)
    if (!d.moved) return
    if (commit) {
      dispatch(ideaMovedLocally({ id: idea.id, ...d.latest }))
      dispatch(moveIdea({ id: idea.id, ...d.latest, from: d.from }))
    } else {
      dispatch(ideaMovedLocally({ id: idea.id, ...d.from }))
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-NUDGE, 0],
      ArrowRight: [NUDGE, 0],
      ArrowUp: [0, -NUDGE],
      ArrowDown: [0, NUDGE],
    }
    const step = delta[e.key]
    if (!step) return
    e.preventDefault()
    e.stopPropagation()
    if (blocked) return
    const from = { x: idea.x, y: idea.y }
    const to = { x: idea.x + step[0], y: idea.y + step[1] }
    dispatch(ideaMovedLocally({ id: idea.id, ...to }))
    dispatch(moveIdea({ id: idea.id, ...to, from }))
  }

  const x = remote && !dragging ? remote.x : idea.x
  const y = remote && !dragging ? remote.y : idea.y
  const dragger = remote ? users[remote.userId] : undefined

  return (
    <div
      role="button"
      tabIndex={0}
      aria-roledescription="draggable idea"
      aria-label={`${idea.category} idea: ${idea.body}`}
      aria-disabled={blocked || undefined}
      data-idea-id={idea.id}
      data-dragging={dragging || undefined}
      data-locked={locked || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endDrag(e, true)}
      onPointerCancel={(e) => endDrag(e, false)}
      onLostPointerCapture={(e) => endDrag(e, true)}
      onKeyDown={onKeyDown}
      className={[
        "absolute left-0 top-0 flex flex-col rounded-md border bg-base-100 p-2 shadow-sm outline-none",
        "focus-visible:ring-2 focus-visible:ring-primary",
        dragging ? "z-20 cursor-grabbing shadow-xl" : blocked ? "cursor-not-allowed" : "cursor-grab",
        // Lift the card under the pointer (or keyboard focus) out of its stack so it can be read.
        dragging ? "" : "hover:z-10 hover:shadow-md focus-visible:z-10",
        // Someone else is moving it: keep it (and its name tag) above the cards it passes.
        remote && !dragging ? "z-10 transition-transform duration-75 ease-linear" : "",
      ].join(" ")}
      style={{
        width: CARD_W,
        height: cardHeight(idea.body),
        transform: `translate(${x}px, ${y}px)${dragging ? " rotate(-1.5deg)" : ""}`,
        borderColor: color ?? "var(--color-base-300)",
        borderWidth: color ? 3 : 1,
        boxShadow: dragger ? `0 0 0 3px var(--color-accent)` : undefined,
        touchAction: "none",
      }}
    >
      {dragger && (
        // Name tag on the top edge; it ends where the padding does, so it never covers text.
        <span
          className="pointer-events-none absolute -top-3 left-2 flex h-5 max-w-44 items-center gap-1 rounded-full bg-accent pr-2 pl-0.5 text-xs text-accent-content shadow-sm"
          aria-label={`${dragger.given_name} is moving this`}
        >
          {dragger.picture ? (
            <img src={dragger.picture} alt="" className="size-4 rounded-full" />
          ) : (
            <span className="hero-hand-raised-micro size-4" aria-hidden="true" />
          )}
          <span className="truncate">{dragger.given_name}</span>
        </span>
      )}
      {/* CARD_CHROME (44) = 2x8 padding + up to 2x3 border + 22 spare for the line the badge may push down. */}
      {/* The badge floats beside the first line only, so text wraps around it; scrolling is only a safety net. */}
      <p
        className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words"
        style={{ fontSize: BODY_FONT_PX, lineHeight: `${BODY_LINE_PX}px` }}
      >
        <span className="float-right mt-0.5 ml-1.5 flex">
          <CategoryIcon category={idea.category} size="xs" labelled />
        </span>
        {idea.body}
      </p>
    </div>
  )
})
