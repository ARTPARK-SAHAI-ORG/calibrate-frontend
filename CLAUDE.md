# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Always start new work in a new worktree.** If the current checkout is on the `main` branch, do NOT make changes directly there — create a dedicated git worktree (e.g. `git worktree add -b claude/<short-task-name> .claude/worktrees/<short-task-name>`) and do all the work, commits, and verification inside it. Only work in the main checkout when the user explicitly asks you to. This keeps `main` clean and each task isolated.

## Project

**Calibrate** (npm: `calibrate-frontend`) — a Next.js 16 / React 19 frontend for a voice-agent simulation and evaluation platform. Users create voice AI agents, unit-test STT/TTS providers, and run end-to-end simulated conversations with personas, scenarios, and custom evaluators.

> Branding note: UI says "Calibrate" everywhere, but legacy external infra may still reference "pense". The WhatsApp community URL lives in `src/constants/links.ts` (`WHATSAPP_INVITE_URL`) — import from there, never hardcode.

## Commands

```bash
npm run dev            # start Next dev server on :3000
npm run build          # production build
npm run start          # run production build
npm run lint           # eslint (flat config, eslint.config.mjs)
npm test               # jest (jsdom)
npm test -- path/to/file.test.ts    # single test file
npm test -- -t "test name"          # single test by name
npm run test:coverage  # component (Jest) coverage -> coverage/component/
npm run test:e2e       # playwright public specs, no backend (dev server on :3100)
npm run test:e2e:integration       # authenticated specs — boots a dedicated FAKE_AI backend, waits for health, runs, tears down
npm run test:e2e:integration:coverage  # same, with coverage -> coverage/e2e/
npm run test:e2e:authenticated     # authenticated specs against an ALREADY-running backend (NEXT_PUBLIC_BACKEND_URL); used by CI
npm run test:e2e:ui    # playwright interactive UI mode
npm run test:e2e:coverage          # public E2E coverage -> coverage/e2e/
npm run coverage       # component + public E2E coverage into their separate dirs
```

Before starting dev: `cp env.example .env.local` and fill in `NEXT_PUBLIC_BACKEND_URL`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Husky installs git hooks via `npm install` (`prepare` script).

## Testing

Two layers, both scaffolded with runnable examples:

