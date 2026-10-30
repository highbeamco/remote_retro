# Deploying to GCP (Cloud Run + Cloud SQL)

Production runs as a single always-on Cloud Run instance (live retros use in-memory
presence/PubSub, so it must stay at one instance) backed by Cloud SQL Postgres 17.
Gemini uses the service's own service account — no key files.

| Resource | Name |
|---|---|
| Project / region | `hb-remote-retro` / `us-central1` |
| Cloud Run service | `remote-retro` (min = max = 1, session affinity, 60 min request timeout) |
| Cloud SQL | `remote-retro-db`, Postgres 17, `db-f1-micro`, daily backups |
| Service account | `remote-retro-run@…` — Cloud SQL Client, Vertex AI User, access to its secrets |
| Secrets (Secret Manager) | `remote-retro-database-url`, `remote-retro-secret-key-base`, `remote-retro-oauth-client-secret` |
| Images | Artifact Registry `us-central1-docker.pkg.dev/hb-remote-retro/remote-retro/app` |

Rough cost: ~$10/mo Cloud SQL + ~$10–15/mo for the always-on instance.

## Deploy

gcloud runs in a container (`deploy/run.sh`), using its own config dir
`~/.config/gcloud-remote-retro`.

1. Sign in once (interactive — run it in a terminal):

       deploy/run.sh gcloud auth login --no-launch-browser

2. Provision + deploy (safe to re-run; it creates what's missing and ships a new image):

       deploy/run.sh ./deploy/deploy.sh

3. First deploy only: add the printed redirect URI
   (`https://remote-retro-<project-number>.us-central1.run.app/auth/google/callback`) to the
   production OAuth client's **Authorized redirect URIs** in the Google Cloud Console
   (*APIs & Services → Credentials*).

Migrations run automatically when the container starts.

## Production OAuth client

Prod uses its own OAuth client, kept in `deploy/env.prod.sh` (gitignored; copy
`deploy/env.prod.sh.example`). `deploy.sh` reads it — never the dev `env.sh`. To switch the
live service to a new client without a rebuild:

    cp deploy/env.prod.sh.example deploy/env.prod.sh   # then fill in the id + secret
    deploy/run.sh ./deploy/set-oauth.sh

This stores the secret as a new Secret Manager version and rolls a revision with the new id.

Override defaults with env vars, e.g. `deploy/run.sh env SQL_TIER=db-g1-small ./deploy/deploy.sh`.

## Email

Without `SENDGRID_API_KEY` the action-item emails are only logged. To send them, store the key
as a secret and add it to the service:

    deploy/run.sh gcloud run services update remote-retro --region us-central1 \
      --update-secrets SENDGRID_API_KEY=<secret-name>:latest \
      --update-env-vars 'MAIL_FROM="Remote Retro" <retro@your-domain>'

## Useful

    deploy/run.sh gcloud run services logs read remote-retro --region us-central1 --limit 100
    deploy/run.sh gcloud sql connect remote-retro-db --user remote_retro   # needs psql in the image

## Continuous deployment (GitHub Actions)

`.github/workflows/deploy.yml` runs on every push to `master`: backend + frontend tests, then
(only if they pass) builds the image on the runner, pushes it to Artifact Registry and rolls a
new Cloud Run revision. Only the image changes; env vars, secrets and scaling set by
`deploy.sh` carry over.

GitHub authenticates with **Workload Identity Federation** — no keys stored in GitHub. The
trust is limited to `highbeamco/remote_retro` on `refs/heads/master`, and the deployer service
account can only deploy revisions, act as the runtime service account, and push to the one
image repository. One-time setup (after the first `deploy.sh`):

    deploy/run.sh ./deploy/setup-github.sh

Re-run `deploy.sh` locally when infrastructure or config changes (scaling, env vars, secrets).

## Staging database (local dev)

`remote_retro_staging` lives on the same Cloud SQL instance, owned by its own
`remote_retro_staging` role, which can't connect to the production database (and other roles
can't connect to staging). Local dev reaches it through the `staging-db` proxy in docker-dev.
One-time setup from the repo root (needs the `deploy/run.sh` gcloud sign-in and the
`~/.config/gcloud-remote-retro` ADC):

    deploy/setup-staging.sh

It stores the role's password in Secret Manager (`remote-retro-staging-db-password`) and
writes `DEV_DATABASE_URL` into the gitignored `env.sh`. Then recreate the dev container and
migrate staging:

    cd docker-dev && docker compose up -d --force-recreate app staging-db
    docker compose exec app mix ecto.migrate
