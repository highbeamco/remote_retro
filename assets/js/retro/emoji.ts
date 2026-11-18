// Curated reaction emoji. The server only accepts these: RemoteRetro.Reactions must list the
// same emoji in the same order (test/remote_retro/reactions_test.exs reads the `e("…"` lines).

export interface EmojiEntry {
  emoji: string
  name: string
  keywords: string[]
}

export interface EmojiGroup {
  name: string
  emoji: EmojiEntry[]
}

const e = (emoji: string, name: string, keywords: string): EmojiEntry => ({ emoji, name, keywords: keywords.split(" ") })

export const EMOJI_GROUPS: readonly EmojiGroup[] = [
  {
    name: "Smileys",
    emoji: [
      e("😀", "grinning face", "smile happy grin"),
      e("😄", "grinning face with smiling eyes", "smile happy laugh"),
      e("😁", "beaming face", "grin smile teeth"),
      e("😆", "laughing face", "laugh lol haha"),
      e("😅", "grinning face with sweat", "phew relief nervous"),
      e("🤣", "rolling on the floor laughing", "rofl lol haha"),
      e("😂", "face with tears of joy", "lol laugh haha crying"),
      e("🙂", "slightly smiling face", "smile ok fine"),
      e("🙃", "upside-down face", "silly sarcasm irony"),
      e("😉", "winking face", "wink joke"),
      e("😊", "smiling face with smiling eyes", "blush happy pleased"),
      e("😇", "smiling face with halo", "angel innocent"),
      e("🥰", "smiling face with hearts", "love adore"),
      e("😍", "heart eyes", "love crush adore"),
      e("🤩", "star-struck", "wow amazing excited"),
      e("😘", "face blowing a kiss", "kiss love thanks"),
      e("🤪", "zany face", "crazy goofy wild"),
      e("🤗", "hugging face", "hug thanks warm"),
      e("🤫", "shushing face", "quiet secret hush"),
      e("🤔", "thinking face", "hmm think wonder"),
      e("🤨", "face with raised eyebrow", "skeptical suspicious doubt"),
      e("😐", "neutral face", "meh blank indifferent"),
      e("😏", "smirking face", "smug sly"),
      e("😒", "unamused face", "meh annoyed bored"),
      e("🙄", "face with rolling eyes", "eyeroll whatever"),
      e("😬", "grimacing face", "awkward yikes cringe"),
      e("😌", "relieved face", "relief calm content"),
      e("😔", "pensive face", "sad thoughtful down"),
      e("😴", "sleeping face", "sleep tired zzz"),
      e("🥱", "yawning face", "bored tired sleepy"),
      e("🤯", "exploding head", "mind blown shocked"),
      e("🥳", "partying face", "celebrate birthday woohoo"),
      e("😎", "smiling face with sunglasses", "cool chill awesome"),
      e("🤓", "nerd face", "geek smart"),
      e("🧐", "face with monocle", "curious inspect fancy"),
      e("😕", "confused face", "unsure puzzled"),
      e("😟", "worried face", "concerned anxious"),
      e("🙁", "slightly frowning face", "sad unhappy frown"),
      e("😮", "face with open mouth", "wow surprised oh"),
      e("😳", "flushed face", "embarrassed blush"),
      e("🥺", "pleading face", "please puppy eyes"),
      e("😢", "crying face", "sad tear"),
      e("😭", "loudly crying face", "sob sad cry"),
      e("😱", "face screaming in fear", "scream scared shock"),
      e("😤", "face with steam from nose", "frustrated huff triumph"),
      e("😠", "angry face", "mad grumpy"),
      e("😡", "enraged face", "angry mad rage"),
      e("💀", "skull", "dead dying lol"),
      e("💩", "pile of poo", "poop"),
      e("🤡", "clown face", "clown silly"),
      e("👻", "ghost", "boo spooky"),
      e("🤖", "robot", "bot ai automation"),
    ],
  },
  {
    name: "People & gestures",
    emoji: [
      e("👍", "thumbs up", "yes agree approve like +1"),
      e("👎", "thumbs down", "no disagree dislike -1"),
      e("👌", "OK hand", "ok perfect fine"),
      e("✌️", "victory hand", "peace two"),
      e("🤞", "crossed fingers", "luck hope"),
      e("🤘", "sign of the horns", "rock metal"),
      e("👉", "pointing right", "right point this"),
      e("👇", "pointing down", "down point below"),
      e("☝️", "index pointing up", "one first point"),
      e("✋", "raised hand", "stop high five"),
      e("👋", "waving hand", "wave hello hi bye"),
      e("👏", "clapping hands", "clap applause bravo"),
      e("🙌", "raising hands", "hooray yay celebrate praise"),
      e("🤝", "handshake", "deal agreement"),
      e("🙏", "folded hands", "please thanks pray"),
      e("✍️", "writing hand", "write note"),
      e("💪", "flexed biceps", "strong muscle strength"),
      e("👀", "eyes", "look watching see"),
      e("🧠", "brain", "think smart"),
      e("🤷", "person shrugging", "shrug dunno whatever"),
      e("🤦", "person facepalming", "facepalm doh"),
      e("🙋", "person raising hand", "question me"),
      e("🙅", "person gesturing no", "no nope stop"),
      e("🙇", "person bowing", "sorry respect thanks"),
      e("🏃", "person running", "run hurry rush"),
      e("💃", "woman dancing", "dance salsa"),
      e("🕺", "man dancing", "dance disco"),
      e("🧘", "person in lotus position", "calm zen meditate"),
    ],
  },
  {
    name: "Hearts",
    emoji: [
      e("❤️", "red heart", "heart love like"),
      e("🧡", "orange heart", "heart love"),
      e("💛", "yellow heart", "heart love"),
      e("💚", "green heart", "heart love"),
      e("💙", "blue heart", "heart love"),
      e("💜", "purple heart", "heart love"),
      e("🖤", "black heart", "heart love"),
      e("🤍", "white heart", "heart love"),
      e("💔", "broken heart", "heartbreak sad"),
      e("💕", "two hearts", "love"),
      e("💖", "sparkling heart", "love"),
      e("💗", "growing heart", "love"),
      e("💘", "heart with arrow", "cupid crush"),
      e("💝", "heart with ribbon", "gift love"),
    ],
  },
  {
    name: "Celebration",
    emoji: [
      e("🎉", "party popper", "tada party celebrate congrats hooray"),
      e("🎊", "confetti ball", "party celebrate"),
      e("🎈", "balloon", "party birthday"),
      e("🎂", "birthday cake", "birthday cake"),
      e("🎁", "wrapped gift", "present gift"),
      e("🏆", "trophy", "win champion award"),
      e("🥇", "1st place medal", "gold first winner"),
      e("🏅", "sports medal", "medal award"),
      e("👑", "crown", "king queen best"),
      e("✨", "sparkles", "sparkle magic shiny new"),
      e("🌟", "glowing star", "star shine excellent"),
      e("⭐", "star", "favorite great"),
      e("🔥", "fire", "lit hot awesome"),
      e("🎯", "direct hit", "target bullseye goal"),
      e("🚀", "rocket", "launch ship fast deploy"),
      e("🍾", "bottle with popping cork", "champagne celebrate"),
      e("🥂", "clinking glasses", "cheers toast"),
    ],
  },
  {
    name: "Animals & nature",
    emoji: [
      e("🐶", "dog face", "dog puppy"),
      e("🐱", "cat face", "cat kitten"),
      e("🦊", "fox", "clever sly"),
      e("🐻", "bear", "teddy"),
      e("🐼", "panda", "bear cute"),
      e("🦁", "lion", "brave king"),
      e("🐸", "frog", "toad"),
      e("🙈", "see-no-evil monkey", "oops embarrassed"),
      e("🙉", "hear-no-evil monkey", "not listening"),
      e("🙊", "speak-no-evil monkey", "oops secret"),
      e("🐧", "penguin", "bird linux"),
      e("🦄", "unicorn", "magic rare"),
      e("🐝", "honeybee", "bee busy"),
      e("🐛", "bug", "defect issue"),
      e("🦋", "butterfly", "change pretty"),
      e("🐢", "turtle", "slow steady"),
      e("🦖", "T-Rex", "dinosaur legacy old"),
      e("🦥", "sloth", "slow lazy"),
      e("🌱", "seedling", "grow new start"),
      e("🍀", "four leaf clover", "luck lucky"),
      e("🌸", "cherry blossom", "flower spring"),
      e("🌻", "sunflower", "flower sunny"),
      e("💐", "bouquet", "flowers thanks"),
      e("☀️", "sun", "sunny bright weather"),
      e("🌈", "rainbow", "hope pride"),
      e("❄️", "snowflake", "cold winter freeze"),
      e("🌊", "water wave", "wave ocean"),
      e("⚡", "high voltage", "lightning fast zap energy"),
    ],
  },
  {
    name: "Food & drink",
    emoji: [
      e("☕", "hot beverage", "coffee tea break"),
      e("🍺", "beer mug", "beer drink"),
      e("🍻", "clinking beer mugs", "cheers beers"),
      e("🍕", "pizza", "lunch slice"),
      e("🍔", "hamburger", "burger lunch"),
      e("🍟", "french fries", "fries chips"),
      e("🍿", "popcorn", "drama watching"),
      e("🍩", "doughnut", "donut treat"),
      e("🍪", "cookie", "treat biscuit"),
      e("🧁", "cupcake", "treat cake"),
      e("🍫", "chocolate bar", "chocolate treat"),
      e("🍦", "soft ice cream", "ice cream dessert"),
      e("🍎", "red apple", "apple fruit"),
      e("🍓", "strawberry", "fruit berry"),
      e("🥑", "avocado", "guacamole"),
      e("🌶️", "hot pepper", "spicy chili"),
      e("🧀", "cheese wedge", "cheesy"),
      e("🍜", "steaming bowl", "ramen noodles"),
    ],
  },
  {
    name: "Activities & travel",
    emoji: [
      e("⚽", "soccer ball", "football goal"),
      e("🎮", "video game", "game play gaming"),
      e("🎲", "game die", "dice random luck"),
      e("🧩", "puzzle piece", "puzzle fit"),
      e("♟️", "chess pawn", "chess strategy"),
      e("🎸", "guitar", "rock music"),
      e("🎵", "musical note", "music song"),
      e("🎧", "headphone", "music listen"),
      e("🎬", "clapper board", "action movie film"),
      e("🎨", "artist palette", "art design creative"),
      e("🏖️", "beach with umbrella", "vacation holiday"),
      e("✈️", "airplane", "travel flight trip"),
      e("🚗", "automobile", "car drive"),
      e("🏁", "chequered flag", "finish done race"),
      e("🚩", "triangular flag", "red flag warning"),
    ],
  },
  {
    name: "Work & objects",
    emoji: [
      e("💡", "light bulb", "idea insight"),
      e("📝", "memo", "note write notes"),
      e("📌", "pushpin", "pin important"),
      e("📈", "chart increasing", "growth up trend"),
      e("📉", "chart decreasing", "down decline"),
      e("📊", "bar chart", "data stats metrics"),
      e("📋", "clipboard", "list plan"),
      e("💻", "laptop", "computer code work"),
      e("⌨️", "keyboard", "typing type"),
      e("📞", "telephone receiver", "call phone"),
      e("📣", "megaphone", "announce shout"),
      e("🔔", "bell", "notification ring"),
      e("🔍", "magnifying glass", "search find look"),
      e("🛠️", "hammer and wrench", "tools fix build"),
      e("⚙️", "gear", "settings config"),
      e("🧪", "test tube", "test experiment"),
      e("🚧", "construction", "wip work in progress"),
      e("🚨", "police car light", "alert alarm incident urgent"),
      e("📦", "package", "ship box deliver release"),
      e("🗑️", "wastebasket", "trash delete"),
      e("💰", "money bag", "money budget"),
      e("💸", "money with wings", "money spend cost"),
      e("🧹", "broom", "clean cleanup sweep"),
      e("🎓", "graduation cap", "learn graduate education"),
      e("📚", "books", "learn read study"),
      e("✏️", "pencil", "edit write"),
      e("🔗", "link", "chain url"),
      e("🩹", "adhesive bandage", "fix heal patch"),
      e("⏰", "alarm clock", "time late"),
      e("⏳", "hourglass not done", "waiting time loading"),
      e("⏱️", "stopwatch", "timer time"),
      e("📅", "calendar", "date schedule"),
    ],
  },
  {
    name: "Symbols",
    emoji: [
      e("💯", "hundred points", "100 perfect"),
      e("✅", "check mark button", "done yes complete"),
      e("❌", "cross mark", "no wrong fail"),
      e("❓", "question mark", "question what"),
      e("❗", "exclamation mark", "important attention"),
      e("⚠️", "warning", "caution careful"),
      e("🚫", "prohibited", "no forbidden"),
      e("🛑", "stop sign", "stop halt"),
      e("♻️", "recycling symbol", "recycle reuse"),
      e("🔁", "repeat button", "again loop"),
      e("🔄", "counterclockwise arrows button", "refresh retry sync"),
      e("➕", "plus", "add more"),
      e("➖", "minus", "remove less"),
      e("➡️", "right arrow", "next forward"),
      e("⬆️", "up arrow", "up increase"),
      e("⬇️", "down arrow", "down decrease"),
      e("🆕", "NEW button", "new"),
      e("🔴", "red circle", "red"),
      e("🟡", "yellow circle", "yellow"),
      e("🟢", "green circle", "green go"),
      e("💬", "speech balloon", "comment chat talk"),
      e("💭", "thought balloon", "think thought"),
      e("💤", "zzz", "sleep tired bored"),
      e("💥", "collision", "boom bang crash"),
      e("💨", "dashing away", "fast quick gone"),
    ],
  },
]

