defmodule RemoteRetro.ReactionsTest do
  use ExUnit.Case, async: true
  alias RemoteRetro.Reactions

  @picker Path.expand("../../assets/js/retro/emoji.ts", __DIR__)

  test "the allowlist matches the picker's emoji, in order" do
    picker =
      Regex.scan(~r/^\s*e\("([^"]+)"/mu, File.read!(@picker), capture: :all_but_first)
      |> List.flatten()

    assert picker == Reactions.all()
    assert Enum.uniq(picker) == picker
  end

  test "valid?/1 accepts only a listed emoji" do
    assert Reactions.valid?("🎉")
    assert Reactions.valid?("❤️")
    refute Reactions.valid?("❤")
    refute Reactions.valid?("🎉🎉")
    refute Reactions.valid?("")
    refute Reactions.valid?(nil)
  end
end
