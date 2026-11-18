import { act, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { RetroChannel } from "../../js/retro/channel"
import { FLOAT_MS, FloatingReactions } from "../../js/retro/components/FloatingReactions"
import { UserList } from "../../js/retro/components/UserList"
import { REACTION_MS, bindChannel } from "../../js/retro/store/bind_channel"
import { MAX_FLOATING_REACTIONS, reactionReceived } from "../../js/retro/store/slices"
import { mockChannel, renderWithStore, setup } from "./helpers"

/** A channel whose server broadcasts the test can play. */
function broadcastingChannel() {
  const handlers = new Map<string, (payload: unknown) => void>()
  const channel = {
    on: (event: string, handler: (payload: unknown) => void) => handlers.set(event, handler),
    // Presence only subscribes to the raw channel.
    raw: { on: vi.fn() },
  } as unknown as RetroChannel
  const emit = (event: string, payload: unknown) =>
    act(() => {
      handlers.get(event)?.(payload)
    })
  return { channel, emit }
}

const picker = () => screen.queryByRole("dialog", { name: "Pick a reaction" })
const addButton = () => screen.getByRole("button", { name: "Add a reaction" })

describe("reaction picker", () => {
  async function openPicker() {
    const { channel, push } = mockChannel()
    renderWithStore(<UserList />, setup(undefined, { channel }))
    await userEvent.click(addButton())
    return { push, search: screen.getByRole("searchbox", { name: "Search emoji" }) }
  }

  it("is offered on your own row only", () => {
    renderWithStore(<UserList />, setup())
    expect(screen.getAllByRole("button", { name: "Add a reaction" })).toHaveLength(1)
    expect(addButton().closest("li")).toHaveTextContent("Ada Lovelace")
  })

  it("opens with the search box focused and filters by name and keyword", async () => {
    const { search } = await openPicker()
    expect(search).toHaveFocus()
    expect(addButton()).toHaveAttribute("aria-expanded", "true")

    await userEvent.type(search, "party")
    expect(within(picker()!).getByRole("button", { name: "party popper" })).toBeInTheDocument()
    expect(within(picker()!).queryByRole("button", { name: "thumbs up" })).not.toBeInTheDocument()

    await userEvent.clear(search)
    await userEvent.type(search, "xyzzy")
    expect(within(picker()!).getByText(/no emoji match/i)).toBeInTheDocument()
  })

  it("sends the first match on Enter, then closes and returns focus", async () => {
    const { push, search } = await openPicker()
    await userEvent.type(search, "tada{Enter}")
    expect(push).toHaveBeenCalledWith("user:react", { emoji: "🎉" })
    expect(picker()).not.toBeInTheDocument()
    expect(addButton()).toHaveFocus()
  })

  it("sends a clicked emoji", async () => {
    const { push } = await openPicker()
    await userEvent.click(within(picker()!).getByRole("button", { name: "thumbs up" }))
    expect(push).toHaveBeenCalledWith("user:react", { emoji: "👍" })
    expect(picker()).not.toBeInTheDocument()
  })

  it("moves from the search box into the grid with the arrow keys", async () => {
    const { search } = await openPicker()
    await userEvent.type(search, "heart{ArrowDown}")
    expect(within(picker()!).getByRole("button", { name: "red heart" })).toHaveFocus()
    await userEvent.keyboard("{ArrowRight}")
    expect(within(picker()!).getByRole("button", { name: "orange heart" })).toHaveFocus()
  })

  it("closes on Escape or a click elsewhere without sending anything", async () => {
    const { push } = await openPicker()
    await userEvent.keyboard("{Escape}")
    expect(picker()).not.toBeInTheDocument()
    expect(addButton()).toHaveFocus()

    await userEvent.click(addButton())
    expect(picker()).toBeInTheDocument()
    await userEvent.click(document.body)
    expect(picker()).not.toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })
})

describe("received reactions", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("show by the sender's name for 15s; a newer one replaces it and restarts the clock", () => {
    const store = setup()
    const { channel, emit } = broadcastingChannel()
    bindChannel(channel, store.dispatch)
    renderWithStore(<UserList />, store)
    const bob = () => within(screen.getByText("Bob Builder").closest("li")!)

    emit("user:reaction", { user_id: 2, emoji: "🎉" })
    expect(bob().getByRole("img", { name: "Reacted with party popper" })).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    emit("user:reaction", { user_id: 2, emoji: "👍" })
    expect(bob().queryByRole("img", { name: /party popper/ })).not.toBeInTheDocument()
    expect(bob().getByRole("img", { name: "Reacted with thumbs up" })).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(REACTION_MS - 1)
    })
    expect(bob().getByRole("img", { name: "Reacted with thumbs up" })).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(bob().queryByRole("img", { name: /reacted/i })).not.toBeInTheDocument()
  })

  it(`float up the screen, at most ${MAX_FLOATING_REACTIONS} at once, newest kept`, () => {
    const store = setup()
    renderWithStore(<FloatingReactions />, store)
    const floating = () => [...document.querySelectorAll(".reaction-float")]

    act(() => {
      for (let i = 0; i < MAX_FLOATING_REACTIONS + 10; i++) store.dispatch(reactionReceived({ userId: 1, emoji: "👍" }))
      store.dispatch(reactionReceived({ userId: 2, emoji: "🎉" }))
    })
    expect(floating()).toHaveLength(MAX_FLOATING_REACTIONS)
    expect(floating().at(-1)).toHaveTextContent("🎉")

    act(() => {
      vi.advanceTimersByTime(FLOAT_MS)
    })
    expect(floating()).toHaveLength(0)
  })
})
