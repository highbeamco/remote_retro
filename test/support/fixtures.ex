defmodule RemoteRetro.Fixtures do
  @moduledoc "Test data builders."
  alias RemoteRetro.{Accounts, Repo, Retros}
  alias RemoteRetro.Ideas.Idea
  alias RemoteRetro.Groups.Group
  alias RemoteRetro.Votes.Vote

  def user_fixture(attrs \\ %{}) do
    n = System.unique_integer([:positive])

    {:ok, user} =
      Map.merge(
        %{"email" => "user#{n}@example.com", "name" => "User #{n}", "given_name" => "User"},
        attrs
      )
      |> Accounts.upsert_from_google()

    user
  end

  def highbeam_user_fixture(attrs \\ %{}) do
    n = System.unique_integer([:positive])

    user_fixture(
      Map.merge(
        %{
          "email" => "user#{n}@highbeam.co",
          "name" => "Highbeam #{n}",
          "given_name" => "Highbeam",
          "email_verified" => true,
          "hd" => "highbeam.co"
        },
        attrs
      )
    )
  end

  def retro_fixture(facilitator \\ user_fixture(), attrs \\ %{}) do
    {:ok, retro} = Retros.create_retro(facilitator, attrs[:format] || "happy_sad_confused")

    if stage = attrs[:stage],
      do: retro |> Ecto.Changeset.change(stage: stage) |> Repo.update!(),
      else: retro
  end

  def idea_fixture(retro, user, attrs \\ %{}) do
    Repo.insert!(
      struct(
        %Idea{retro_id: retro.id, user_id: user.id, category: "happy", body: "An idea"},
        attrs
      )
    )
  end

  def group_fixture(retro, attrs \\ %{}),
    do: Repo.insert!(struct(%Group{retro_id: retro.id}, attrs))

  def vote_fixture(group, user), do: Repo.insert!(%Vote{group_id: group.id, user_id: user.id})

  @doc "Sets columns directly, bypassing changesets (e.g. `ai_status`)."
  def update_fixture!(struct, attrs), do: struct |> Ecto.Changeset.change(attrs) |> Repo.update!()
end
