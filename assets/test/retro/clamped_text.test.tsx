import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ClampedText } from "../../js/retro/components/ClampedText"

// jsdom has no layout, so fake an overflowing box.
const overflow = () => {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => 48 })
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 32 })
}

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight")
  Reflect.deleteProperty(HTMLElement.prototype, "clientHeight")
})

describe("ClampedText", () => {
  it("has no toggle when the text fits", () => {
    render(<ClampedText>Short</ClampedText>)
    expect(screen.getByText("Short")).toHaveClass("line-clamp-2")
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("expands and collapses overflowing text, keeping focus on the toggle", async () => {
    overflow()
    render(<ClampedText lines={3}>A very long idea</ClampedText>)
    const text = screen.getByText("A very long idea")
    const toggle = screen.getByRole("button", { name: "more" })
    expect(text).toHaveClass("line-clamp-3")
    expect(toggle).toHaveAttribute("aria-expanded", "false")

    await userEvent.click(toggle)
    expect(text).not.toHaveClass("line-clamp-3")
    expect(screen.getByRole("button", { name: "less" })).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("button", { name: "less" })).toHaveFocus()

    await userEvent.keyboard("{Enter}")
    expect(text).toHaveClass("line-clamp-3")
    expect(screen.getByRole("button", { name: "more" })).toHaveFocus()
  })
})
