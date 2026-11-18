import { useEffect, useId, useRef, useState } from "react"
import { useAppDispatch } from "../store/hooks"
import { sendReaction } from "../store/thunks"
import { EmojiPicker } from "./EmojiPicker"

/**
 * The current user's "add reaction" button. The picker drops below the enclosing positioned
 * element (the participant row) at its full width, so it fits the narrow sidebar.
 */
export function AddReaction() {
  const dispatch = useAppDispatch()
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const pickerId = useId()

  const close = () => {
    setOpen(false)
    buttonRef.current?.focus()
  }

  // A press anywhere else closes it (without moving focus).
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  return (
    <div
      ref={wrapperRef}
      className="shrink-0"
      // Tabbing out of the picker closes it too.
      onBlur={(e) => {
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false)
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-ghost btn-xs btn-circle -my-1 text-base-content/60 opacity-60 group-hover:opacity-100 hover:text-base-content focus-visible:opacity-100 aria-expanded:opacity-100"
        onClick={() => setOpen((o) => !o)}
        aria-label="Add a reaction"
        title="React"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? pickerId : undefined}
      >
        <span className="hero-face-smile size-4" aria-hidden="true" />
      </button>
      {open && (
        <EmojiPicker
          id={pickerId}
          className="absolute inset-x-0 top-full z-20 mt-1"
          onClose={close}
          onPick={(emoji) => {
            dispatch(sendReaction(emoji))
            close()
          }}
        />
      )}
    </div>
  )
}
