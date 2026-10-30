// Wire types for the retro channel. Mirrors the Jason encoders in lib/remote_retro/**.

export const STAGES = [
  "lobby",
  "prime-directive",
  "idea-generation",
  "grouping",
  "voting",
  "action-items",
  "closed",
] as const
export type Stage = (typeof STAGES)[number]

export type Format = "happy_sad_confused" | "start_stop_continue"
export type Category = "happy" | "sad" | "confused" | "start" | "stop" | "continue" | "action-item"
export type AiStatus = "grouping" | null

export interface Retro {
  id: string
  format: Format
  stage: Stage
  facilitator_id: number | null
  ai_status: AiStatus
  /** AI re-groupings used so far (server caps it at MAX_REGROUPS). */
  ai_regroups?: number
  inserted_at: string
}

export interface User {
  id: number
  name: string
  given_name: string
  family_name: string | null
  picture: string | null
}

export interface Idea {
  id: number
  retro_id: string
  user_id: number
  category: Category
  body: string
  x: number | null
  y: number | null
  group_id: number | null
  assignee_id: number | null
  inserted_at: string
}

export interface Group {
  id: number
  retro_id: string
  label: string | null
  label_source: "user" | "ai" | null
}

export interface Vote {
  id: number
  user_id: number
  group_id: number
}

export type TimerStatus = "idle" | "running" | "paused" | "done"

/** The facilitator's stage countdown. `remaining_ms` is as of when the server sent it. */
export interface TimerState {
  status: TimerStatus
  duration_ms: number
  remaining_ms: number
}

export type TimerCommand = { command: "start" | "pause" | "reset" } | { command: "set_minutes"; minutes: number }

export interface Snapshot {
  retro: Retro
  /**
   * Whether this viewer may use AI. Present on the join snapshot only;
   * room-wide broadcasts omit it so it isn't shared across the room.
   */
  ai_enabled?: boolean
  timer?: TimerState
  users: User[]
  ideas: Idea[]
  groups: Group[]
  votes: Vote[]
}

export interface PresenceMeta {
  user_id: number
  online_at: number
  phx_ref: string
}

export type PresenceState = Record<string, { metas: PresenceMeta[] }>

export interface IdeaPosition {
  id: number
  group_id: number | null
  x: number | null
  y: number | null
}

// Client -> server pushes and their payloads.
export interface PushEvents {
  "idea:create": { category: Category; body: string; assignee_id?: number | null }
  "idea:update": { id: number; body?: string; category?: Category; assignee_id?: number | null }
  "idea:delete": { id: number }
  "idea:drag": { id: number; x: number; y: number }
  "idea:move": { id: number; x: number; y: number }
  "group:update": { id: number; label: string }
  "vote:create": { group_id: number }
  "vote:delete": { id: number }
  "retro:stage": { stage: Stage }
  "retro:facilitator": { user_id: number }
  "user:typing": Record<string, never>
  "ai:regroup": Record<string, never>
  "timer:command": TimerCommand
  /** Dev only (see RemoteRetro.DevSeed). */
  "dev:seed_ideas": Record<string, never>
}

// Server -> client broadcasts and their payloads.
export interface BroadcastEvents {
  snapshot: Snapshot
  "retro:updated": { retro: Retro }
  "user:joined": { user: User }
  "idea:upserted": { idea: Idea }
  "idea:deleted": { id: number }
  "idea:dragged": { id: number; x: number; y: number; user_id: number }
  "groups:synced": { groups: Group[]; ideas: IdeaPosition[] }
  "group:updated": { group: Group }
  "vote:created": { vote: Vote }
  "vote:deleted": { id: number }
  "ai:error": { message: string }
  "user:typing": { user_id: number }
  "timer:updated": { timer: TimerState }
}
