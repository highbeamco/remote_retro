import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { Provider } from "react-redux"
import type { RetroChannel } from "../channel"
import { makeStore } from "../store"
import { currentUserSet, groupUpserted, snapshotReceived } from "../store/slices"
import type { Group, Idea, Snapshot } from "../types"
import { Board } from "./Board"
import { CARD_H, cardHeight } from "../constants"
import { LABEL_DEBOUNCE_MS, LABEL_MIN_PX, LABEL_WIDTH, labelWidth } from "./GroupLabel"

const idea = (id: number, x: number | null, y: number | null, group_id: number | null, body = `idea ${id}`): Idea => ({
  id,
  retro_id: "r1",
  user_id: 1,
  category: "happy",
  body,
  x,
  y,
  group_id,
  assignee_id: null,
  inserted_at: "",
})

const group = (id: number, label: string | null = null, label_source: Group["label_source"] = null): Group => ({
  id,
  retro_id: "r1",
  label,
  label_source,
})

function setup({ ideas, groups = [], aiStatus = null }: { ideas: Idea[]; groups?: Group[]; aiStatus?: "grouping" | null }) {
  const handlers = new Map<string, (payload: unknown) => void>()
  const channel = {
    push: vi.fn().mockResolvedValue({}),
    on: vi.fn((event: string, cb: (payload: unknown) => void) => handlers.set(event, cb)),
  }
  const store = makeStore(channel as unknown as RetroChannel)
  const snapshot: Snapshot = {
    retro: { id: "r1", format: "happy_sad_confused", stage: "grouping", facilitator_id: 1, ai_status: aiStatus, inserted_at: "" },
    users: [
      { id: 1, name: "Ada Lovelace", given_name: "Ada", family_name: "Lovelace", picture: null },
      { id: 2, name: "Grace Hopper", given_name: "Grace", family_name: "Hopper", picture: null },
    ],
    ideas,
    groups,
    votes: [],
  }
  store.dispatch(snapshotReceived(snapshot))
  store.dispatch(currentUserSet(1))
  const utils = render(
    <Provider store={store}>
      <Board mode="grouping" />
    </Provider>,
  )
  const pushes = (event: string) => channel.push.mock.calls.filter(([e]) => e === event).map(([, p]) => p)
  return { ...utils, store, channel, handlers, pushes }
}

