import { fireEvent, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { IdeaGeneration } from "../../js/retro/stages/IdeaGeneration"
import { userTyping } from "../../js/retro/store/slices"
import { idea, mockChannel, renderWithStore, setup, snapshot } from "./helpers"

const original = window.matchMedia
const setDesktop = (matches: boolean) => {
  window.matchMedia = ((media: string) => ({ matches, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
}
afterEach(() => {
  window.matchMedia = original
})

describe("Idea generation layout", () => {
  const ideas = [idea({ id: 1, body: "Pairing" }), idea({ id: 2, body: "Demos" }), idea({ id: 3, category: "sad", body: "Flaky CI" })]

  it("gives each category a full-height column whose list scrolls on its own", () => {
    setDesktop(true)
    renderWithStore(<IdeaGeneration />, setup(snapshot({ ideas })))
    const happy = screen.getByRole("region", { name: "Happy, 2 ideas" })
    expect(screen.getByRole("region", { name: "Sad, 1 idea" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Confused, 0 ideas" })).toHaveTextContent("No ideas yet")
    expect(happy.className).toContain("h-full")
    const list = within(happy).getByRole("list")
    expect(list.className).toMatch(/\bflex-1\b/)
    expect(list.className).toContain("overflow-y-auto")
  })

  it("labels the mobile tab panel with the selected category", async () => {
    setDesktop(false)
    renderWithStore(<IdeaGeneration />, setup(snapshot({ ideas })))
    expect(screen.getByRole("tabpanel", { name: /happy/i })).toHaveTextContent("Pairing")
    const sad = screen.getByRole("tab", { name: /sad/i })
    await userEvent.click(sad)
    const panel = screen.getByRole("tabpanel", { name: /sad/i })
    expect(panel).toHaveTextContent("Flaky CI")
    expect(sad).toHaveAttribute("aria-controls", panel.id)
  })

  it("shows who else is typing in the form footer", () => {
    const store = setup(snapshot())
    store.dispatch(userTyping({ userId: 1, typing: true }))
    store.dispatch(userTyping({ userId: 2, typing: true }))
    renderWithStore(<IdeaGeneration />, store)
    expect(within(screen.getByRole("form", { name: "Submit an idea" })).getByText("Bob is typing…")).toBeInTheDocument()
  })
})

describe("Moving ideas between categories", () => {
  // Ada (1) facilitates; Bob (2) wrote only "Demos".
  const ideas = [idea({ id: 1, body: "Pairing" }), idea({ id: 2, user_id: 2, body: "Demos" }), idea({ id: 3, category: "sad", body: "Flaky CI" })]
  const card = (text: string) => screen.getByText(text).closest("li")!
  const column = (name: RegExp) => screen.getByRole("region", { name })
  const dataTransfer = () => ({ setData: vi.fn(), dropEffect: "", effectAllowed: "" })

  function renderStage(userId = 1) {
    const { channel, push } = mockChannel()
    renderWithStore(<IdeaGeneration />, setup(snapshot({ ideas }), { userId, channel }))
    return push
  }

  it("drags a card to another column, highlighting the column under it", () => {
    setDesktop(true)
    const push = renderStage()
    const dt = dataTransfer()
    fireEvent.dragStart(card("Pairing"), { dataTransfer: dt })
    fireEvent.dragOver(column(/^Sad/), { dataTransfer: dt })
    expect(column(/^Sad/).className).toContain("outline-primary")
    expect(column(/^Confused/).className).toContain("outline-dashed")
    expect(column(/^Happy/).className).not.toContain("outline")

    fireEvent.drop(column(/^Sad/), { dataTransfer: dt })
    expect(push).toHaveBeenCalledWith("idea:update", { id: 1, category: "sad" })
    expect(column(/^Sad/)).toHaveTextContent("Pairing")
    expect(column(/^Sad/).className).not.toContain("outline")
  })

  it("ignores drops on the card's own column", () => {
    setDesktop(true)
    const push = renderStage()
    const dt = dataTransfer()
    fireEvent.dragStart(card("Pairing"), { dataTransfer: dt })
    fireEvent.dragOver(column(/^Happy/), { dataTransfer: dt })
    fireEvent.drop(column(/^Happy/), { dataTransfer: dt })
    expect(push).not.toHaveBeenCalledWith("idea:update", expect.anything())
  })

  it("only lets people drag or move ideas they can edit", () => {
    setDesktop(true)
    renderStage(2)
    expect(card("Demos")).toHaveAttribute("draggable", "true")
    expect(within(card("Demos")).getByRole("combobox", { name: "Move to category" })).toBeInTheDocument()
    expect(card("Pairing")).not.toHaveAttribute("draggable")
    expect(within(card("Pairing")).queryByRole("combobox")).not.toBeInTheDocument()
  })

  it("offers a Move to menu in the card controls on mobile tabs", async () => {
    setDesktop(false)
    const push = renderStage()
    expect(card("Pairing")).not.toHaveAttribute("draggable")
    const menu = within(card("Pairing")).getByRole("combobox", { name: "Move to category" })
    expect([...menu.querySelectorAll("option:not([disabled])")].map((o) => o.textContent)).toEqual(["Sad", "Confused"])

    await userEvent.selectOptions(menu, "Sad")
    expect(push).toHaveBeenCalledWith("idea:update", { id: 1, category: "sad" })
    await userEvent.click(screen.getByRole("tab", { name: /sad/i }))
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Pairing")
  })
})
