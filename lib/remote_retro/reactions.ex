defmodule RemoteRetro.Reactions do
  @moduledoc """
  Emoji people can react with. Reactions are only broadcast, never stored.

  Must list the picker's emoji (`assets/js/retro/emoji.ts`) in the same order;
  `RemoteRetro.ReactionsTest` compares the two.
  """

  @emoji ~w(
    😀 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 🤪 🤗 🤫 🤔 🤨 😐 😏 😒 🙄 😬
    😌 😔 😴 🥱 🤯 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😳 🥺 😢 😭 😱 😤 😠 😡 💀 💩 🤡 👻 🤖
    👍 👎 👌 ✌️ 🤞 🤘 👉 👇 ☝️ ✋ 👋 👏 🙌 🤝 🙏 ✍️ 💪 👀 🧠 🤷 🤦 🙋 🙅 🙇 🏃 💃 🕺 🧘
    ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 💕 💖 💗 💘 💝
    🎉 🎊 🎈 🎂 🎁 🏆 🥇 🏅 👑 ✨ 🌟 ⭐ 🔥 🎯 🚀 🍾 🥂
    🐶 🐱 🦊 🐻 🐼 🦁 🐸 🙈 🙉 🙊 🐧 🦄 🐝 🐛 🦋 🐢 🦖 🦥 🌱 🍀 🌸 🌻 💐 ☀️ 🌈 ❄️ 🌊 ⚡
    ☕ 🍺 🍻 🍕 🍔 🍟 🍿 🍩 🍪 🧁 🍫 🍦 🍎 🍓 🥑 🌶️ 🧀 🍜
    ⚽ 🎮 🎲 🧩 ♟️ 🎸 🎵 🎧 🎬 🎨 🏖️ ✈️ 🚗 🏁 🚩
    💡 📝 📌 📈 📉 📊 📋 💻 ⌨️ 📞 📣 🔔 🔍 🛠️ ⚙️ 🧪 🚧 🚨 📦 🗑️ 💰 💸 🧹 🎓 📚 ✏️ 🔗 🩹
    ⏰ ⏳ ⏱️ 📅
    💯 ✅ ❌ ❓ ❗ ⚠️ 🚫 🛑 ♻️ 🔁 🔄 ➕ ➖ ➡️ ⬆️ ⬇️ 🆕 🔴 🟡 🟢 💬 💭 💤 💥 💨
  )

  @allowed MapSet.new(@emoji)

  def all, do: @emoji

  def valid?(emoji), do: MapSet.member?(@allowed, emoji)
end
