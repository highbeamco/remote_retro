import { combineReducers, configureStore } from "@reduxjs/toolkit"
import type { RetroChannel } from "../channel"
import {
  groupsSlice,
  ideasSlice,
  presenceSlice,
  reactionsSlice,
  retroSlice,
  timerSlice,
  uiSlice,
  usersSlice,
  votesSlice,
} from "./slices"

export const rootReducer = combineReducers({
  retro: retroSlice.reducer,
  ideas: ideasSlice.reducer,
  groups: groupsSlice.reducer,
  votes: votesSlice.reducer,
  users: usersSlice.reducer,
  presence: presenceSlice.reducer,
  reactions: reactionsSlice.reducer,
  timer: timerSlice.reducer,
  ui: uiSlice.reducer,
})

export type RootState = ReturnType<typeof rootReducer>

/** `channel` is optional so tests can build a store without a socket. */
export function makeStore(channel?: RetroChannel, preloadedState?: Partial<RootState>) {
  return configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefault) => getDefault({ thunk: { extraArgument: { channel } as ThunkExtra } }),
  })
}

export type AppStore = ReturnType<typeof makeStore>
export type AppDispatch = AppStore["dispatch"]
export interface ThunkExtra {
  channel: RetroChannel
}
