defmodule RemoteRetro.Broadcast do
  @moduledoc "Broadcasts to everyone in a retro's channel from outside the channel process."

  def broadcast(retro_id, event, payload),
    do: RemoteRetroWeb.Endpoint.broadcast("retro:#{retro_id}", event, payload)

  @doc """
  Sends every client the full room state.

  Omits `ai_enabled`: that flag is per viewer and is set on the join reply.
  """
  def snapshot(retro_id),
    do: broadcast(retro_id, "snapshot", RemoteRetro.Retros.snapshot(retro_id))
end