const card = (body: string) => screen.getByRole("button", { name: new RegExp(body) })

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("Board drag", () => {
  it("throttles idea:drag pushes and sends one idea:move on drop", async () => {
    const { pushes, store } = setup({ ideas: [idea(1, 100, 100, 1)], groups: [group(1)] })
    const el = card("idea 1")

    fireEvent.pointerDown(el, { pointerId: 1, button: 0, clientX: 0, clientY: 0, pointerType: "mouse" })
    for (let i = 1; i <= 10; i++) {
      fireEvent.pointerMove(el, { pointerId: 1, clientX: i * 10, clientY: i * 5, pointerType: "mouse" })
      act(() => vi.advanceTimersByTime(10))
    }
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 100, clientY: 50, pointerType: "mouse" })
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    const drags = pushes("idea:drag")
    // 100ms of movement at 50ms throttle: leading + ~1 trailing, never one per move.
    expect(drags.length).toBeGreaterThanOrEqual(2)
    expect(drags.length).toBeLessThanOrEqual(3)
    expect(drags[0]).toEqual({ id: 1, x: 110, y: 105 })
    expect(pushes("idea:move")).toEqual([{ id: 1, x: 200, y: 150 }])
    expect(store.getState().ideas.entities[1]).toMatchObject({ x: 200, y: 150 })
  })

  it("does not push on a click without movement", () => {
    const { pushes } = setup({ ideas: [idea(1, 0, 0, 1)] })
    const el = card("idea 1")
    fireEvent.pointerDown(el, { pointerId: 1, button: 0, clientX: 5, clientY: 5 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 6, clientY: 6 })
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 6, clientY: 6 })
    expect(pushes("idea:drag")).toEqual([])
    expect(pushes("idea:move")).toEqual([])
  })

  it("refuses to drag while AI is busy", () => {
    const { pushes } = setup({ ideas: [idea(1, 0, 0, 1)], aiStatus: "grouping" })
    const el = card("idea 1")
    fireEvent.pointerDown(el, { pointerId: 1, button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 50, clientY: 50 })
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 50, clientY: 50 })
    expect(channel(pushes)).toEqual([])
    function channel(p: typeof pushes) {
      return [...p("idea:drag"), ...p("idea:move")]
    }
  })

  it("nudges a focused card with arrow keys", () => {
    const { pushes } = setup({ ideas: [idea(1, 0, 0, 1)] })
    const el = card("idea 1")
    el.focus()
    fireEvent.keyDown(el, { key: "ArrowRight" })
    fireEvent.keyDown(el, { key: "ArrowUp" })
    expect(pushes("idea:move")).toEqual([
      { id: 1, x: 10, y: 0 },
      { id: 1, x: 10, y: -10 },
    ])
  })

  it("animates and locks cards being dragged by someone else, then expires", () => {
    const { handlers, pushes } = setup({ ideas: [idea(1, 0, 0, 1)] })
    const onDragged = handlers.get("idea:dragged")!
    act(() => onDragged({ id: 1, x: 300, y: 40, user_id: 2 }))
    const el = card("idea 1")
    expect(el).toHaveAttribute("data-locked", "true")
    expect(el.style.transform).toContain("translate(300px, 40px)")
    expect(screen.getByLabelText("Grace is moving this")).toBeInTheDocument()

    fireEvent.pointerDown(el, { pointerId: 1, button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 50, clientY: 50 })
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 50, clientY: 50 })
    expect(pushes("idea:move")).toEqual([])

    act(() => vi.advanceTimersByTime(3000))
    expect(el).not.toHaveAttribute("data-locked")
    expect(el.style.transform).toContain("translate(0px, 0px)")
  })

  it("ignores its own idea:dragged echoes", () => {
    const { handlers } = setup({ ideas: [idea(1, 0, 0, 1)] })
    act(() => handlers.get("idea:dragged")!({ id: 1, x: 300, y: 40, user_id: 1 }))
    expect(card("idea 1")).not.toHaveAttribute("data-locked")
  })

  it("registers idea:dragged once per channel even if the board remounts", () => {
    const { channel, unmount, store } = setup({ ideas: [idea(1, 0, 0, 1)] })
    unmount()
    render(
      <Provider store={store}>
        <Board mode="labeling" />
      </Provider>,
    )
    expect(channel.on.mock.calls.filter(([e]) => e === "idea:dragged")).toHaveLength(1)
  })

  it("renders nothing for unplaced ideas and action items, but lists unplaced", () => {
    const action = { ...idea(3, 0, 0, null, "action thing"), category: "action-item" as const }
    setup({ ideas: [idea(1, 0, 0, 1), idea(2, null, null, null, "floating"), action] })
    expect(screen.getAllByRole("button", { name: /^happy idea/ })).toHaveLength(1)
    expect(screen.getByText("1 unplaced idea")).toBeInTheDocument()
    expect(screen.queryByText("action thing")).not.toBeInTheDocument()
  })

  it("zooms with ctrl+wheel", () => {
    setup({ ideas: [idea(1, 0, 0, 1)] })
    fireEvent.wheel(screen.getByTestId("board"), { ctrlKey: true, deltaY: -50, clientX: 0, clientY: 0 })
    expect(screen.getByRole("button", { name: /Zoom 165%/ })).toBeInTheDocument()
  })
})

