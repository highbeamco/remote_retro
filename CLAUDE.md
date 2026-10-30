# CLAUDE.md

Guidance for Claude Code in this repo. Phoenix/Elixir usage rules live in `AGENTS.md` — follow them.

## Commands (no toolchain on the host — run everything via the dev container)

```bash
cd docker-dev
docker compose up -d                                   # mix setup + phx.server on :4000
docker compose run --rm app mix test                   # backend tests
docker compose run --rm app mix test path/to_test.exs:42
docker compose run --rm app mix format
docker compose run --rm app mix compile --warnings-as-errors
docker compose run --rm app bash -c "cd assets && npm test && npm run typecheck"   # Vitest + tsc
```

Dev sign-in without Google: `http://localhost:4000/dev/login?email=you@example.com`.

## Architecture

- `lib/remote_retro/` — domain contexts: `Accounts`, `Retros` (stage machine `change_stage/3`, snapshot), `Ideas`, `Groups` (`sync/1` reconciles overlap clusters into persisted groups), `Votes` (3 per user), `Grouping` (pure AABB clustering), `Layout`, `Stages`, `Timer` (pure stage-countdown state; persisted on the retro, reset on every stage change), `Formats`, `Broadcast`.
- `lib/remote_retro/ai/` — Gemini via Vertex AI (`Gemini` client over Req + Goth ADC, `Prompts`, `Apply`, `TaskRunner`). `AI.Runner`/`AI.Client` are behaviours mocked with Mox in tests. Off unless `GCP_PROJECT` is set, and only facilitators in `AI_ALLOWED_DOMAINS` (unset = nobody; see `RemoteRetro.AI.Access`) may trigger a pass. While running, `retros.ai_status` blocks mutations.
- `lib/remote_retro_web/channels/retro_channel.ex` — one `handle_in` per event; every lookup is scoped to the joined retro. Join replies with a full snapshot; stage changes broadcast `snapshot`.
- `assets/js/retro/` — React room: `types.ts` (wire contract), `channel.ts`, `store/` (RTK slices, selectors, thunks, `bind_channel.ts`), `stages.tsx` registry + `stages/*`, `components/*`, `board/*` (custom pointer-event pan/zoom canvas, sticky drag, floating group labels).
- HEEx pages (landing, retros list, FAQ, privacy) under `lib/remote_retro_web/controllers/*_html/`.

## Invariants

- Card size `200×120` and overlap buffer `8` must match between `RemoteRetro.Grouping` and `assets/js/retro/board/geometry.ts`; `test/remote_retro/grouping_parity_test.exs` mirrors `board/cluster_fixtures.ts`.
- Contexts don't broadcast (except `Retros.change_stage/3` → snapshot and the AI runner); the channel does.
- Every non-action-item positioned idea belongs to exactly one group (singletons are 1-idea groups); votes are on groups.
