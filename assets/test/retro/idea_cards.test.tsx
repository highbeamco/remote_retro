import { screen, within } from "@testing-library/react"
import { IdeaGeneration } from "../../js/retro/stages/IdeaGeneration"
import { ideaUpserted } from "../../js/retro/store/slices"
import { idea, renderWithStore, setup, snapshot } from "./helpers"

describe("Idea cards (idea generation)", () => {
  const ideas = [idea({ id: 1, user_id: 1, body: "Too many meetings" }), idea({ id: 2, user_id: 2, body: "Flaky CI" })]
  const cardFor = (body: string) => screen.getByText(body).closest("li")!

  it("does not show the author's name", () => {
    renderWithStore(<IdeaGeneration />, setup(snapshot({ ideas })))
    expect(cardFor("Too many meetings")).not.toHaveTextContent("Ada")
    expect(cardFor("Flaky CI")).not.toHaveTextContent("Bob")
  })

  it("still lets authors edit and delete only their own ideas", () => {
    renderWithStore(<IdeaGeneration />, setup(snapshot({ ideas }), { userId: 2 }))
    expect(within(cardFor("Flaky CI")).getByRole("button", { name: "Edit" })).toBeInTheDocument()
    expect(within(cardFor("Flaky CI")).getByRole("button", { name: "Delete" })).toBeInTheDocument()
    expect(within(cardFor("Too many meetings")).queryByRole("button")).not.toBeInTheDocument()
  })

  it("floats the controls beside the text, with no footer row", () => {
    renderWithStore(<IdeaGeneration />, setup(snapshot({ ideas }), { userId: 2 }))
    const text = screen.getByText("Flaky CI")
    expect(within(text).getByRole("button", { name: "Edit" }).parentElement!.className).toContain("float-right")
    expect(text.parentElement!.children).toHaveLength(1)
  })

  it("keeps the controls' space but disables them while a new idea saves", () => {
    const store = setup(snapshot(), { userId: 2 })
    store.dispatch(ideaUpserted(idea({ id: -1, user_id: 2, body: "Saving" })))
    renderWithStore(<IdeaGeneration />, store)
    const edit = within(cardFor("Saving")).getByRole("button", { name: "Edit" })
    expect(edit).toBeDisabled()
    expect(edit.parentElement!.className).toContain("invisible")
  })
})