describe("Board cards", () => {
  it("renders the whole body at a constant size on a card as tall as cardHeight, with no tooltip", () => {
    const body = "A long idea that goes on and on about flaky deploys,\nslow CI, and the review queue piling up every single sprint."
    setup({ ideas: [idea(1, 0, 0, null, body), idea(2, 400, 0, null, "short")] })
    const el = card("flaky deploys")
    expect(el.style.width).toBe("200px")
    expect(el.style.height).toBe(`${cardHeight(body)}px`)
    expect(cardHeight(body)).toBeGreaterThan(CARD_H)
    expect(card("short").style.height).toBe("64px")
    expect(el).not.toHaveAttribute("title")
    const text = el.querySelector("p")!
    expect(text.textContent).toBe(body)
    expect(text.style.fontSize).toBe("14px")
    expect(text.style.lineHeight).toBe("20px")
    expect(text.style.webkitLineClamp ?? "").toBe("")
    expect(text.className).toContain("whitespace-pre-wrap")
    expect(text.className).toContain("overflow-y-auto")
  })

  it("starts the body at the top, with the category as a labelled corner badge", () => {
    setup({ ideas: [idea(1, 0, 0, 1)], groups: [group(1)] })
    const el = card("idea 1")
    const text = el.querySelector("p")!
    expect(el.firstElementChild).toBe(text)
    const badge = within(text).getByLabelText("Happy")
    expect(badge).toHaveAttribute("role", "img")
    expect(badge.parentElement!.className).toContain("float-right")
  })

  it("does not show the author's name", () => {
    setup({ ideas: [idea(1, 0, 0, 1), { ...idea(2, 400, 0, 2), user_id: 2 }], groups: [group(1), group(2)] })
    expect(card("idea 1")).not.toHaveTextContent("Ada")
    expect(card("idea 2")).not.toHaveTextContent("Grace")
  })
})

describe("labelWidth()", () => {
  it("is the natural width when the group is wide enough on screen", () => {
    expect(labelWidth(400, 1)).toBe(LABEL_WIDTH)
  })

  it("never exceeds the group's on-screen width at normal zoom", () => {
    expect(labelWidth(200, 1)).toBe(200)
    expect(labelWidth(200, 0.8)).toBeCloseTo(200)
  })

  it("caps the counter-scaled label to the group's width when zoomed out", () => {
    // 0.6/0.4 counter-scale: 1 label unit = 0.6 screen px; group 300 wide = 120 px.
    const w = labelWidth(300, 0.4)
    expect(w * 0.6).toBeCloseTo(120)
  })

  it("keeps at least LABEL_MIN_PX, but within 64 world units past the group", () => {
    // Group 200 wide at 50%: 100px on screen; min 80 doesn't apply.
    expect(labelWidth(200, 0.5) * 0.6).toBeCloseTo(100)
    // At 30%: group is 60px; min 80px fits within (200 + 64) * 0.3 = 79.2px -> 79.2.
    expect(labelWidth(200, 0.3) * 0.6).toBeCloseTo(79.2)
    // At 50% a tiny group gets the full minimum.
    expect(labelWidth(100, 0.5) * 0.6).toBeCloseTo(LABEL_MIN_PX)
  })

  it("neighbouring 200-wide stacks 80 apart never get overlapping labels at any zoom", () => {
    for (const scale of [0.1, 0.2, 0.24, 0.3, 0.45, 0.6, 1, 2]) {
      const screenPerUnit = scale * Math.max(1, 0.6 / scale)
      expect(labelWidth(200, scale) * screenPerUnit).toBeLessThanOrEqual(280 * scale + 1e-9)
    }
  })
})

