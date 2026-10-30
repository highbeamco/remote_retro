defmodule RemoteRetro.AI do
  @moduledoc """
  Gemini-assisted grouping (with a label when an obvious title exists).

  Disabled unless `GCP_PROJECT` is set. Even then, only users
  `RemoteRetro.AI.Access` accepts may trigger a pass.
  """

  alias RemoteRetro.Accounts.User
  alias RemoteRetro.AI.Access

  def enabled?, do: config()[:enabled] == true

  @doc "Gemini is configured and this user is allowed to spend it."
  def available_to?(%User{} = user), do: enabled?() and Access.member?(user)
  def available_to?(_user), do: false

  @doc "AI settings from `config :remote_retro, :ai` (see `config/runtime.exs`)."
  def config, do: Application.get_env(:remote_retro, :ai, [])

  @doc "Supervision children needed by the AI features; empty when AI is disabled."
  def children do
    if enabled?(), do: [RemoteRetro.AI.Credentials.goth_child_spec()], else: []
  end
end
