// Must match RemoteRetro.Grouping (lib/remote_retro/grouping.ex).
export const CARD_W = 200
/** Minimum (and default) card height. */
export const CARD_H = 64
export const OVERLAP_BUFFER = 8

const CARD_CHROME = 44
const LINE_HEIGHT = 20
const CHARS_PER_LINE = 24

/**
 * Card height grows with its text so nothing is ever cropped: 44px of chrome plus
 * 20px per wrapped line (a conservative 24 code points per line, per paragraph),
 * so a one-line idea is 64px (CARD_H). Must match RemoteRetro.Grouping.card_height/1 exactly.
 */
export function cardHeight(body: string | null | undefined): number {
  if (!body) return CARD_H
  const lines = body
    .split("\n")
    .reduce((sum, line) => sum + Math.max(1, Math.ceil([...line].length / CHARS_PER_LINE)), 0)
  return Math.max(CARD_H, CARD_CHROME + LINE_HEIGHT * lines)
}

// Must match RemoteRetro.Votes.limit/0.
export const VOTE_LIMIT = 3

// Must match RemoteRetro.Ideas.Idea.max_body/0.
export const MAX_IDEA_LENGTH = 500

export const MAX_LABEL_LENGTH = 60

export const CATEGORIES_BY_FORMAT = {
  happy_sad_confused: ["happy", "sad", "confused"],
  start_stop_continue: ["start", "stop", "continue"],
} as const
