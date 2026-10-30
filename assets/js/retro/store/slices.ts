import { createEntityAdapter, createSlice, type PayloadAction } from "@reduxjs/toolkit"
import type { Group, Idea, IdeaPosition, PresenceState, Retro, Snapshot, TimerState, User, Vote } from "../types"

// `receivedAt` (performance.now()) lets the timer count down from the moment the server's
// `remaining_ms` arrived, on this client's own clock.
export const snapshotReceived = (snapshot: Snapshot) =>
  ({ type: "snapshot/received", payload: snapshot, meta: { receivedAt: performance.now() } }) as const
const isSnapshot = (action: { type: string }): action is ReturnType<typeof snapshotReceived> =>
  action.type === "snapshot/received"

// Optimistic ideas carry temporary negative ids (-1, -2, …). Sort them after every saved
// idea, in creation order, so a new idea appears where it will end up (at the bottom)
// instead of jumping from the top once the server assigns its real id.
const ideaSortKey = (id: number) => (id < 0 ? Number.MAX_SAFE_INTEGER / 2 - id : id)
export const ideasAdapter = createEntityAdapter<Idea>({ sortComparer: (a, b) => ideaSortKey(a.id) - ideaSortKey(b.id) })
export const groupsAdapter = createEntityAdapter<Group>({ sortComparer: (a, b) => a.id - b.id })
export const votesAdapter = createEntityAdapter<Vote>()
export const usersAdapter = createEntityAdapter<User>()

export const retroSlice = createSlice({
  name: "retro",
  initialState: null as Retro | null,
  reducers: {
    retroUpdated: (_state, action: PayloadAction<Retro>) => action.payload,
  },
  extraReducers: (builder) => builder.addMatcher(isSnapshot, (_state, action) => action.payload.retro),
})

export const ideasSlice = createSlice({
  name: "ideas",
  initialState: ideasAdapter.getInitialState(),
  reducers: {
    ideaUpserted: ideasAdapter.upsertOne,
    ideaRemoved: ideasAdapter.removeOne,
    ideaPositionsSynced: (state, action: PayloadAction<IdeaPosition[]>) => {
      ideasAdapter.updateMany(
        state,
        action.payload.map(({ id, ...changes }) => ({ id, changes })),
      )
    },
    ideaMovedLocally: (state, action: PayloadAction<{ id: number; x: number; y: number }>) => {
      const { id, x, y } = action.payload
      ideasAdapter.updateOne(state, { id, changes: { x, y } })
    },
  },
  extraReducers: (builder) =>
    builder.addMatcher(isSnapshot, (state, action) => ideasAdapter.setAll(state, action.payload.ideas)),
})

export const groupsSlice = createSlice({
  name: "groups",
  initialState: groupsAdapter.getInitialState(),
  reducers: {
    groupUpserted: groupsAdapter.upsertOne,
    groupsReplaced: groupsAdapter.setAll,
  },
  extraReducers: (builder) =>
    builder.addMatcher(isSnapshot, (state, action) => groupsAdapter.setAll(state, action.payload.groups)),
})

export const votesSlice = createSlice({
  name: "votes",
  initialState: votesAdapter.getInitialState(),
  reducers: {
    voteAdded: votesAdapter.upsertOne,
    voteRemoved: votesAdapter.removeOne,
  },
  extraReducers: (builder) =>
    builder.addMatcher(isSnapshot, (state, action) => votesAdapter.setAll(state, action.payload.votes)),
})

export const usersSlice = createSlice({
  name: "users",
  initialState: usersAdapter.getInitialState(),
  reducers: {
    userUpserted: usersAdapter.upsertOne,
  },
  extraReducers: (builder) =>
    builder.addMatcher(isSnapshot, (state, action) => usersAdapter.setAll(state, action.payload.users)),
})

export const presenceSlice = createSlice({
  name: "presence",
  initialState: { onlineUserIds: [] as number[], typingUserIds: [] as number[] },
  reducers: {
    presenceSynced: (state, action: PayloadAction<PresenceState>) => {
      state.onlineUserIds = Object.values(action.payload).map((p) => p.metas[0].user_id)
    },
    userTyping: (state, action: PayloadAction<{ userId: number; typing: boolean }>) => {
      const { userId, typing } = action.payload
      state.typingUserIds = state.typingUserIds.filter((id) => id !== userId)
      if (typing) state.typingUserIds.push(userId)
    },
  },
})

