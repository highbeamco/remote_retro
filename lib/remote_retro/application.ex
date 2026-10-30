defmodule RemoteRetro.Application do
  # See https://elixir.hexdocs.pm/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children =
      [RemoteRetroWeb.Telemetry] ++
        goth_children() ++
        [
          RemoteRetro.Repo,
          {DNSCluster, query: Application.get_env(:remote_retro, :dns_cluster_query) || :ignore},
          {Phoenix.PubSub, name: RemoteRetro.PubSub},
          RemoteRetroWeb.Presence,
          {Task.Supervisor, name: RemoteRetro.AI.TaskSupervisor},
          {Task.Supervisor, name: RemoteRetro.TaskSupervisor},
          # Start to serve requests, typically the last entry
          RemoteRetroWeb.Endpoint
        ]

    # See https://elixir.hexdocs.pm/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: RemoteRetro.Supervisor]
    RemoteRetro.Mailer.warn_if_unconfigured()
    Supervisor.start_link(children, opts)
  end

  # One Goth (`RemoteRetro.Goth`) serves Vertex AI and Cloud SQL IAM auth. It starts
  # before the Repo, which may need a token to connect.
  defp goth_children do
    if RemoteRetro.AI.enabled?() or RemoteRetro.Repo.IAMAuth.enabled?() do
      [RemoteRetro.AI.Credentials.goth_child_spec()]
    else
      []
    end
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    RemoteRetroWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
