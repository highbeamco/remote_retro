defmodule RemoteRetroWeb.Layouts do
  @moduledoc """
  This module holds layouts and related functionality
  used by your application.
  """
  use RemoteRetroWeb, :html

  # Embed all files in layouts/* within this module.
  # The default root.html.heex file contains the HTML
  # skeleton of your application, namely HTML headers
  # and other static content.
  embed_templates "layouts/*"

  @doc """
  Renders your app layout.

  This function is typically invoked from every template,
  and it often contains your application menu, sidebar,
  or similar.

  ## Examples

      <Layouts.app flash={@flash}>
        <h1>Content</h1>
      </Layouts.app>

  """
  attr :flash, :map, required: true, doc: "the map of flash messages"
  attr :current_user, :map, default: nil
  attr :wide, :boolean, default: false, doc: "use a wider content column"
  slot :inner_block, required: true

  def app(assigns) do
    ~H"""
    <div class="flex min-h-dvh flex-col bg-base-100">
      <header class="sticky top-0 z-30 border-b border-base-300 bg-base-100/90 backdrop-blur">
        <nav class="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <a
            href={if @current_user, do: ~p"/retros", else: ~p"/"}
            class="flex items-center gap-2 font-semibold"
          >
            <span class="grid size-8 place-items-center rounded-lg bg-primary text-primary-content">
              <.icon name="hero-arrow-path-rounded-square" class="size-5" />
            </span>
            Remote Retro
          </a>
          <div class="flex-1" />
          <a :if={@current_user} href={~p"/retros"} class="btn btn-ghost btn-sm hidden sm:inline-flex">
            Your retros
          </a>
          <.theme_toggle />
          <div :if={@current_user} class="dropdown dropdown-end">
            <div
              tabindex="0"
              role="button"
              class="btn btn-ghost btn-sm btn-circle avatar"
              aria-label="Account menu"
            >
              <img
                :if={@current_user.picture}
                src={@current_user.picture}
                referrerpolicy="no-referrer"
                class="size-full rounded-full object-cover"
                alt=""
              />
              <.icon :if={!@current_user.picture} name="hero-user-circle" class="size-7" />
            </div>
            <ul
              tabindex="0"
              class="dropdown-content menu z-40 mt-2 w-52 rounded-box bg-base-100 p-2 shadow-lg ring-1 ring-base-300"
            >
              <li class="menu-title truncate">{@current_user.name}</li>
              <li><a href={~p"/retros"}>Your retros</a></li>
              <li><a href={~p"/logout"}>Sign out</a></li>
            </ul>
          </div>
        </nav>
      </header>

      <main class="flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <div class={["mx-auto", if(@wide, do: "max-w-5xl", else: "max-w-3xl")]}>
          {render_slot(@inner_block)}
        </div>
      </main>

      <footer class="border-t border-base-300 px-4 py-6 text-sm text-base-content/60">
        <div class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <span>Remote Retro · open-source retrospectives</span>
          <span class="flex gap-4">
            <a href={~p"/privacy"} class="link link-hover">Privacy</a>
            <a href={github_url()} class="link link-hover">GitHub</a>
          </span>
        </div>
      </footer>
    </div>

    <.flash_group flash={@flash} />
    """
  end

  @doc """
  Shows the flash group with standard titles and content.

  ## Examples

      <.flash_group flash={@flash} />
  """
  attr :flash, :map, required: true, doc: "the map of flash messages"
  attr :id, :string, default: "flash-group", doc: "the optional id of flash container"

  def flash_group(assigns) do
    ~H"""
    <div id={@id} aria-live="polite">
      <.flash kind={:info} flash={@flash} />
      <.flash kind={:error} flash={@flash} />

      <.flash
        id="client-error"
        kind={:error}
        title="We can't find the internet"
        phx-disconnected={
          show(".phx-client-error #client-error")
          |> JS.remove_attribute("hidden", to: ".phx-client-error #client-error")
        }
        phx-connected={hide("#client-error") |> JS.set_attribute({"hidden", ""})}
        hidden
      >
        Attempting to reconnect
        <.icon name="hero-arrow-path" class="ml-1 size-3 motion-safe:animate-spin" />
      </.flash>

      <.flash
        id="server-error"
        kind={:error}
        title="Something went wrong!"
        phx-disconnected={
          show(".phx-server-error #server-error")
          |> JS.remove_attribute("hidden", to: ".phx-server-error #server-error")
        }
        phx-connected={hide("#server-error") |> JS.set_attribute({"hidden", ""})}
        hidden
      >
        Attempting to reconnect
        <.icon name="hero-arrow-path" class="ml-1 size-3 motion-safe:animate-spin" />
      </.flash>
    </div>
    """
  end

  def github_url, do: "https://github.com/highbeamco/remote_retro"

  @doc """
  Theme picker: one icon reflecting the current choice, with a dropdown of
  system / light / dark. The inline script in root.html.heex applies the theme
  and sets `data-theme` / `data-theme-source` on <html>, which drive the icon.
  """
  def theme_toggle(assigns) do
    ~H"""
    <div class="dropdown dropdown-end">
      <div tabindex="0" role="button" class="btn btn-ghost btn-sm btn-circle" aria-label="Theme">
        <.icon
          name="hero-computer-desktop"
          class="size-5 hidden [[data-theme-source=system]_&]:inline-block"
        />
        <.icon
          name="hero-sun"
          class="size-5 hidden [[data-theme=light][data-theme-source=user]_&]:inline-block"
        />
        <.icon
          name="hero-moon"
          class="size-5 hidden [[data-theme=dark][data-theme-source=user]_&]:inline-block"
        />
      </div>
      <ul
        tabindex="0"
        class="dropdown-content menu z-40 mt-2 w-40 rounded-box bg-base-100 p-2 shadow-lg ring-1 ring-base-300"
      >
        <li :for={{key, icon, label} <- theme_options()}>
          <button
            type="button"
            phx-click={JS.dispatch("phx:set-theme")}
            data-phx-theme={key}
            class={[
              key == "system" && "[[data-theme-source=system]_&]:menu-active",
              key != "system" && "[[data-theme=#{key}][data-theme-source=user]_&]:menu-active"
            ]}
          >
            <.icon name={icon} class="size-4" /> {label}
          </button>
        </li>
      </ul>
    </div>
    """
  end

  defp theme_options do
    [
      {"system", "hero-computer-desktop", "Device"},
      {"light", "hero-sun", "Light"},
      {"dark", "hero-moon", "Dark"}
    ]
  end
end
