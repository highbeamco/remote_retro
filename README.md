# Remote Retro

Real-time retrospectives for distributed teams: collect ideas, group them on a shared
pan/zoom board (with optional Gemini assistance), label, vote, and leave with action items.

Built as a **Highbeam hackday** project: a ground-up rebuild of
[Remote Retro by Stride Consulting](https://github.com/stride-nyc/remote_retro), the
original iteration this fork started from. Thanks to Stride for the idea and the years of
open-source work behind it.

Stack: Elixir 1.20 / Phoenix 1.8 / Postgres 17, React 19 + TypeScript + Redux Toolkit,
Tailwind v4 + daisyUI. Real-time over Phoenix Channels.

## Retro flow

`lobby → prime directive → idea generation → group & label → voting → action items → closed`

- The facilitator moves one stage forward or back; going back from `closed` re-opens the retro.
- **Group & label** has two views: the **board** — an unbounded canvas where you drag stickies
  so they overlap to form a group and label groups inline (pan by dragging empty space; zoom
  with ctrl/⌘-scroll, pinch, or the controls) — and a **list** for naming groups.
- With Gemini enabled, entering Group & label does a conservative first pass: only clearly
  related ideas are grouped, and a group gets a title only when an obvious one exists. Nothing
  is auto-labeled later; unlabeled groups stay unlabeled.
- Closing the retro emails its action items (with owners and a link back) to each participant,
  one message per person. Re-opening sends nothing; closing again only sends if the action items
  changed since the last email.

## Development

Everything runs in containers — no Elixir, Node or Postgres on your machine. You need Docker
([OrbStack](https://orbstack.dev) or Docker Desktop).

```bash
cd docker-dev
docker compose up -d            # runs `mix setup`, then the app at http://localhost:4000
docker compose logs -f app
```

Compose starts Postgres 17 and an app container (Elixir 1.20 / OTP 28, Node 24). `deps/`,
`_build/`, `assets/node_modules/` and the database live in Docker volumes, not in your checkout.

**Database.** Local dev uses the shared **staging** database on Cloud SQL (through the
`staging-db` Cloud SQL Auth Proxy container) once `DEV_DATABASE_URL` is in `env.sh` — run
`deploy/setup-staging.sh` once to create it and write that line. Without it, dev falls back to
the local Postgres container. Tests always use the local container.

**Signing in.** In dev you can skip Google entirely:
`http://localhost:4000/dev/login?email=you@example.com` (optional `&name=…&picture=…`).

**Common commands** (from `docker-dev/`):

```bash
docker compose run --rm app mix test                                         # backend tests
docker compose run --rm app bash -c "cd assets && npm test && npm run typecheck"  # frontend tests
docker compose run --rm app mix format
docker compose exec app bash                                                  # shell in the running app
docker compose exec app mix ecto.migrate
```

**Email.** In dev nothing leaves the machine: closing a retro drops its emails into the
mailbox preview at http://localhost:4000/dev/mailbox.

**Teardown** (containers, volumes and the image):

```bash
docker compose down -v --rmi local
```

### Local configuration: `env.sh`

Put secrets in a gitignored `env.sh` at the repo root as `export KEY=value` lines. Compose
loads it into the app container automatically (no need to `source` it); restart with
`docker compose up -d --force-recreate app` after editing.

```bash
# Google sign-in (optional in dev — /dev/login works without it)
export REMOTE_RETRO_GOOGLE_OAUTH_CLIENT_ID=...
export REMOTE_RETRO_GOOGLE_OAUTH_CLIENT_SECRET=...
export REMOTE_RETRO_GOOGLE_OAUTH_REDIRECT_URI=http://localhost:4000/auth/google/callback

# Gemini grouping (optional)
export GCP_PROJECT=your-project-id
```

**Google sign-in:** create an OAuth client (type *Web application*) in the Google Cloud
Console under *APIs & Services → Credentials*, with authorized redirect URI
`http://localhost:4000/auth/google/callback`.

### Gemini (optional)

Gemini runs on Vertex AI using Application Default Credentials. The dev container reads them
from `~/.config/gcloud-remote-retro` (mounted read-only), kept separate from any other gcloud
identity you use. You don't need gcloud installed — run it in a throwaway container:

```bash
# 1. Sign in (prints a URL; open it, sign in, paste the code back)
docker run --rm -it -v ~/.config/gcloud-remote-retro:/root/.config/gcloud \
  gcr.io/google.com/cloudsdktool/google-cloud-cli:slim \
  gcloud auth application-default login --no-launch-browser

# 2. Bill Vertex usage to your project
docker run --rm -v ~/.config/gcloud-remote-retro:/root/.config/gcloud \
  gcr.io/google.com/cloudsdktool/google-cloud-cli:slim \
  gcloud auth application-default set-quota-project <PROJECT_ID>
```

On the project, enable the **Vertex AI API** and give the account you signed in with the
**Vertex AI User** role (`roles/aiplatform.user`). Then add `export GCP_PROJECT=<PROJECT_ID>`
to `env.sh` and recreate the app container. AI still only runs for accounts in
`AI_ALLOWED_DOMAINS` (unset or empty means nobody): Google must have verified the
email, and either the Workspace hosted domain (`hd`) is in that list or Google
didn't send one and the email's own domain is. Sign in again after this ships so
the claim is stored. While Gemini works, the room shows an overlay
and blocks edits; if it fails or takes longer than 45s, the room unblocks and carries on.

## Configuration reference

| Env var | Purpose |
|---|---|
| `REMOTE_RETRO_GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` | Google sign-in |
| `GCP_PROJECT` | Enables Gemini grouping (unset = off) |
| `AI_ALLOWED_DOMAINS` | Comma-separated Google Workspace domains that may use AI. Unset or empty allows nobody |
| `GCP_LOCATION` | Vertex AI location, default `global` |
| `GEMINI_MODEL` | Default `gemini-2.5-flash` |
| `GOOGLE_APPLICATION_CREDENTIALS` | ADC file (service account, user, or impersonated). Set by the dev container; on Cloud Run omit it to use the attached service account |
| `SENDGRID_API_KEY` | Sends the action-items email on close (prod). Unset = emails are only logged, with a boot warning |
| `MAIL_FROM` | Sender, e.g. `"Remote Retro" <retro@example.com>`; default `"Remote Retro" <no-reply@remoteretro.local>` (warns in prod) |
| `DATABASE_URL`, `SECRET_KEY_BASE`, `PHX_HOST`, `PORT` | Standard Phoenix production settings |

For a tour of the code, see [`CLAUDE.md`](CLAUDE.md).

## License

MIT — see [LICENSE](LICENSE). Original work © Stride Consulting.
