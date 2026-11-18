import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { IdeaGeneration } from "../../js/retro/stages/IdeaGeneration"
import { userTyping } from "../../js/retro/store/slices"
import { idea, renderWithStore, setup, snapshot } from "./helpers"

describe("Idea generation layout", () => {
  const ideas = [idea({ id: 1, body: "Pairing" }), idea({ id: 2, body: "Demos" }), idea({ id: 3, category: "sad", body: "Flaky CI" })]
  const original = window.matchMedia
  const setDesktop = (matches: boolean) => {
    window.matchMedia = ((media: string) => ({ matches, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
  }
  afterEach(() => {
    window.matchMedia = original
  })

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
