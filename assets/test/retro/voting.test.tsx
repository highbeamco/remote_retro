import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Voting } from "../../js/retro/stages/Voting"
import { group, idea, mockChannel, renderWithStore, retro, setup, snapshot, vote } from "./helpers"

const snap = (votes = [] as ReturnType<typeof vote>[]) =>
  snapshot({
    retro: retro({ stage: "voting" }),
    ideas: [
      idea({ id: 1, group_id: 10, body: "Flaky CI" }),
      idea({ id: 2, group_id: 11, body: "a" }),
      idea({ id: 3, group_id: 11, body: "b" }),
    ],
    groups: [group(10), group(11, "Process")],
    votes,
  })

describe("Voting", () => {
  it("shows singleton bodies and labels, and votes", async () => {
    const { channel, push } = mockChannel(() => Promise.resolve({ vote: vote(9, 1, 10) }))
    renderWithStore(<Voting />, setup(snap(), { channel }))
    expect(screen.getByRole("heading", { name: "Flaky CI" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Process" })).toBeInTheDocument()
    expect(screen.getByText("3 votes left")).toBeInTheDocument()
    expect(screen.getAllByRole("article")).toHaveLength(2)

    await userEvent.click(screen.getByRole("button", { name: "Vote for Flaky CI" }))
    expect(push).toHaveBeenCalledWith("vote:create", { group_id: 10 })
    expect(await screen.findByText("2 votes left")).toBeInTheDocument()
    expect(screen.getByText("1 vote from you")).toBeInTheDocument()
  })

  it("disables voting once the limit is reached but allows retracting", async () => {
    const { channel, push } = mockChannel()
    renderWithStore(<Voting />, setup(snap([vote(1, 1, 10), vote(2, 1, 10), vote(3, 1, 11)]), { channel }))
    expect(screen.getByText("All votes used")).toBeInTheDocument()
    for (const button of screen.getAllByRole("button", { name: /^vote for/i })) expect(button).toBeDisabled()

    await userEvent.click(screen.getByRole("button", { name: "Remove a vote from Process" }))
    expect(push).toHaveBeenCalledWith("vote:delete", { id: 3 })
    expect(screen.getByText("1 vote left")).toBeInTheDocument()
    // Last vote gone: the remove button goes away and focus lands on Vote.
    expect(screen.queryByRole("button", { name: "Remove a vote from Process" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Vote for Process" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Vote for Process" })).toHaveFocus()
  })

  it("keeps focus in the control when spending your last vote", async () => {
    const { channel } = mockChannel(() => Promise.resolve({ vote: vote(9, 1, 11) }))
    renderWithStore(<Voting />, setup(snap([vote(1, 1, 10), vote(2, 1, 11)]), { channel }))

    await userEvent.click(screen.getByRole("button", { name: "Vote for Process" }))
    expect(await screen.findByText("All votes used")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Vote for Process" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Remove a vote from Process" })).toHaveFocus()
    expect(screen.getByText("2 votes from you")).toBeInTheDocument()
  })

  it("keeps the add-vote button the same element in the same spot as votes are added", async () => {
    let id = 100
    const { channel } = mockChannel(() => Promise.resolve({ vote: vote(++id, 1, 10) }))
    renderWithStore(<Voting />, setup(snap(), { channel }))
    const add = screen.getByRole("button", { name: "Vote for Flaky CI" })
    const parent = add.parentElement!
    const className = add.className
    const check = () => {
      expect(screen.getByRole("button", { name: "Vote for Flaky CI" })).toBe(add)
      expect(add.parentElement).toBe(parent)
      expect(parent.lastElementChild).toBe(add)
      expect(add.className).toBe(className)
      expect(add.textContent).toBe("")
    }
    check()

    await userEvent.click(add)
    expect(await screen.findByText("1 vote from you")).toBeInTheDocument()
    check()
    await userEvent.click(add)
    expect(await screen.findByText("2 votes from you")).toBeInTheDocument()
    check()
    await userEvent.click(add)
    expect(await screen.findByText("3 votes from you")).toBeInTheDocument()
    expect(add).toBeDisabled()
    check()
  })

  it("shows long titles and ideas in full, with no clamping or expand toggles", () => {
    const long = "Our deploy pipeline breaks every other Friday ".repeat(10).trim()
    const s = snapshot({
      retro: retro({ stage: "voting" }),
      ideas: [
        idea({ id: 1, group_id: 10, body: `${long} (single)` }),
        idea({ id: 2, group_id: 11, body: `${long} (grouped)` }),
        idea({ id: 3, group_id: 11, body: "b" }),
      ],
      groups: [group(10), group(11, "Process")],
    })
    const { container } = renderWithStore(<Voting />, setup(s))
    expect(screen.getByRole("heading", { name: `${long} (single)` })).toBeInTheDocument()
    expect(screen.getByText(`${long} (grouped)`)).toBeInTheDocument()
    expect(container.querySelector("[class*='line-clamp'], [class*='truncate']")).toBeNull()
    // The vote control is each card's only button.
    for (const card of screen.getAllByRole("article")) {
      expect(within(card).getByRole("button")).toHaveAccessibleName(/^Vote for /)
    }
  })

  it("hides other users' vote totals", () => {
    renderWithStore(<Voting />, setup(snap([vote(1, 2, 10), vote(2, 2, 10)])))
    expect(screen.queryByText(/2 votes/)).not.toBeInTheDocument()
    expect(screen.queryByText(/from you/)).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Remove a vote from Flaky CI" })).not.toBeInTheDocument()
  })

  it("lists bigger groups first in one grid, whatever the votes", () => {
    const s = snapshot({
      retro: retro({ stage: "voting" }),
      ideas: [
        idea({ id: 1, group_id: 10, body: "Flaky CI" }),
        idea({ id: 2, group_id: 11 }),
        idea({ id: 3, group_id: 11 }),
        idea({ id: 4, group_id: 12 }),
        idea({ id: 5, group_id: 12 }),
        idea({ id: 6, group_id: 12 }),
        idea({ id: 7, group_id: 13, body: "Standups run long" }),
      ],
      groups: [group(10), group(11, "Process"), group(12, "Tooling"), group(13)],
      votes: [vote(1, 1, 10), vote(2, 1, 10), vote(3, 2, 13)],
    })
    renderWithStore(<Voting />, setup(s))
    expect(screen.queryByRole("region")).not.toBeInTheDocument()
    const titles = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)
    expect(titles).toEqual(["Tooling", "Process", "Flaky CI", "Standups run long"])
  })

  it("still shows the idea of a labelled group that's down to one idea", () => {
    const s = snapshot({
      retro: retro({ stage: "voting" }),
      ideas: [idea({ id: 1, group_id: 10, body: "Flaky CI" })],
      groups: [group(10, "CI")],
    })
    renderWithStore(<Voting />, setup(s))
    expect(screen.getByRole("heading", { name: "CI" })).toBeInTheDocument()
    expect(screen.getByText("Flaky CI")).toBeInTheDocument()
  })
})
