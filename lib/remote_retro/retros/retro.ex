defmodule RemoteRetro.Retros.Retro do
  use Ecto.Schema
  import Ecto.Changeset
  alias RemoteRetro.{Formats, Stages}

  @ai_statuses ~w(grouping)

  @primary_key {:id, :binary_id, autogenerate: true}
  @derive {Jason.Encoder, only: [:id, :format, :stage, :facilitator_id, :ai_status, :inserted_at]}
  schema "retros" do
    field :format, :string
    field :stage, :string, default: "lobby"
    field :ai_status, :string
    field :ai_grouped_at, :utc_datetime_usec
    field :action_items_emailed_digest, :string
    field :timer_duration_ms, :integer, default: 180_000
    field :timer_ends_at, :utc_datetime_usec
    field :timer_remaining_ms, :integer
    belongs_to :facilitator, RemoteRetro.Accounts.User
    has_many :participations, RemoteRetro.Retros.Participation
    has_many :ideas, RemoteRetro.Ideas.Idea
    has_many :groups, RemoteRetro.Groups.Group
    timestamps(type: :utc_datetime_usec)
  end

  def create_changeset(retro, attrs) do
    retro
    |> cast(attrs, [:format, :facilitator_id])
    |> validate_required([:format, :facilitator_id])
    |> validate_inclusion(:format, Formats.all())
  end

  def changeset(retro, attrs) do
    retro
    |> cast(attrs, [
      :stage,
      :facilitator_id,
      :ai_status,
      :ai_grouped_at,
      :timer_duration_ms,
      :timer_ends_at,
      :timer_remaining_ms
    ])
    |> validate_required([:stage])
    |> validate_change(:stage, fn :stage, s ->
      if Stages.valid?(s), do: [], else: [stage: "is invalid"]
    end)
    |> validate_inclusion(:ai_status, @ai_statuses)
    |> validate_number(:timer_duration_ms, greater_than: 0)
    |> validate_number(:timer_remaining_ms, greater_than_or_equal_to: 0)
  end
end
