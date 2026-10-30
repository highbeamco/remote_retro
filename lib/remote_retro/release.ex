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
    start_iam_auth(RemoteRetro.Repo.IAMAuth.children())
  end

  # `eval` doesn't start the app's supervision tree, so start the shared Goth
  # (when Cloud SQL IAM auth is on) that the Repo's `:configure` hook fetches from.
  # Idempotent: `load_app/0` can run twice in one VM (e.g. rollback then migrate),
  # and Goth may already be running (e.g. `rpc` into a started node).
  @doc false
  def start_iam_auth([]), do: :ok

  def start_iam_auth(children) do
    {:ok, _} = Application.ensure_all_started(:goth)

    sup =
      case Supervisor.start_link([], strategy: :one_for_one, name: __MODULE__.IAMAuthSupervisor) do
        {:ok, pid} -> pid
        {:error, {:already_started, pid}} -> pid
      end

    # Added one by one: a child that fails to start inside `Supervisor.start_link/2`
    # takes the supervisor down, and the linked caller with it.
    Enum.each(children, fn child ->
      case Supervisor.start_child(sup, child) do
        {:ok, _} -> :ok
        {:error, {:already_started, _}} -> :ok
        {:error, reason} -> raise "could not start #{inspect(child)}: #{inspect(reason)}"
      end
    end)
  end
end
