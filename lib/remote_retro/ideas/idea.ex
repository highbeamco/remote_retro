defmodule RemoteRetro.Ideas.Idea do
  use Ecto.Schema
  import Ecto.Changeset
  alias RemoteRetro.Formats

  @max_body 500

  @derive {Jason.Encoder,
           only: [
             :id,
             :retro_id,
             :user_id,
             :category,
             :body,
             :x,
             :y,
             :group_id,
             :assignee_id,
             :inserted_at
           ]}
  schema "ideas" do
    field :category, :string
    field :body, :string
    field :x, :float
    field :y, :float
    belongs_to :retro, RemoteRetro.Retros.Retro, type: :binary_id
    belongs_to :user, RemoteRetro.Accounts.User
    belongs_to :assignee, RemoteRetro.Accounts.User
    belongs_to :group, RemoteRetro.Groups.Group
    timestamps(type: :utc_datetime_usec)
  end

  def max_body, do: @max_body

  def create_changeset(idea, attrs) do
    idea
    |> cast(attrs, [:category, :body, :assignee_id])
    |> validate_required([:category, :body, :retro_id, :user_id])
    |> validate_content()
  end

  def update_changeset(idea, attrs) do
    idea
    |> cast(attrs, [:category, :body, :assignee_id])
    |> validate_content()
  end

  def position_changeset(idea, attrs), do: cast(idea, attrs, [:x, :y, :group_id])

  defp validate_content(changeset) do
    changeset
    |> update_change(:body, &String.trim/1)
    |> validate_required([:body, :category])
    |> validate_length(:body, max: @max_body)
    |> validate_inclusion(:category, Formats.all_categories())
    |> validate_assignee()
  end

  defp validate_assignee(changeset) do
    if get_field(changeset, :category) == Formats.action_item(),
      do: validate_required(changeset, [:assignee_id]),
      else: put_change(changeset, :assignee_id, nil)
  end
end
