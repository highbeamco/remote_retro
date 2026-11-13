import { fireEvent, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { cardHeight } from "../../js/retro/constants"
import { Grouping } from "../../js/retro/stages/Grouping"
import { EJECT_GAP_Y, JOIN_OVERLAP } from "../../js/retro/stages/listMoves"
import { group, idea, mockChannel, renderWithStore, retro, setup, snapshot } from "./helpers"

describe("Group & label stage", () => {
  it("always opens on the board, even after switching to the list last time", async () => {
    const store = setup(snapshot({ retro: retro({ stage: "grouping" }) }))
    const { unmount } = renderWithStore(<Grouping />, store)
    expect(screen.getByRole("tab", { name: /board/i })).toHaveAttribute("aria-selected", "true")

    await userEvent.click(screen.getByRole("tab", { name: /list/i }))
    expect(screen.getByRole("heading", { name: "Name each group" })).toBeInTheDocument()
    unmount()

    renderWithStore(<Grouping />, store)
    expect(screen.getByRole("tab", { name: /board/i })).toHaveAttribute("aria-selected", "true")
  })
})

describe("Group & label list view: moving ideas", () => {
  // Group 10: ideas 1 + 2 stacked at x 0. Ideas 3 and 4 stand alone in a column at x 400.
  const snap = () =>
    snapshot({
      retro: retro({ stage: "grouping" }),
      ideas: [
        idea({ id: 1, group_id: 10, x: 0, y: 0, body: "Flaky CI" }),
        idea({ id: 2, group_id: 10, x: 0, y: 96, body: "Slow builds" }),
        idea({ id: 3, group_id: 11, x: 400, y: 0, body: "Great pairing" }),
        idea({ id: 4, group_id: 12, x: 400, y: 300, body: "Unclear goals" }),
      ],
      groups: [group(10, "CI"), group(11), group(12)],
    })

  // Every body in this fixture is short, so all cards share the minimum height.
  const H = cardHeight("Flaky CI")
  const dataTransfer = () => ({ setData: vi.fn(), getData: vi.fn(() => ""), dropEffect: "", effectAllowed: "" })
  const row = (text: string) => screen.getByText(text).closest("li")!

  async function openList(busy = false) {
    const { channel, push } = mockChannel()
    const s = snap()
    if (busy) s.retro.ai_status = "grouping"
    const store = setup(s, { channel })
    renderWithStore(<Grouping />, store)
    await userEvent.click(screen.getByRole("tab", { name: /list/i }))
    return { push, store }
  }

  function drag(source: HTMLElement, target: HTMLElement) {
    const dt = dataTransfer()
    fireEvent.dragStart(source, { dataTransfer: dt })
    fireEvent.dragOver(target, { dataTransfer: dt })
    fireEvent.drop(target, { dataTransfer: dt })
    fireEvent.dragEnd(source, { dataTransfer: dt })
  }

  it("drops an ungrouped idea into a group, tucked under its lowest card", async () => {
    const { push, store } = await openList()
    drag(row("Great pairing"), screen.getByRole("article", { name: "Group: CI" }))
    // Lowest card in CI is idea 2: tuck under its bottom (96 + H) by JOIN_OVERLAP.
    expect(push).toHaveBeenCalledWith("idea:move", { id: 3, x: 0, y: 96 + H - JOIN_OVERLAP })
    expect(store.getState().ideas.entities[3]).toMatchObject({ x: 0, y: 96 + H - JOIN_OVERLAP })
  })

  it("drops an idea onto an ungrouped idea to group the two", async () => {
    const { push } = await openList()
    drag(row("Flaky CI"), row("Unclear goals"))
    expect(push).toHaveBeenCalledWith("idea:move", { id: 1, x: 400, y: 300 + H - JOIN_OVERLAP })
  })

  it("takes an idea out of its group into free space", async () => {
    const { push } = await openList()
    const section = screen.getByRole("region", { name: /ungrouped ideas/i })
    fireEvent.dragStart(row("Slow builds"), { dataTransfer: dataTransfer() })
    fireEvent.dragOver(section)
    expect(section).toHaveTextContent(/drop here to take it out of its group/i)
    fireEvent.drop(section)
    // Right-most column holds only lone ideas, so it stacks there below idea 3 with a gap.
    expect(push).toHaveBeenCalledWith("idea:move", { id: 2, x: 400, y: H + EJECT_GAP_Y })
  })

  it("ignores drops onto the idea's own group", async () => {
    const { push } = await openList()
    drag(row("Flaky CI"), screen.getByRole("article", { name: "Group: CI" }))
    expect(push).not.toHaveBeenCalledWith("idea:move", expect.anything())
  })

  it("offers a Move to… menu as a keyboard alternative", async () => {
    const { push } = await openList()
    const menu = screen.getByRole("combobox", { name: "Move “Flaky CI” to" })
    // Its own group isn't an option.
    expect([...menu.querySelectorAll("option")].find((o) => o.textContent === "CI")).toBeDisabled()
    await userEvent.selectOptions(menu, "Ungrouped")
    expect(push).toHaveBeenCalledWith("idea:move", { id: 1, x: 400, y: H + EJECT_GAP_Y })

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Move “Great pairing” to" }), "CI")
    // Idea 1 now sits under idea 4 and tucking under it would touch idea 4, so it goes under idea 2.
    expect(push).toHaveBeenCalledWith("idea:move", { id: 3, x: 0, y: 96 + H - JOIN_OVERLAP })
  })

  it("doesn't allow moving while Gemini is grouping", async () => {
    const { push } = await openList(true)
    expect(row("Great pairing")).toHaveAttribute("draggable", "false")
    expect(screen.getByRole("combobox", { name: "Move “Great pairing” to" })).toBeDisabled()
    drag(row("Great pairing"), screen.getByRole("article", { name: "Group: CI" }))
    expect(push).not.toHaveBeenCalledWith("idea:move", expect.anything())
  })
})

describe("Re-run grouping", () => {
  it("is offered to the facilitator when AI is configured, and asks the server to regroup", async () => {
    const { channel, push } = mockChannel(() => Promise.resolve({ status: "started" }))
    const store = setup(snapshot({ retro: retro({ stage: "grouping" }), ai_enabled: true }), { channel })
    renderWithStore(<Grouping />, store)
    await userEvent.click(screen.getByRole("button", { name: /re-run grouping/i }))
    expect(push).toHaveBeenCalledWith("ai:regroup", {})
  })

  it("says so when every idea is already grouped", async () => {
    const { channel } = mockChannel(() => Promise.resolve({ status: "nothing_to_group" }))
    const store = setup(snapshot({ retro: retro({ stage: "grouping" }), ai_enabled: true }), { channel })
    renderWithStore(<Grouping />, store)
    await userEvent.click(screen.getByRole("button", { name: /re-run grouping/i }))
    expect(store.getState().ui.toasts.at(-1)?.message).toBe("Every idea is already in a group.")
  })

  it("is hidden for participants and when AI isn't configured", () => {
    const { unmount } = renderWithStore(
      <Grouping />,
      setup(snapshot({ retro: retro({ stage: "grouping" }), ai_enabled: true }), { userId: 2 }),
    )
    expect(screen.queryByRole("button", { name: /re-run grouping/i })).not.toBeInTheDocument()
    unmount()
    renderWithStore(<Grouping />, setup(snapshot({ retro: retro({ stage: "grouping" }), ai_enabled: false })))
    expect(screen.queryByRole("button", { name: /re-run grouping/i })).not.toBeInTheDocument()
  })
})