export interface TimerSliceState extends TimerState {
  /** performance.now() when this state arrived; a running timer counts down from here. */
  receivedAt: number
  /**
   * This client's timer commands awaiting a reply. While any are out, server timer states are
   * stale (they predate the latest click), so only the reply to the last one is applied.
   */
  inFlight: number
}

const received = (timer: TimerState, receivedAt = performance.now()): TimerSliceState => ({
  ...timer,
  receivedAt,
  inFlight: 0,
})

export const timerSlice = createSlice({
  name: "timer",
  initialState: null as TimerSliceState | null,
  reducers: {
    /** A server broadcast. Ignored while our own commands are in flight. */
    timerUpdated: {
      reducer: (state, action: PayloadAction<TimerSliceState>) =>
        state && state.inFlight > 0 ? state : action.payload,
      prepare: (timer: TimerState) => ({ payload: received(timer) }),
    },
    /** An optimistic state for a command just sent. */
    timerCommandSent: {
      reducer: (state, action: PayloadAction<TimerSliceState>) => ({
        ...action.payload,
        inFlight: (state?.inFlight ?? 0) + 1,
      }),
      prepare: (timer: TimerState) => ({ payload: received(timer) }),
    },
    /**
     * A command finished. `timer` is the server's state (from the reply, or sent back with an
     * error) or, if the server never answered, the state from before the command. It's applied
     * only when this was the last command in flight.
     */
    timerCommandSettled: (state, action: PayloadAction<TimerSliceState | null>) => {
      if (!state) return state
      const inFlight = Math.max(0, state.inFlight - 1)
      if (inFlight > 0 || !action.payload) return { ...state, inFlight }
      return { ...action.payload, inFlight: 0 }
    },
  },
  extraReducers: (builder) =>
    builder.addMatcher(isSnapshot, (_state, action) =>
      action.payload.timer ? received(action.payload.timer, action.meta.receivedAt) : null,
    ),
})

export interface Toast {
  id: number
  kind: "error" | "info"
  message: string
}

export const uiSlice = createSlice({
  name: "ui",
  initialState: { currentUserId: 0, toasts: [] as Toast[], connected: false, devTools: false, aiEnabled: false },
  reducers: {
    devToolsEnabled: (state) => {
      state.devTools = true
    },
    currentUserSet: (state, action: PayloadAction<number>) => {
      state.currentUserId = action.payload
    },
    connectedChanged: (state, action: PayloadAction<boolean>) => {
      state.connected = action.payload
    },
    toastShown: {
      reducer: (state, action: PayloadAction<Toast>) => {
        state.toasts.push(action.payload)
      },
      prepare: (kind: Toast["kind"], message: string) => ({ payload: { id: Date.now() + Math.random(), kind, message } }),
    },
    toastDismissed: (state, action: PayloadAction<number>) => {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload)
    },
  },
  extraReducers: (builder) =>
    builder.addMatcher(isSnapshot, (state, action) => {
      // Room-wide snapshots omit this. Only the join reply (per viewer) sets it,
      // so a broadcast can't turn AI controls on for someone who isn't allowed.
      if ("ai_enabled" in action.payload) {
        state.aiEnabled = action.payload.ai_enabled === true
      }
    }),
})

export const { retroUpdated } = retroSlice.actions
export const { ideaUpserted, ideaRemoved, ideaPositionsSynced, ideaMovedLocally } = ideasSlice.actions
export const { groupUpserted, groupsReplaced } = groupsSlice.actions
export const { voteAdded, voteRemoved } = votesSlice.actions
export const { userUpserted } = usersSlice.actions
export const { presenceSynced, userTyping } = presenceSlice.actions
export const { timerUpdated, timerCommandSent, timerCommandSettled } = timerSlice.actions
export const { currentUserSet, devToolsEnabled, connectedChanged, toastShown, toastDismissed } = uiSlice.actions