export const ALL_EMOJI: readonly EmojiEntry[] = EMOJI_GROUPS.flatMap((group) => group.emoji)

const BY_EMOJI = new Map(ALL_EMOJI.map((entry) => [entry.emoji, entry]))

/** Readable name for screen readers; the emoji itself if it isn't in the list. */
export function emojiName(emoji: string): string {
  return BY_EMOJI.get(emoji)?.name ?? emoji
}

const INDEX = ALL_EMOJI.map((entry) => {
  const name = entry.name.toLowerCase()
  return { entry, name, words: [...name.split(/[\s-]+/), ...entry.keywords] }
})

/**
 * Entries where every query word starts a word of the name or keywords. Best first: exact
 * name/keyword, then name/keyword prefix, then the rest; list order within each.
 */
export function searchEmoji(query: string): EmojiEntry[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ")
  if (!q) return [...ALL_EMOJI]
  const terms = q.split(" ")
  const rank = ({ entry, name }: (typeof INDEX)[number]) => {
    if (name === q || entry.keywords.includes(q)) return 0
    if (name.startsWith(q) || entry.keywords.some((k) => k.startsWith(q))) return 1
    return 2
  }
  return INDEX.filter(({ words }) => terms.every((term) => words.some((word) => word.startsWith(term))))
    .map((item) => ({ entry: item.entry, rank: rank(item) }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ entry }) => entry)
}
