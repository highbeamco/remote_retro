import { ALL_EMOJI, emojiName, searchEmoji } from "../../js/retro/emoji"

const emoji = (query: string) => searchEmoji(query).map((entry) => entry.emoji)

describe("emoji list", () => {
  it("is a curated set of unique entries, each with a name and keywords", () => {
    expect(ALL_EMOJI.length).toBeGreaterThanOrEqual(150)
    expect(ALL_EMOJI.length).toBeLessThanOrEqual(250)
    expect(new Set(ALL_EMOJI.map((entry) => entry.emoji)).size).toBe(ALL_EMOJI.length)
    for (const entry of ALL_EMOJI) {
      expect(entry.name).not.toBe("")
      expect(entry.keywords.length).toBeGreaterThan(0)
      expect(entry.keywords.every(Boolean)).toBe(true)
    }
  })

  it("names emoji for screen readers", () => {
    expect(emojiName("🎉")).toBe("party popper")
    expect(emojiName("🦕")).toBe("🦕")
  })
})

describe("searchEmoji", () => {
  it("returns everything, in list order, for an empty query", () => {
    expect(emoji("  ")).toEqual(ALL_EMOJI.map((entry) => entry.emoji))
  })

  it("matches the start of name and keyword words, ignoring case and extra spaces", () => {
    expect(emoji("tada")[0]).toBe("🎉")
    expect(emoji("  Thumbs   UP ")).toEqual(["👍"])
    expect(emoji("partyi")).toEqual(["🥳"])
    expect(emoji("upside")).toEqual(["🙃"])
    expect(emoji("arty")).toEqual([])
  })

  it("puts exact matches first, then prefixes", () => {
    const hearts = emoji("heart")
    expect(hearts[0]).toBe("❤️")
    expect(hearts).toEqual(expect.arrayContaining(["💔", "😍", "🥰"]))
    expect(emoji("party")[0]).toBe("🎉")
    expect(emoji("party")).toContain("🥳")
  })

  it("returns nothing when no word matches", () => {
    expect(searchEmoji("xyzzy")).toEqual([])
  })
})