- **Component / interaction tests** — Jest (jsdom) + React Testing Library + `@testing-library/user-event`, picked up from `src/**/__tests__/` and `*.{test,spec}.{ts,tsx}`. `jest.setup.ts` globally mocks `next-auth/react` (untranspiled ESM, pulled in via `AppLayout`) and `next/navigation` (router hooks) so components render in jsdom. **Import RTL through `src/test-utils/`** (`render`, `screen`, `setupUser`) — its `render` wraps components in the app's global providers (`FloatingButtonProvider`). Examples: `src/components/ui/__tests__/` (Button, SearchInput) and `src/components/__tests__/` (DeleteConfirmationDialog, CreateWorkspaceDialog — the async-form pattern: pass a `jest.fn()` for the `onCreate`/API callback so no network happens).
- **End-to-end tests** — Playwright in `e2e/`, config in `playwright.config.ts` (its `webServer` boots `npm run dev -- -p 3100` on a dedicated port so it never collides with a hand-run :3000 server or another worktree; override via `E2E_PORT`). Jest ignores `e2e/` via `testPathIgnorePatterns`. Split into two projects:
  - **`public`** (`npm run test:e2e`) — any `*.spec.ts` that is **not** `*.auth.spec.ts` (`login`, `signup`, `landing`), public routes / client-side behavior, **no backend**. Runs fully parallel.
  - **`authenticated`** (`npm run test:e2e:integration`) — `*.auth.spec.ts`, backend-backed CRUD flows across the app (agents + agent-detail tabs, tools, evaluators, personas/scenarios, STT/TTS datasets, simulations, workspace settings, cross-page navigation). `e2e/auth.setup.ts` runs first (project dependency): it `POST`s `/auth/signup` on `NEXT_PUBLIC_BACKEND_URL` to mint a real JWT, seeds it as the `access_token` cookie + localStorage, and saves Playwright storage state to `e2e/.auth/user.json` (gitignored) so specs start logged in. Needs a backend — the open-source [`calibrate-backend`](https://github.com/ARTPARK-SAHAI-ORG/calibrate-backend) (Python/`uv`, on-disk SQLite, no external services). Its `CORS_ALLOWED_ORIGINS` must include `http://localhost:3100`. All authenticated specs share the **one** account seeded by `auth.setup.ts` and mutate global workspace state, so `test:e2e:integration` runs `--workers=1` (serial); pages read `process.env.NEXT_PUBLIC_BACKEND_URL` directly, so raw browser fetches are subject to the backend's CORS allow-list. See `e2e/README.md`.
    - **`npm run test:e2e:integration` self-boots the backend** (it wraps `scripts/e2e-fake-backend.sh npm run test:e2e:authenticated`). It enforces the required ordering: boot a **dedicated** backend in `FAKE_AI_PROVIDERS=1` mode on a **random free port** far from `:8000` (pin with `FAKE_BACKEND_PORT`; throwaway `DB_ROOT_DIR` — never touches another `:8000` service), **poll it healthy first**, and only then start the tests (`E2E_FAKE_AI=1`, `NEXT_PUBLIC_BACKEND_URL` pointed at it); an `EXIT` trap always tears the backend down. Point it at your checkout with `CALIBRATE_BACKEND_DIR=...` if not auto-detected. Use the raw `test:e2e:authenticated` only when you already have a backend running and pointed at via `NEXT_PUBLIC_BACKEND_URL` (this is what CI runs, since the CI job boots its own FAKE_AI backend on `:8000`).
    - **Run → results specs** (`e2e/runs.auth.spec.ts`) drive real LLM test-run and benchmark flows to cover the run-gated UI (`TestRunnerDialog`, `test-results/shared`, `Benchmark*`). They need the backend in **test mode** (`FAKE_AI_PROVIDERS=1`), which returns deterministic canned results with no real AI keys/cost — see `e2e/FAKE_AI_PROVIDERS.md` for the backend contract. These tests `test.skip` unless `E2E_FAKE_AI=1` (which `test:e2e:integration` sets via the backend script), so run them through that command.

Rule of thumb: component behavior (dialog opens, form validates, filter updates a list) → RTL; full flows across pages, routing, middleware → Playwright.

**CI** (`.github/workflows/tests.yml`): three jobs — `component` (Jest), `e2e` (public, backend-free), and `e2e-integration` (checks out + boots `calibrate-backend` via `uv` on `:8000`, runs the authenticated specs). Each uploads coverage to Codecov under a flag (`component` / `e2e`; both e2e jobs use `e2e`, which Codecov merges). Needs a `CODECOV_TOKEN` repo secret. `codecov.yml` declares the flags and per-flag status checks.

**Coverage is measured separately per layer** — component coverage never mixes with E2E coverage:
- **Component** (`npm run test:coverage`) — Jest v8 provider → `coverage/component/` (lcov + HTML + json-summary), `collectCoverageFrom` = `src/**` minus `src/app`, `.d.ts`, instrumentation, middleware.
- **E2E** (`npm run test:e2e:coverage` for public, `test:e2e:integration:coverage` for authenticated) — sets `E2E_COVERAGE=1`, enabling `monocart-reporter` + the coverage hook in `e2e/fixtures.ts` (import `test`/`expect` from `./fixtures`, not `@playwright/test`). Collects Chromium V8 coverage, source-maps it to `src/*`, writes `coverage/e2e/` (lcov + HTML). `scripts/clean-e2e-lcov.mjs` post-strips the generated bundle chunks monocart also emits so the lcov is `src/`-only. Chromium-only; a no-op on plain `npm run test:e2e`. (Authenticated coverage is far higher — it exercises `AppLayout`, `Agents`, etc.)
- `npm run coverage` runs both into their separate dirs. Both live under `/coverage` (gitignored).

## Authoritative project docs

**Read `.cursor/rules/app-details.md` before making non-trivial changes.** It's ~4500 lines covering the full feature set, data models, API endpoints, routing, page titles, auth flow, and component conventions. `.cursor/rules/context-first.md` makes this mandatory for Cursor and it applies equally here.

`.cursor/rules/design.md` is the authoritative styling reference — fixed Tailwind class patterns for buttons, forms, tables, dialogs, page headers, responsive breakpoints, and the mobile-first/`md:`-is-primary-breakpoint philosophy. Match existing patterns rather than inventing new ones.

## Architecture

**Next.js App Router** with all pages as client components (`"use client"`). The backend is a separate service at `NEXT_PUBLIC_BACKEND_URL` — this repo is frontend only and talks to it via REST.

**Routing structure** (`src/app/`):
- Public: `/` (landing), `/login`, `/signup`, `/public/...` (shareable result pages)
- Authenticated app pages: `/agents`, `/tools`, `/evaluators`, `/stt`, `/tests`, `/tts`, `/personas`, `/scenarios`, `/simulations`, `/datasets/[id]`, `/workspace-settings`
- API routes: `/api/auth` (NextAuth handler), `/api/debug-env`
- The sidebar in `src/components/AppLayout.tsx` drives navigation: each `NavItem.id` maps to the route `/${id}`. Renaming a nav item's `id` changes the route.

**Auth** (`src/middleware.ts`, `src/auth.ts`): NextAuth v5 with Google provider. The middleware accepts EITHER a NextAuth session OR an `access_token` cookie (backend-issued JWT from email/password login). On Google sign-in, `auth.ts` exchanges the Google id_token with the backend's `/auth/google` to get a backend JWT. Public routes (landing, login, signup, /public/*, /terms, /privacy, /debug, /docs) bypass auth. `GET /about` redirects to `/#about-calibrate` on the landing page (legacy About URL). `MAINTENANCE_MODE=true` redirects all non-API traffic to `/`.

**Access token hook**: Use `useAuth()` / `useAccessToken()` from `src/hooks/useAccessToken.ts` in new code — it unifies NextAuth session and localStorage JWT. Do NOT use `useSession()` directly (it only covers Google OAuth, not email/password).

**Sign-out must clear all four**: `localStorage` (`access_token`, `user`, `activeOrgUuid`), the `access_token` cookie, and `signOut()`.

**API client**: `src/lib/api.ts` wraps fetch with default headers (Bearer token, `X-Org-UUID`) and auto-signs-out on 401. Prefer it over raw fetch when adding new backend calls.

**Provider availability gating**: `GET /providers` returns the STT/TTS/LLM providers whose API keys are configured in the current environment (`{ providers: ["deepgram", "openai", ...] }`). `useEnabledProviders()` (`src/hooks/useEnabledProviders.ts`) fetches it (module-cached, keyed by access token) and returns a lowercased `Set<string> | null`; `null` means unavailable/loading/empty → **fail-open** (show everything). Use `isProviderEnabled(enabled, value)` to gate a catalogue entry by its `value` (exact, case-insensitive). Applied to the STT/TTS provider pickers on the eval pages (`SpeechToTextEvaluation` / `TextToSpeechEvaluation`) and the calibrate agent STT/TTS `<select>`s (`AgentTabContent`) — the agent picker also keeps the currently-saved value visible even if its key is now absent. The LLM picker is NOT gated by this endpoint; it uses its own `/openrouter/providers` allow-list via `useOpenRouterModels`.

**Paginated list endpoints**: the backend list endpoints — `GET /agents`, `/tests`, `/evaluators`, `/annotation-tasks`, `/agent-tests/agent/{uuid}/tests`, `/agent-tests/agent/{uuid}/runs`, `/agent-tests/runs`, and `/jobs` (STT/TTS list) — return a `{ items, total, limit, offset }` envelope (`Paginated<T>` in `api.ts`), not a bare array. Read the array through `unwrapList<T>(data)` from `src/lib/api.ts`; it tolerates the envelope, a legacy `{ runs: [...] }` payload, a legacy `{ jobs: [...] }` payload (pre-migration `/jobs`), and a bare array (so it's safe for the still-unchanged list endpoints like `/tools`, `/personas`, `/scenarios`). The `/jobs` list item is a slim, flat `JobListItem` — `uuid`, `type`, `status`, `dataset_id`/`dataset_name`, top-level `providers`/`language`/`sample_count`, dates — with the heavy `results`/`provider_results`/`details.evaluators`/`audio_paths`/`texts` blobs dropped (they live only on the `[uuid]` detail pages). The `q`/`limit`/`offset`/`type`/`status`/`has_failures` query params are all optional and currently unused — all list filtering/search/sort is still done client-side over the fully-fetched `items`.

**Workspaces / orgs**: The backend is multi-tenant — every request resolves an active workspace from the `X-Org-UUID` header (falling back to the user's personal workspace if absent). Frontend plumbing:
- `src/lib/orgs.ts` — types (`Organization`, `OrganizationMember`), localStorage helpers (`getActiveOrgUuid`, `setActiveOrgUuid`), and the `calibrate:active-org-changed` event.
- `src/lib/api.ts` — `getDefaultHeaders()` reads the active uuid and attaches `X-Org-UUID`.
- `src/lib/fetchInterceptor.ts` — monkey-patches `window.fetch` so legacy raw-fetch call sites also get the header.
- `src/components/OrganizationBootstrapper.tsx` — mounted in the root layout. Installs the interceptor and, on first authenticated load, fetches `/organizations` and stashes a default uuid (preferring the personal workspace).
- `src/hooks/useOrganizations.ts` — `useOrganizations` (list + create + rename), `useActiveOrgUuid` (subscribes to the event), `useOrgMembers` (list + invite + remove), `useWorkspaceApiKeys` (list + create + revoke against the bare `/api-keys` endpoints — keys are scoped by the `X-Org-UUID` header, NOT a path prefix, since `/organizations/...` paths strip that header in `api.ts`).
- `src/components/WorkspaceSwitcher.tsx` — sidebar dropdown rendered above the nav in both expanded and collapsed sidebar modes. Switching workspaces does a full-page navigation (`window.location.assign`) so all resource fetches re-run under the new context. It lands on the **root sidebar page for the section the user is in** (e.g. `/simulations/<id>/runs/<run>` → `/simulations`, `/tools` → `/tools`) rather than always `/agents`, via the `ROOT_SIDEBAR_ROUTES` whitelist (mirrors the AppLayout nav ids); unknown sections (e.g. `/datasets/<id>`) fall back to `/agents`, and `/workspace-settings` just reloads in place.
- `/workspace-settings` — a vertical side-tab layout (`SETTINGS_TABS`: **Admin**, **API keys**) shown for all workspaces, including personal.
  - **Admin tab**: rename the active workspace and manage members. Each member row shows the role (`owner` or `admin`) as a pill; the "Remove" button is hidden entirely for `role === "owner"`. On the current user's own row the button reads "Leave" and the confirm dialog uses leave-flavoured copy; after a successful self-leave, `clearActiveOrgUuid()` runs and the user is routed to `/agents` so the bootstrapper picks a fresh workspace.
  - **API keys tab**: workspace-scoped API keys for CI / GitHub Actions. Created via `CreateApiKeyDialog` (two-phase: name form → one-time secret reveal with copy; the backend returns the plaintext `key` only in the POST response, the list returns a masked `masked_key` / `last_four`), revoked via `DeleteConfirmationDialog`.

**Page skeleton**: every authenticated page is:
```tsx
<AppLayout
  activeItem="<nav-id>"
  onItemChange={(id) => router.push(`/${id}`)}
  sidebarOpen={sidebarOpen}
  onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
>
  {/* content */}
</AppLayout>
```
Use `useSidebarState()` from `src/lib/sidebar.ts` for the open/closed state — it handles SSR hydration and sets open-by-default on desktop.

**Component organization**:
- `src/components/agent-tabs/` — the tabbed UI on `/agents/[uuid]` (Agent / Tools / Data Extraction / Tests / Evaluators / Settings for build agents; Connection / Tests / Evaluators / Settings for connection agents). Which tabs appear is data-driven via `calibrateTabs` / `connectionTabs` arrays and a `tabLabels` map.
  - The **Evaluators tab** (`EvaluatorsTabContent`) lets users curate which evaluators matter for an agent: attach existing library evaluators (`AddEvaluatorsDialog`, a searchable checkbox picker), create new ones inline (`CreateEvaluatorFlow`, which auto-attaches on create), duplicate, detach (kept in library), or permanently delete (owned only). Persistence is a real agent↔evaluator association — see the endpoints note below.
  - The **Tests tab** is wired to that same agent evaluator list: a NEW test seeds its evaluators from the agent's connected evaluators filtered to the tab's type (`llm` for next-reply, `conversation` for conversation), falling back to the `default-llm-next-reply` correctness evaluator. After a create/update that references evaluators not yet on the agent, `TestsTabContent` prompts to add them to the agent's defaults (attach only — removing an evaluator from a test never detaches it from the agent). `AddTestDialog` takes an `agentEvaluatorUuids` prop for the seeding.
- `src/components/simulation-tabs/` — simulation configuration and runs UI.
- `src/components/eval-details/` — shared display components for STT / TTS / simulation-run result pages (metrics grids, provider cards, tables).
- `src/components/human-labelling/` — labelling-task dialogs. `AddRunToLabellingTaskDialog.tsx` powers the "Submit for labelling" action on four result surfaces, each mapping to one task type via `buildItemsFromSource(source)` (the source discriminated union drives the target type via `targetTaskTypeForSource`; you never pick it):
  - **`test_run` / `benchmark_run` → `llm`** (from `TestRunnerDialog` / `BenchmarkResultsDialog`): response-type tests only; maps `test_case.config.history` → `payload.chat_history`, `output.response` → `payload.agent_response`, evaluator `variable_values` → `payload.evaluator_variables`; tool-call results are skipped.
  - **`stt_run` → `stt`** (from `/stt/[uuid]`): each provider row → `payload.{reference_transcript ← gt, predicted_transcript ← pred}` (audio/WER dropped — the STT item pane shows transcripts only).
  - **`tts_run` → `tts`** (from `/tts/[uuid]`): each provider row → `payload.{text, audio_path}` (the inverse of STT — source text + synthesized clip; the row is eligible only if it has a non-empty `audio_path`).
  - **`simulation_run` → `conversation`** (from `/simulations/[uuid]/runs/[runId]`): each non-aborted run's transcript (minus the `end_reason` sentinel) → `payload.transcript`.
  The stt/tts/simulation pages pre-normalise their rows into the source's `rows` / `results` and pass run evaluators as `SourceEvaluatorRef[]`. In all cases: pick or inline-create a task of the target type, existing tasks get missing evaluators auto-attached, new tasks pass them via `evaluator_ids[]` on `POST /annotation-tasks`, items go to `POST /annotation-tasks/{uuid}/items` with `ITEM_NAME_CONFLICT` retry. Widening further is additive — extend the source union, add a `buildItemsFromSource` branch, and map it in `targetTaskTypeForSource` / `itemNounForSource`.
- `src/components/ui/` — primitive UI components.
- `src/components/providers/` — React context providers (e.g. `FloatingButtonProvider`).
- `src/hooks/` — shared hooks, re-exported from `index.ts`. `useCrudResource` is the generic CRUD hook used across resource list pages.
- `src/lib/` — utilities (`api.ts`, `sidebar.ts`, `status.ts`, `datasets.ts`, `evaluatorApi.ts`).
  - `evaluatorApi.ts` — the shared `EvaluatorData` type, evaluator helpers, and the agent↔evaluator association calls. Backed by `GET /agents/{uuid}/evaluators` (paginated `{items,...}` envelope — read via `unwrapList`; items expose `is_default` and `live_version`, NOT `owner_user_id`). Mutations are add-only / remove-only, never a whole-set replace: `addEvaluatorsToAgent(agentUuid, ids[])` (`POST` `{ evaluator_ids: [...] }` — adds one or more in a single validated call, additive-only so no stale-set wipe; returns `{ linked, already_linked }`) and `detachEvaluatorFromAgent` (`DELETE` one). (NB: the agent endpoints differ from the annotation-task ones, which use a whole-set `PUT`.) Use `isOwnedEvaluator(e)` to decide ownership/delete-ability across both list shapes (agent list → `is_default`; `/evaluators` list → `owner_user_id`). Also exports `fetchAllEvaluators` / `deleteEvaluator`. The `/evaluators` page and the agent Evaluators tab both consume the same extracted `CreateEvaluatorFlow` (self-contained use-case-picker → sidebar → judge-model → `POST /evaluators` flow) and `DuplicateEvaluatorDialog` from `src/components/evaluators/`.
- `src/constants/` — inbuilt tools catalogue, limits, shared links, polling intervals.

**Agent types**: there are two — `type: "agent"` (Build, platform-configured STT/TTS/LLM) and `type: "connection"` (Connect, external `agent_url`). Never use `"calibrate"` as the type value. Tabs and settings differ between the two.

**Monitoring**: Sentry is wired through `sentry.edge.config.ts`, `sentry.server.config.ts`, `src/instrumentation.ts`, and `src/instrumentation-client.ts`. `@vercel/analytics` is also enabled. In catch blocks use `reportError(message, error)` from `src/lib/reportError.ts` instead of `console.error` — it captures the failure in Sentry (and still logs to the console in development). Don't add bare `console.error`/`console.log` calls.

## Conventions worth knowing

- Tailwind v4 with semantic tokens (`foreground`, `background`, `muted`, `accent`, `border`). Avoid hardcoded colors outside the validation/status patterns documented in `.cursor/rules/design.md`.
- All interactive elements need `cursor-pointer`; disabled elements `cursor-not-allowed disabled:opacity-50`.
- Mobile-first. Primary breakpoint is `md:` (768px). Tables convert to card layouts on mobile (`hidden md:block` for the table, `md:hidden` for the card version).
- Page titles are set via `document.title` in a `useEffect` in the page component AND via `metadata` export in the route's `layout.tsx` — keep them in sync when renaming.

## Before making any change (mandatory)

Whenever making a change, adding a new feature, or modifying anything, always do the following before writing code:

1. **Review the existing code thoroughly** — search the codebase for existing code, functionality, components, hooks, and utilities that already do (or partly do) what's being asked. Don't build on assumptions about what exists; go look.
2. **Make a parallel execution plan** — split the work into subtasks, mark which are independent, and plan to run the independent ones as multiple weak agents in parallel (each owning a disjoint set of files/sections). See `## Parallel execution` below and the `parallelize` skill.
3. **Identify reuse** — call out which parts of the existing code can be reused directly or repackaged/extracted into reusable functions or components to support what needs to be built, rather than duplicating logic.
4. **Prefer reliable libraries** — if the needed functionality is well-covered by a well-known, reliable library, bias toward using it instead of re-implementing it here, unless the requirements genuinely demand a custom solution.
5. **Share the plan and surface choices** — present the plan and explicitly raise any decisions to be made, along with their tradeoffs, and ask the user instead of making assumptions.

## Parallel execution (default)
For any multi-step or multi-file task, first write a short plan that splits the work
into subtasks and marks which are independent. Run independent subtasks as parallel
agents, each owning a disjoint set of files/sections so they never edit the same file
at once. Keep dependent subtasks sequential. Show the plan before launching. See the
`parallelize` skill for the full playbook.

## Workflow

- **Auto-commit when done**: once all changes for the user's request are complete and verified, create a git commit without waiting for the user to ask. Use a clear, scoped commit message that explains the why. Do not push unless the user asks.
- **Keep CLAUDE.md in sync with reality**: after making changes, check whether any high-level understanding of the app has shifted — new routes, new top-level concepts, renamed nav items, changed auth flow, new architectural patterns, new conventions, retired features, etc. If yes, update CLAUDE.md in the same commit so this file stays an accurate map of the codebase. Skip updates for low-level details (individual component tweaks, copy changes, bug fixes that don't change architecture).
