defmodule RemoteRetro.Accounts.User do
  use Ecto.Schema
  import Ecto.Changeset

  @derive {Jason.Encoder, only: [:id, :name, :given_name, :family_name, :picture]}
  schema "users" do
    field :email, :string
    field :name, :string
    field :given_name, :string
    field :family_name, :string
    field :picture, :string
    field :locale, :string
    field :last_login_at, :utc_datetime_usec
    # From Google on each sign-in. Not part of the client payload (see @derive above).
    field :email_verified, :boolean, default: false
    field :hosted_domain, :string
    timestamps(type: :utc_datetime_usec)
  end

  def changeset(user, attrs) do
    user
    |> cast(attrs, [:email, :name, :given_name, :family_name, :picture, :locale, :last_login_at])
    |> put_given_name_fallback()
    |> validate_required([:email, :name, :given_name])
    |> unique_constraint(:email)
  end

  # Google omits given_name for some accounts; fall back to the first word of the name.
  defp put_given_name_fallback(changeset) do
    case get_field(changeset, :given_name) do
      blank when blank in [nil, ""] ->
        name = get_field(changeset, :name) || get_field(changeset, :email) || ""
        put_change(changeset, :given_name, name |> String.split([" ", "@"]) |> List.first())

      _ ->
        changeset
    end
  end
end
