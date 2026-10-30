defmodule RemoteRetro.Release do
  @moduledoc """
  Used for executing DB release tasks when run in production without Mix
  installed.
  """
  @app :remote_retro

  def migrate do
    load_app()

    for repo <- repos() do
      {:ok, _, _} = Ecto.Migrator.with_repo(repo, &Ecto.Migrator.run(&1, :up, all: true))
    end
  end

  def rollback(repo, version) do
    load_app()
    {:ok, _, _} = Ecto.Migrator.with_repo(repo, &Ecto.Migrator.run(&1, :down, to: version))
  end

  defp repos do
    Application.fetch_env!(@app, :ecto_repos)
  end

  defp load_app do
    # Many platforms require SSL when connecting to the database
    Application.ensure_all_started(:ssl)
    Application.ensure_loaded(@app)
    start_iam_auth()
  end

  # `eval` doesn't start the app's supervision tree, so start the shared Goth
  # (when Cloud SQL IAM auth is on) that the Repo's `:configure` hook fetches from.
  defp start_iam_auth do
    case RemoteRetro.Repo.IAMAuth.children() do
      [] ->
        :ok

      children ->
        {:ok, _} = Application.ensure_all_started(:goth)
        {:ok, _} = Supervisor.start_link(children, strategy: :one_for_one)
    end
  end
end