describe("Board group labels", () => {
  const grouped = () => [idea(1, 0, 0, 7), idea(2, 50, 40, 7), idea(3, 900, 0, 8)]

  it("shows one label per multi-idea group and debounces group:update", async () => {
    const { pushes } = setup({ ideas: grouped(), groups: [group(7), group(8)] })
    const inputs = screen.getAllByRole("textbox")
    expect(inputs).toHaveLength(1)
    const input = screen.getByLabelText("Label for group of 2 ideas")
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: "Fo" } })
    act(() => vi.advanceTimersByTime(200))
    fireEvent.change(input, { target: { value: "Foo" } })
    act(() => vi.advanceTimersByTime(LABEL_DEBOUNCE_MS - 1))
    expect(pushes("group:update")).toEqual([])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(pushes("group:update")).toEqual([{ id: 7, label: "Foo" }])
  })

  it("preserves the local value while focused, accepts server values when not", () => {
    const { store } = setup({ ideas: grouped(), groups: [group(7), group(8)] })
    const input = screen.getByLabelText("Label for group of 2 ideas") as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: "Mine" } })
    act(() => {
      store.dispatch(groupUpserted(group(7, "Theirs", "user")))
    })
    expect(input.value).toBe("Mine")

    fireEvent.blur(input)
    act(() => {
      store.dispatch(groupUpserted(group(7, "Later", "user")))
    })
    expect(input.value).toBe("Later")
  })

  it("flushes a pending label on blur", () => {
    const { pushes } = setup({ ideas: grouped(), groups: [group(7), group(8)] })
    const input = screen.getByLabelText("Label for group of 2 ideas")
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: "Quick" } })
    fireEvent.blur(input)
    expect(pushes("group:update")).toEqual([{ id: 7, label: "Quick" }])
  })

  it("caps the label to its group's width, truncating, and expands while focused", () => {
    setup({
      ideas: [idea(1, 0, 0, 7), idea(2, 0, 40, 7)],
      groups: [group(7, "A very long label that will not fit", "user")],
    })
    const input = screen.getByLabelText("Label for group of 2 ideas: A very long label that will not fit")
    const wrapper = input.closest("div")!
    // The group is one card (200) wide at scale 1.
    expect(wrapper.style.width).toBe("200px")
    expect(input).toHaveAttribute("title", "A very long label that will not fit")
    expect(input.className).toContain("truncate")
    fireEvent.focus(input)
    expect(wrapper.style.width).toBe(`${LABEL_WIDTH}px`)
  })

  it("shows the AI badge for AI labels", () => {
    setup({ ideas: grouped(), groups: [group(7, "Tooling", "ai"), group(8)] })
    expect(screen.getByLabelText("Suggested by AI")).toBeInTheDocument()
  })

  it("label follows a group dragged as a whole before the server responds", () => {
    setup({ ideas: grouped(), groups: [group(7), group(8)] })
    const wrapper = () => screen.getByLabelText("Label for group of 2 ideas").closest("div")!
    const before = wrapper().style.transform
    const el = card("idea 1")
    fireEvent.pointerDown(el, { pointerId: 1, button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 0, clientY: -10 })
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 0, clientY: -10 })
    // Idea 1 moved up 10 and still overlaps idea 2 (x overlap 150, y overlap 14 with 64-tall cards)
    expect(wrapper().style.transform).not.toBe(before)
    expect(wrapper().style.transform).toContain("-46px")
  })
})

describe("Board labeling mode", () => {
  it("counts unlabeled groups", () => {
    const store = makeStore({ push: vi.fn().mockResolvedValue({}), on: vi.fn() } as unknown as RetroChannel)
    store.dispatch(
      snapshotReceived({
        retro: { id: "r1", format: "happy_sad_confused", stage: "grouping", facilitator_id: 1, ai_status: null, inserted_at: "" },
        users: [],
        ideas: [idea(1, 0, 0, 7), idea(2, 50, 40, 7), idea(3, 900, 0, 8), idea(4, 950, 40, 8), idea(5, 2000, 0, 9)],
        groups: [group(7), group(8, "Done", "user"), group(9)],
        votes: [],
      }),
    )
    render(
      <Provider store={store}>
        <Board mode="labeling" />
      </Provider>,
    )
    expect(screen.getByRole("status")).toHaveTextContent("1 group unlabeled")
  })
})
