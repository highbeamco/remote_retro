import { screen, within } from "@testing-library/react"
import { IdeaGeneration } from "../../js/retro/stages/IdeaGeneration"
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
})
