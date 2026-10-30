defmodule RemoteRetro.Repo.Migrations.AddGoogleOrgClaimsToUsers do
  use Ecto.Migration

  # Captured from Google on sign-in so AI access can be decided without calling
  # Google again. Existing rows stay unverified until the next sign-in.
  def change do
    alter table(:users) do
      add :email_verified, :boolean, null: false, default: false
      add :hosted_domain, :string
    end
  end
end
