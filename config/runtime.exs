import Config

# config/runtime.exs is executed for all environments, including
# during releases. It is executed after compilation and before the
# system starts, so it is typically used to load production configuration
# and secrets from environment variables or elsewhere. Do not define
# any compile-time configuration in here, as it won't be applied.
# The block below contains prod specific runtime configuration.

# ## Using releases
#
# If you use `mix release`, you need to explicitly enable the server
# by passing the PHX_SERVER=true when you start it:
#
#     PHX_SERVER=true bin/remote_retro start
#
# Alternatively, you can use `mix phx.gen.release` to generate a `bin/server`
# script that automatically sets the env var above.
if System.get_env("PHX_SERVER") do
  config :remote_retro, RemoteRetroWeb.Endpoint, server: true
end

config :remote_retro, RemoteRetroWeb.Endpoint,
  http: [port: String.to_integer(System.get_env("PORT", "4000"))]

config :remote_retro, :google_oauth,
  client_id: System.get_env("REMOTE_RETRO_GOOGLE_OAUTH_CLIENT_ID"),
  client_secret: System.get_env("REMOTE_RETRO_GOOGLE_OAUTH_CLIENT_SECRET"),
  redirect_uri:
    System.get_env(
      "REMOTE_RETRO_GOOGLE_OAUTH_REDIRECT_URI",
      "http://localhost:4000/auth/google/callback"
    )

# Vertex AI Gemini. AI is off unless GCP_PROJECT is set. Even then a pass runs
# only for accounts in AI_ALLOWED_DOMAINS (comma-separated). Unset or empty
# means nobody (see RemoteRetro.AI.Access).
allowed_domains =
  "AI_ALLOWED_DOMAINS"
  |> System.get_env("")
  |> String.split(",", trim: true)
  |> Enum.map(&(&1 |> String.trim() |> String.trim_leading("@") |> String.downcase()))
  |> Enum.reject(&(&1 == ""))

config :remote_retro, :ai,
  enabled: System.get_env("GCP_PROJECT") not in [nil, ""],
  project: System.get_env("GCP_PROJECT"),
  location: System.get_env("GCP_LOCATION", "global"),
  model: System.get_env("GEMINI_MODEL", "gemini-2.5-flash"),
  allowed_domains: allowed_domains

if mail_from = System.get_env("MAIL_FROM") do
  config :remote_retro, :mail_from, mail_from
end

if config_env() == :dev do
  # Local dev shares the staging database (through the docker-dev `staging-db` proxy)
  # when DEV_DATABASE_URL is set in env.sh; otherwise it uses the local Postgres.
  if dev_db = System.get_env("DEV_DATABASE_URL") do
    config :remote_retro, RemoteRetro.Repo, url: dev_db, pool_size: 5
  end

  # Reload browser tabs when matching files change.
  config :remote_retro, RemoteRetroWeb.Endpoint,
    live_reload: [
      web_console_logger: true,
      patterns: [
        # Static assets, except user uploads
        ~r"priv/static/(?!uploads/).*\.(js|css|png|jpeg|jpg|gif|svg)$"E,
        # Router, Controllers, LiveViews and LiveComponents
        ~r"lib/remote_retro_web/router\.ex$"E,
        ~r"lib/remote_retro_web/(controllers|live|components)/.*\.(ex|heex)$"E
      ]
    ]
end

if config_env() == :prod do
  database_url =
    System.get_env("DATABASE_URL") ||
      raise """
      environment variable DATABASE_URL is missing.
      For example: ecto://USER:PASS@HOST/DATABASE
      """

  maybe_ipv6 = if System.get_env("ECTO_IPV6") in ~w(true 1), do: [:inet6], else: []

  config :remote_retro, RemoteRetro.Repo,
    # ssl: true,
    url: database_url,
    pool_size: String.to_integer(System.get_env("POOL_SIZE") || "10"),
    # For machines with several cores, consider starting multiple pools of `pool_size`
    # pool_count: 4,
    socket_options: maybe_ipv6

  # Cloud SQL on Cloud Run is reached over a Unix socket mounted at
  # /cloudsql/<instance connection name>; the URL's host is then ignored.
  if socket_dir = System.get_env("DB_SOCKET_DIR") do
    config :remote_retro, RemoteRetro.Repo, socket_dir: socket_dir
  end

  # The secret key base is used to sign/encrypt cookies and other secrets.
  # A default value is used in config/dev.exs and config/test.exs but you
  # want to use a different value for prod and you most likely don't want
  # to check this value into version control, so we use an environment
  # variable instead.
  secret_key_base =
    System.get_env("SECRET_KEY_BASE") ||
      raise """
      environment variable SECRET_KEY_BASE is missing.
      You can generate one by calling: mix phx.gen.secret
      """

  host = System.get_env("PHX_HOST") || "example.com"

  config :remote_retro, :dns_cluster_query, System.get_env("DNS_CLUSTER_QUERY")

  # Action-item emails go through SendGrid when a key is set. Without one they
  # are only logged (at debug level), and a warning is logged at boot, so a
  # missing key never stops the app.
  case System.get_env("SENDGRID_API_KEY") do
    key when key in [nil, ""] ->
      config :remote_retro, RemoteRetro.Mailer, adapter: Swoosh.Adapters.Logger, level: :debug

    key ->
      config :remote_retro, RemoteRetro.Mailer, adapter: Swoosh.Adapters.Sendgrid, api_key: key
  end

  config :remote_retro, :warn_default_mail_from, System.get_env("MAIL_FROM") in [nil, ""]

  config :remote_retro, RemoteRetroWeb.Endpoint,
    url: [host: host, port: 443, scheme: "https"],
    http: [
      # Enable IPv6 and bind on all interfaces.
      # Set it to  {0, 0, 0, 0, 0, 0, 0, 1} for local network only access.
      # See the documentation on https://bandit.hexdocs.pm/Bandit.html#t:options/0
      # for details about using IPv6 vs IPv4 and loopback vs public addresses.
      ip: {0, 0, 0, 0, 0, 0, 0, 0}
    ],
    secret_key_base: secret_key_base

  # ## SSL Support
  #
  # To get SSL working, you will need to add the `https` key
  # to your endpoint configuration:
  #
  #     config :remote_retro, RemoteRetroWeb.Endpoint,
  #       https: [
  #         ...,
  #         port: 443,
  #         cipher_suite: :strong,
  #         keyfile: System.get_env("SOME_APP_SSL_KEY_PATH"),
  #         certfile: System.get_env("SOME_APP_SSL_CERT_PATH")
  #       ]
  #
  # The `cipher_suite` is set to `:strong` to support only the
  # latest and more secure SSL ciphers. This means old browsers
  # and clients may not be supported. You can set it to
  # `:compatible` for wider support.
  #
  # `:keyfile` and `:certfile` expect an absolute path to the key
  # and cert in disk or a relative path inside priv, for example
  # "priv/ssl/server.key". For all supported SSL configuration
  # options, see https://plug.hexdocs.pm/Plug.SSL.html#configure/1
  #
  # We also recommend setting `force_ssl` in your config/prod.exs,
  # ensuring no data is ever sent via http, always redirecting to https:
  #
  #     config :remote_retro, RemoteRetroWeb.Endpoint,
  #       force_ssl: [hsts: true]
  #
  # Check `Plug.SSL` for all available options in `force_ssl`.
end
