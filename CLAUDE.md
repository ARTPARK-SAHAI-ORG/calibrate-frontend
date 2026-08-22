# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Always start new work in a new worktree.** If the current checkout is on the `main` branch, do NOT make changes directly there — create a dedicated git worktree (e.g. `git worktree add -b claude/<short-task-name> .claude/worktrees/<short-task-name>`) and do all the work, commits, and verification inside it. Only work in the main checkout when the user explicitly asks you to. This keeps `main` clean and each task isolated.

> **Hit a block, say so immediately.** Anything outside the work that stops you — a git lock file, a port already in use, a missing `node_modules` in a fresh worktree, a dev server that will not start, a crashed background process — gets reported the moment you hit it, in one line, with what you need. One obvious retry is allowed. After that, stop and ask: do not try workarounds, and never delete, kill, or reset something to get past it without permission.

> **Abstract every fix; never patch just the one instance.** When the user points at a problem, don't fix only the exact line they quoted. Work out the underlying rule and apply it consistently to _every_ place it's relevant across your changes and the surrounding code. Then verify the whole set (grep/audit), don't eyeball one case. A fix that isn't generalized is incomplete and will read as sloppy, naive logic.

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
    - **`npm run test:e2e:integration` self-boots the backend** (it wraps `scripts/e2e-fake-backend.sh npm run test:e2e:authenticated`). It enforces the required ordering: boot a **dedicated** backend in `FAKE_AI_PROVIDERS=1` mode on a **random free port** far from `:8000` (pin with `FAKE_BACKEND_PORT`; throwaway `DB_ROOT_DIR` — never touches another `:8000` service), **poll it healthy first**, and only then start the tests (`E2E_FAKE_AI=1`, `NEXT_PUBLIC_BACKEND_URL` pointed at it); an `EXIT` trap always tears the backend down. Prefer letting the script auto-detect the checkout (it picks `~/Documents/repos/artpark/pense-backend` first). Only set `CALIBRATE_BACKEND_DIR=...` when auto-detection fails, and ONLY after confirming that checkout actually has the fake — `src/testing/fake_calibrate_agent.py` exists and its `src` reads `FAKE_AI_PROVIDERS`. A stale checkout without the fake silently runs real models and every run-gated test fails, which looks like a broken fake but is the wrong backend. Use the raw `test:e2e:authenticated` only when you already have a backend running and pointed at via `NEXT_PUBLIC_BACKEND_URL` (this is what CI runs, since the CI job boots its own FAKE_AI backend on `:8000`).
    - **Run → results specs** (`e2e/runs.auth.spec.ts`) drive real LLM test-run and benchmark flows to cover the run-gated UI (`TestRunnerDialog`, `test-results/shared`, `Benchmark*`). They need the backend in **test mode** (`FAKE_AI_PROVIDERS=1`), which returns deterministic canned results with no real AI keys/cost — see `e2e/FAKE_AI_PROVIDERS.md` for the backend contract (that doc's "pending" note is stale; the fake has landed in the backend). These tests `test.skip` unless `E2E_FAKE_AI=1` (which `test:e2e:integration` sets via the backend script), so run them through that command. If a run-gated test fails with a real model in the log (e.g. `[google/gemini-2.5-flash] ❌`), the backend the tests hit was NOT in `FAKE_AI_PROVIDERS=1` mode — check which checkout/port was actually booted, do not assume the fake is broken.

Rule of thumb: component behavior (dialog opens, form validates, filter updates a list) → RTL; full flows across pages, routing, middleware → Playwright.

**CI** (`.github/workflows/tests.yml`): three jobs — `component` (Jest), `e2e` (public, backend-free), and `e2e-integration` (checks out + boots `calibrate-backend` via `uv` on `:8000`, runs the authenticated specs). Each uploads coverage to Codecov under a flag (`component` / `e2e`; both e2e jobs use `e2e`, which Codecov merges). Needs a `CODECOV_TOKEN` repo secret. `codecov.yml` declares the flags and per-flag status checks.

**`codecov/patch` is a required, blocking check.** It measures coverage of _only the lines this PR changed_ against a high target (~92%). New/changed source therefore MUST ship with tests that exercise it — a PR that adds untested code fails CI even though `npm test` passes locally. Practically: every new hook, component, or util needs its own `__tests__` file, and changed page wiring needs to be reached by an existing or new render test. Extract logic into a hook/component (as with `useJobDeletion` + `src/components/eval-jobs/`) so it can be unit-tested directly rather than only through a page. Run `npm run test:coverage` and read the per-file table before pushing; if a changed file shows uncovered lines in the diff, add tests until the patch is covered.

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

- Public: `/` (landing), `/login`, `/signup`, `/changelog`, `/learn`, `/public/...` (shareable result pages)
  - `/learn` is the page holding every session we have run on evaluating AI and every standalone deck we have written. All of it comes from one `ENTRIES` array of `LearnItem` in `src/app/learn/page.tsx`, in the order it is read on the page; adding or reordering means editing that array, and the list down the left follows it. Each entry shows its title, a summary, its recording if it has one, then its slides if it has them, all playing on the page in `<iframe>`s, with an open-in-a-new-tab link under each. Both pairs are optional: `recordingEmbedUrl`/`recordingUrl` left out makes the entry a deck, `slidesEmbedUrl`/`slidesUrl` left out makes it a recording on its own, and whichever one is left runs the full width instead of sharing the row. A `summary` is a `ReactNode`, so it can carry links and bullets, which is why the page wraps it in a `div` rather than a `p`. Recordings need an embeddable address (YouTube `/embed/…`, Google Drive `/preview`), and a Drive file must be shared with anyone who has the link or the frame shows a sign-in screen. Slides use the published Google Slides address with `/embed` in place of `/pub`. Three links sit above the sessions: documentation, the Luma calendar of upcoming sessions, and the changelog. The landing header's **Learn** link points here (it used to be **Resources**, scrolling to the footer, which is why `LandingFooter` no longer carries an `id="resources"` anchor).
  - `/changelog` is the only page built from a file in the repo rather than the backend: it reads `CHANGELOG.MD` at build time (`parseChangelog` in `src/lib/changelog.ts` → `ChangelogList`), so a deploy is what publishes new entries. `.github/workflows/changelog.yml` writes that file, one line per pull request merged into main.
- Authenticated app pages: `/agents`, `/tools`, `/evaluators`, `/stt`, `/tests`, `/tts`, `/personas`, `/scenarios`, `/simulations`, `/datasets/[id]`, `/workspace-settings`
  - `/tests`, `/tools` and `/evaluators` have no sidebar entry: they are reachable by their address and from the agent detail tabs. Everything else in this list is in the sidebar. The sidebar has two **Evaluators** entries, both on the same `EvaluatorLibraryPanel` the Speech-to-Text and Text-to-Speech pages use rather than the whole `/evaluators` library: `/agent-evaluators` under Agents (the next-reply and output judges that can be added to an agent) and `/simulation-evaluators` under Scenarios (the conversation ones).
- API routes: `/api/auth` (NextAuth handler), `/api/debug-env`
- The sidebar in `src/components/AppLayout.tsx` drives navigation: each `NavItem.id` maps to the route `/${id}`. Renaming a nav item's `id` changes the route.

**Auth** (`src/middleware.ts`, `src/auth.ts`): NextAuth v5 with Google provider. The middleware accepts EITHER a NextAuth session OR an `access_token` cookie (backend-issued JWT from email/password login). On Google sign-in, `auth.ts` exchanges the Google id_token with the backend's `/auth/google` to get a backend JWT. Public routes (landing, login, signup, /changelog, /learn, /public/*, /terms, /privacy, /debug, /docs) bypass auth. `GET /about` redirects to `/#about-calibrate` on the landing page (legacy About URL). `MAINTENANCE_MODE=true` redirects all non-API traffic to `/`.

**Access token hook**: Use `useAuth()` / `useAccessToken()` from `src/hooks/useAccessToken.ts` in new code — it unifies NextAuth session and localStorage JWT. Do NOT use `useSession()` directly (it only covers Google OAuth, not email/password).

**Sign-out must clear all four**: `localStorage` (`access_token`, `user`, `activeOrgUuid`), the `access_token` cookie, and `signOut()`.

**API client**: `src/lib/api.ts` wraps fetch with default headers (Bearer token, `X-Org-UUID`) and auto-signs-out on 401. Prefer it over raw fetch when adding new backend calls.

**Provider availability gating**: `GET /providers` returns the STT/TTS/LLM providers whose API keys are configured in the current environment (`{ providers: ["deepgram", "openai", ...] }`). `useEnabledProviders()` (`src/hooks/useEnabledProviders.ts`) fetches it (module-cached, keyed by access token) and returns a lowercased `Set<string> | null`; `null` means unavailable/loading/empty → **fail-open** (show everything). Use `isProviderEnabled(enabled, value)` to gate a catalogue entry by its `value` (exact, case-insensitive). Applied to the STT/TTS provider pickers on the eval pages (`SpeechToTextEvaluation` / `TextToSpeechEvaluation`) and the calibrate agent STT/TTS `<select>`s (`AgentTabContent`) — the agent picker also keeps the currently-saved value visible even if its key is now absent. The LLM picker is NOT gated by this endpoint; it uses its own `/openrouter/providers` allow-list via `useOpenRouterModels`.

**Paginated list endpoints**: the backend list endpoints — `GET /agents`, `/tests`, `/evaluators`, `/annotation-tasks`, `/agent-tests/agent/{uuid}/tests`, `/agent-tests/agent/{uuid}/runs`, `/agent-tests/runs`, `/jobs` (STT/TTS list), and `/traces` — return a `{ items, total, limit, offset }` envelope (`Paginated<T>` in `api.ts`), not a bare array. Read the array through `unwrapList<T>(data)` from `src/lib/api.ts`; it tolerates the envelope, a legacy `{ runs: [...] }` payload, a legacy `{ jobs: [...] }` payload (pre-migration `/jobs`), and a bare array (so it's safe for the still-unchanged list endpoints like `/tools`, `/personas`, `/scenarios`). The `/jobs` list item is a slim, flat `JobListItem` — `uuid`, `type`, `status`, `dataset_id`/`dataset_name`, top-level `providers`/`language`/`sample_count`, dates — with the heavy `results`/`provider_results`/`details.evaluators`/`audio_paths`/`texts` blobs dropped (they live only on the `[uuid]` detail pages). For every list endpoint EXCEPT `/traces`, the `q`/`limit`/`offset`/`type`/`status`/`has_failures` params are unused — filtering/search/sort is client-side over the fully-fetched `items`. **`/traces` is the one exception and the intended pattern for machine-written data**: `useTraces` (`src/hooks/useTraces.ts`) drives `limit`/`offset` server-side and holds only one page, because a production trace stream can far exceed what the client should download. Do not "harmonize" it back to the fetch-everything pattern. `GET /traces` also takes `q`, a plain case-insensitive "contains this text" match over the message id, conversation id, conversation history, reply, and metadata (blank is ignored, `%`/`_` are literal), so search is server-side too; it refuses a page above `MAX_TRACES_PAGE_SIZE` (200), which `fetchTraces` clamps to. Traces are also **scoped to one agent**: every list read sends `agent_id` (`GET /traces?agent_id=…`), so `useTraces` takes an `agentId` and refetches when it changes.

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

- `src/components/agent-tabs/` — the tabbed UI on `/agents/[uuid]` (Agent / Tools / Evaluators / Tests / Evaluations / Traces / Settings for build agents; Evaluators / Tests / Evaluations / Traces / Connection / Settings for connection agents). A build agent opens on Agent; a connection agent opens on Evaluators, with Connection sitting next to Settings because it is set up once. Which tabs appear is data-driven via `calibrateTabs` / `connectionTabs` arrays and a `tabLabels` map.
  - The **Evaluators tab** (`EvaluatorsTabContent`) lets users curate which evaluators matter for an agent: attach existing library evaluators (`AddEvaluatorsDialog`, a searchable checkbox picker; rows show the name and description only, with full-conversation evaluators left out (they still show where they are the only kind that works: simulation setup and a conversation labelling task); clicking a row's name opens how that evaluator judges — model, prompt, values, scores — in a second column via `EvaluatorPromptPreview`, which reads `GET /evaluators/{uuid}` since the list endpoints carry no prompt text. Ticking is the checkbox only. Shared by every dialog using `EvaluatorPicker`), create new ones inline (`CreateEvaluatorFlow`, which auto-attaches on create), duplicate, detach (kept in library), or permanently delete (owned only). Persistence is a real agent↔evaluator association — see the endpoints note below.
  - The **Tests tab** is wired to that same agent evaluator list: a NEW test seeds its evaluators from the agent's connected evaluators filtered to the tab's type (`llm` for next-reply, `conversation` for conversation), falling back to the `default-llm-next-reply` correctness evaluator. After a create/update that references evaluators not yet on the agent, `TestsTabContent` prompts to add them to the agent's defaults (attach only — removing an evaluator from a test never detaches it from the agent). `AddTestDialog` takes an `agentEvaluatorUuids` prop for the seeding.

**The agent page has a separate Evaluations tab.** `RunsTabContent` (labelled **Evaluations**, tab id still `runs` so `?tab=runs` links keep working; after Tests, both agent kinds) is the only place an agent's past runs are listed: one table with **Run / Result / Tests / Models / Created at**, no test-versus-benchmark split and no type label. (A column naming the evaluators that judged the run is waiting on the list endpoint to carry their names.) It is server-paginated through `useAgentRuns` (`limit`/`offset` on `GET /agent-tests/agent/{uuid}/runs`, page size from the shared `usePageSize`) and the result filter is server-side too (`has_failures` for all-passed / all-failed, `status=failed` for error). Clicking a row opens `TestRunnerDialog` for a plain run or `BenchmarkResultsDialog` for a multi-model one, and `?runId=` deep-links the plain-run window. `TestsTabContent` no longer holds a runs list: it starts runs, opens the run window, and calls `onRunStarted` so `AgentDetail` remounts the Runs tab to pick the new run up.

**Test runs are created by the parent, never by the dialog.** `src/lib/testRunApi.ts` owns the two calls (`startTestRun` to create, `fetchTestRun` to read). Every "run" action on `/tests` and the agent Tests tab calls `startTestRun` FIRST, prepends an optimistic row to the runs list, and only then opens `TestRunnerDialog` with the returned `taskId`. The dialog takes `{ isOpen, onClose, agentUuid, agentName, taskId, onNewRun }` and is fetch/poll/render only: it holds one `run` response as its sole source of run content and derives every row, count, and aggregate from it, so there is no local copy to reconcile or reset. Rerun works the same way — the dialog calls `startTestRun` and reports the new id through `onNewRun`, which is what puts rerun-created runs in the list and (on `/tests`) swaps `?runId=`. Pass `null` for `testUuids` to run every test linked to the agent. Because the dialog needs a real run id, both pages render it ONCE, driven by a run id, rather than keeping separate "new run" and "view past run" instances.

- `src/components/traces/` — the Traces tab on the agent detail page (`/agents/[uuid]?tab=traces`, the tab after Tests). There is no `/traces` route and no sidebar entry: **traces belong to one agent**. The customer's app ingests them with `POST /traces` (API key) carrying the agent's uuid as a top-level `agent_id`; `message_id` and `conversation_id` are optional and nullable, and the ingest response has no `created` field. This UI is read + curate only (no ingest form). `TracesTable` is a desktop table / mobile card list with **Input**, **Output** (reply, else the tool calls as chips), and **Created**, plus selection and delete controls. Pagination uses the shared **server-paginated list bar** via `ServerPaginatedListBar` (see Conventions) directly above the table. `TraceDetailDialog` fetches its own detail via `fetchTrace` and reuses `TestDetailView` so a trace reads like a test run. `TracesEmptyState` is the three-step setup guide (create OR paste-and-check a key via `validateApiKeyForAgent`, send a trace, check it arrived); the request itself lives in `TraceIngestSnippet` so `TraceIngestCodeDialog` can show the same thing from the toolbar's **View code** after the first trace lands, when the setup steps are gone (with `YOUR_API_KEY`, since a key's text exists only at creation). Bulk actions on a selection: **Add to tests** (`ConvertTracesToTestsDialog`) and **Submit for labelling** (`TraceLabellingEvaluatorsDialog` to pick evaluators, then the shared `AddRunToLabellingTaskDialog` with its `traces` source; the tab fetches each selected trace in full first, because the list holds only previews and that dialog wants a ready source). A trace that only made tool calls (no reply) routes to an **`llm-tool-call`** task instead: the whole selection being tool-call-only skips the evaluator step (those tasks have no evaluators) and submits straight through — `targetTaskTypeForSource`/`traceLabellingType` decide, and `buildItemsFromSource` maps the trace's `output.tool_calls` → `actual_tool_calls` with empty `expected_tool_calls` (a trace has no spec; the annotator supplies it on a fail). A mixed selection stays on `llm` (response preferred) and leaves the tool-call-only traces out. Both dialogs pick evaluators through `useAgentLlmEvaluators` + the shared `EvaluatorPicker`: llm evaluators minus any that declare `live_version.variables` (there is nowhere to ask for their values, and neither request carries them), preselected to this agent's own, else the `default-llm-next-reply` fork. Backed by `src/lib/tracesApi.ts` + the `useTraces`/`useTraceDeletion` hooks. Every list read is agent-scoped, server-paginated (page size from `usePageSize`, shared with the labelling items tab under one saved setting; the backend caps a page at `MAX_TRACES_PAGE_SIZE`). It is the ONE server-paginated list in the app; do not "harmonize" it to the fetch-everything pattern. **Search is server-side too**: the toolbar's search box is debounced (300ms) into `useTraces`'s `q`, which resets to the first page; while anything is typed an empty result shows "No traces match your search." rather than the setup steps. Deep-links are `?tab=traces` and `?traceId=`. Deletes go through `POST /traces/bulk-delete`, which takes `{ trace_ids }` ONLY — no `select_all`, no filters, unknown fields rejected — so there is no "delete everything matching" path and no per-trace DELETE.
  - **Add to tests** (internally `ConvertTracesToTestsDialog` + `convertTracesToTests` in `tracesApi.ts` → backend `POST /traces/convert-to-tests`): a bulk action on the selected traces with no type picker. The parent derives `tool_call` only when every selected trace has no `response_preview` and has `tool_call_count > 0`; otherwise it derives `response`, so any selected response forces response mode. Response mode shows the LLM evaluator selection, requires at least one, and preselects the `default-llm-next-reply` fork via `defaultOriginSlug`. Tool-call mode shows the ignore-arguments option, which maps to `accept_any_arguments`. The dialog does NOT ask which agents to link: the backend links each created test to the agent that produced its trace, so `agentUuid` is used only to pick which evaluators are offered. Evaluators are sent as a plain list of ids under `evaluators`. When a conversion fails the backend names the evaluators or traces at fault; `convertTracesErrorMessage` reads that out of the failure and the dialog shows it instead of a general line, and nothing is created, so the reader can fix it and submit again. The backend owns generated test names and their fallback; the frontend sends no name. The dialog is pure (fetches evaluators, calls `convertTracesToTests`, reports via `onConverted`); the tab clears the selection (`useBulkDeletion.clearSelection`) and fires a sonner `toast.success` linking to the created tests. This is the loop close: added tests then run/benchmark and their run results feed the existing `AddRunToLabellingTaskDialog` labelling flow unchanged.
- `src/components/evaluations/RunEvaluatorsPanel.tsx` — the evaluators chosen for one run, laid out like the agent Evaluators tab (cards, Add evaluators, Create evaluator, Remove). Used by the **Evaluators tab inside a new evaluation** on the Speech-to-Text and Text-to-Speech pages and by the simulation setup, each scoped to its own kind (`stt` / `tts` / `conversation`). Nothing is persisted: a run does not exist until it is started, so the choice lives in the page and is sent with the run. `readOnly` shows the cards with no actions, which the simulation setup uses once configured.
- `src/components/evaluations/EvaluatorLibraryPanel.tsx` — the evaluators of the kinds it is given (`evaluatorTypes`), with a search box, View, Delete and Create evaluator, drawn as the same cards. It backs four surfaces: the **Evaluators tab on `/stt` and `/tts`** (`?tab=evaluators`, next to Evaluations and Datasets), **`/agent-evaluators`** (`llm` + `llm-general`, the ones that can be added to an agent) and **`/simulation-evaluators`** (`conversation`). The last two are the sidebar's two **Evaluators** entries, under Agents and under Scenarios. Nothing is attached here: it is the library filtered to those kinds, so evaluators can be looked at, deleted and created without starting a run.
- `src/components/simulation-tabs/` — simulation configuration and runs UI.
- `src/components/eval-details/` — shared display components for STT / TTS / simulation-run result pages (metrics grids, provider cards, tables).
- `src/components/human-labelling/` — labelling-task dialogs. `AddRunToLabellingTaskDialog.tsx` powers the "Submit for labelling" action on four result surfaces, each mapping to one task type via `buildItemsFromSource(source)` (the source discriminated union drives the target type via `targetTaskTypeForSource`; you never pick it):
  - **`test_run` / `benchmark_run` → `llm`** (from `TestRunnerDialog` / `BenchmarkResultsDialog`): response-type tests; maps `test_case.history` → `payload.chat_history`, `output.response` → `payload.agent_response`, evaluator `variable_values` → `payload.evaluator_variables`.
  - **`test_run` / `benchmark_run` → `llm-tool-call`** (same surfaces): tool-call tests **that carry at least one `llm_judge` criteria** (fully deterministic tool calls have nothing for a human to judge — `labellingTaskTypeForRaw` / `collectToolCallCriteriaParams` gate this). `targetTaskTypeForSource` is selection-aware for these two sources: a mixed selection targets `llm` (response preferred) and the tool-call tests are skipped; a tool-call-only selection targets `llm-tool-call`. Items map `test_case.history` → `chat_history`, `evaluation.tool_calls` → `expected_tool_calls`, `output.tool_calls` → `actual_tool_calls`, and carry **no evaluators** (verdict is a single pass/fail per item, per the backend contract). The annotator view (`AnnotationJobView`) renders a pass/fail control (no evaluators → `EvaluatorsPane`'s empty branch) plus, on a **fail**, a light `CorrectedToolCallsEditor` (tool name + arg key/value rows). The verdict rides the `evaluator_id: null` item annotation as `value.value` (boolean), with `value.expected_tool_calls` added only on a fail and `value.comment` alongside. `ToolCallItemPane` shows the conversation + actual call + expected spec.
  - **Tool-call outputs inside an `llm` task get no AI judge.** An `llm` task item whose output is a tool call (empty `agent_response`, trailing assistant `tool_calls` turn — detected by `isToolCallOutputItem` in `src/components/human-labelling/itemOutputType.ts`) can only be labelled by humans. In an evaluator (AI-judge) run: the per-row **Evaluate** button is disabled on those rows (`page.tsx` `ItemRowActions`); starting a run over an explicit selection that is entirely tool-call is blocked, and a mixed selection shows a warning in `RunEvaluatorsDialog` (`toolCallSkipCount`) that those items will be skipped; the run-results page (`EvaluatorRunDetailView` → `EvaluatorResultsPane`) shows "AI judges do not run on tool calls — a person can still label this by hand" in place of the missing-result card. **The backend must skip tool-call-output items when running an evaluator** (including the `select_all` path the frontend can't filter).
  - **`stt_run` → `stt`** (from `/stt/[uuid]`): each provider row → `payload.{reference_transcript ← gt, predicted_transcript ← pred}` (audio/WER dropped — the STT item pane shows transcripts only).
  - **`tts_run` → `tts`** (from `/tts/[uuid]`): each provider row → `payload.{text, audio_path}` (the inverse of STT — source text + synthesized clip; the row is eligible only if it has a non-empty `audio_path`).
  - **`simulation_run` → `conversation`** (from `/simulations/[uuid]/runs/[runId]`): each non-aborted run's transcript (minus the `end_reason` sentinel) → `payload.transcript`.
    The stt/tts/simulation pages pre-normalise their rows into the source's `rows` / `results` and pass run evaluators as `SourceEvaluatorRef[]`. In all cases: pick or inline-create a task of the target type. The existing-task picker only lists tasks that already have every evaluator from the run. New tasks pass those evaluators via `evaluator_ids[]` on `POST /annotation-tasks`. Items go to `POST /annotation-tasks/{uuid}/items` with `ITEM_NAME_CONFLICT` retry. Widening further is additive — extend the source union, add a `buildItemsFromSource` branch, and map it in `targetTaskTypeForSource` / `itemNounForSource`.
  - **Human scores** (`EvaluatorScoreCards` + `jobHumanScores.ts`): a titled row of one card per evaluator answering "what was scored here". `EvaluatorScoreCards` is the single component behind every such row — the labelling task Overview tab (both the evaluators own "Evaluator scores" and "Human scores" section below it) and the two read-only labelling job pages. `singleRow` switches the row from wrapping to scrolling sideways, which the job pages need because they are pinned to the window height and every extra row of cards comes out of the item being read. On the signed-in job page the cards are the whole header: the old Status, Labelling task and Annotator cards are gone, and the job status rides on the "Human scores" heading through `headingAside` rather than taking a row of its own (shown on its own when nothing is scored yet). It is deliberately absent from `/annotate-job/[token]`, the annotator's own working view, where a running tally of their own answers would nudge the answers they have left. All counting goes through `summariseValues` in `src/lib/evaluatorResultStat.ts`, shared with the evaluator run page, so no two screens can count differently.
    - The **job** numbers need no backend work: `GET /public/annotation-jobs/{token}` already returns every annotation for the job plus the evaluators with their scale, so `buildJobHumanScoreCards` adds them up in the browser.
    - The **task overview** numbers come from a `human_result` field on each entry of `evaluators[]` in `GET /annotation-tasks/{uuid}/agreement`, the same `{count, true_count, mean}` shape as the existing `result` but rolled up from human labels. **That field is not in the backend yet.** Until it ships the field is simply absent, every card formats to nothing, and the whole section stays invisible — no error, no empty box. `hasTaskOverviewData` counts it too, so a task labelled by a single annotator with no evaluator run still keeps its Overview tab instead of bouncing the reader to Items.

  - **Bulk upload with existing labels** (`BulkUploadItemsDialog` for llm / llm-general, plus the conversation and STT dialogs, all sharing `bulk-upload-shared.tsx`): answering Yes to "Do you want to upload existing human labels?" adds a `<evaluator>/value` + `<evaluator>/reasoning` column pair per linked evaluator. Values are optional per row and per evaluator — a blank cell means that evaluator was not labelled for that row and nothing is sent for it; `annotationColumnsError` only requires the CSV to carry at least one value column. When the task already has items the download link hands those items back instead of made-up sample rows (`useTaskItems` → `GET /annotation-tasks/{uuid}/items`, rendered by `buildItemsCsv`), so only the label columns are left to fill; with no items yet the sample CSV is unchanged. Annotators are created from inside the picker via `AddAnnotatorInline` in `SingleSelectPicker`'s `renderHeader` slot. The backend attaches labels to items matched by name and leaves the labelling job `in_progress` until every required evaluator has a value.
- `src/components/ui/` — primitive UI components.
- `src/components/providers/` — React context providers (e.g. `FloatingButtonProvider`).
- `src/hooks/` — shared hooks, re-exported from `index.ts`. `useCrudResource` is the generic CRUD hook used across resource list pages. `useDialogUrlParam` deep-links an open dialog/item to a URL query param (write on open, clear on close, re-open on load) so a reload keeps it open and the URL is shareable — used for the open test case (`?testId=<uuid>`) on both `/tests` and the agent Tests tab (`TestsTabContent`); the `/tests` Runs tab has its own `?runId=` deep-link inline. The item filters on the evaluation run page and the labelling job page do the same through `src/components/human-labelling/valueFilterUrl.ts` (`?scores=<evaluatorId>:<value>.<value>,…` and `?disagreements=1`, written with `replaceState`), so a reload or a shared link keeps the same filters on.
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

### A new page must be filed for search, in the same change

Adding a folder under `src/app` that answers an address means putting it in one
of three lists, or the "Sitemap and robots" check fails and names it:

- `PAGES` in [src/app/sitemap.ts](src/app/sitemap.ts) — anyone can read it and we want it found.
- The `disallow` list in [src/app/robots.ts](src/app/robots.ts) — anyone can open it but it must stay out of search. Anything reached by a token in the address, plus API and internal pages.
- `BEHIND_SIGN_IN` in [src/app/sitemap.ts](src/app/sitemap.ts) — it needs signing in, so a search engine cannot reach it anyway.

**File it yourself when the answer is obvious, and say which list you chose and
why in one line when you report the change.** Obvious means: a marketing or
writing page open to everyone goes in `PAGES`; anything under the workspace or
otherwise behind sign-in goes in `BEHIND_SIGN_IN`; a token link, an API route,
or a debug page goes in the `disallow` list.

**Ask when it is not obvious, and do not guess.** A page open to everyone that
we may not want advertised is the usual case: a campaign landing page, a page
that repeats another one, something meant only for people given the link. The
cost of guessing is silent, since a wrongly filed page either never appears in
search or appears when it should not, and nothing breaks either way.

### A page open to everyone writes its own link preview

Build the metadata for any page in `PAGES` with `pageMetadata()` from
[src/lib/site.ts](src/lib/site.ts). Never hand-write the title, description,
canonical link and `openGraph` block on such a page.

Next does not mix a page's own title into a preview box it inherited. A page
that sets a title but no `openGraph` block of its own hands out the home page's
title, description and address to anyone who pastes its link. Nothing breaks:
the page loads, the tab is right, the build passes. The only symptom is the
wrong words in a chat window, which is invisible from inside the code. Learn and
the changelog did this for months.

The test in [src/app/**tests**/seo.test.ts](src/app/__tests__/seo.test.ts) holds
the list of pages against `PAGES` in the sitemap and fails when a page's preview
address is not its own, or when two pages hand out the same words.

### The picture a shared link shows

The box WhatsApp, LinkedIn and X draw around a pasted link uses one picture,
and every page names it through `shareImage()` in
[src/lib/site.ts](src/lib/site.ts) rather than writing a path. The helper
returns the address, the size and a line of words describing the picture.

Never write a bare path into an `openGraph.images` list. The size has to be
declared: WhatsApp and LinkedIn lay the box out before the picture has
downloaded, and with no size they fall back to a small square thumbnail instead
of the wide banner. The words are what a screen reader says in place of it.

- Site-wide picture: `images: [shareImage()]`.
- A page or post with its own: `images: [shareImage(post.image, post.title)]`, where the second argument describes that picture.
- A page in `PAGES`: pass `image` to `pageMetadata()` and put the file under `public/share/`. A blog post: set `image` on the post and put the file under `public/blog/`.
- Every picture is 1200 by 630 and under 300 KB. The test in [src/app/**tests**/seo.test.ts](src/app/__tests__/seo.test.ts) reads the file's own header and its weight, so a picture of another size cannot ship quietly, and neither can one exported at full quality by mistake. WhatsApp stops showing a heavy picture with no warning: the link simply appears as bare text.

### Breadcrumbs, not back buttons

Every page you reach from a list shows the trail of pages leading to it in the
top bar, e.g. `Agents / Support bot` or `Human alignment / Task one / Evaluation
run`. Use `Breadcrumbs` from `@/components/ui` with a `Crumb[]`: every step
except the last carries an `href`, the last is the page you are on. A step can
take an `onClick` instead when the name is editable in place (the agent and
simulation names).

`AppLayout` hides `customHeader` below the `md` breakpoint, so each page renders
the same trail twice: `customHeader={<Breadcrumbs items={crumbs} />}` and
`<Breadcrumbs items={crumbs} className="md:hidden" />` at the top of the page
body. No page uses a back arrow for this any more; `BackHeader` is gone.

### Server-paginated list bar

Use this whenever a list is backed by server-side `limit`/`offset` paging (today: **Traces tab** and **human-alignment task items tab**). Copy the markup from `TracesTabContent` or `src/app/[org]/human-alignment/tasks/[uuid]/page.tsx` — do not invent a new layout.

**Placement:** one row **directly above the table**, after any bulk-action strip and before the table. Never below the table. Wrap the bar and table in a `space-y-1 pt-1` group so the bar sits close to both the table below it and whatever is above it; toolbar and bulk actions stay in the outer `space-y-3` stack above that group.

**When controls appear:** `total > PAGE_SIZE_OPTIONS[0]` (i.e. more than 10 rows exist). Below that threshold the bar still shows a count on the left, but hides **Per page** and page navigation — everything already fits on one page at the smallest option.

**Row layout:** `flex flex-wrap items-center justify-between gap-3 pb-1 text-sm text-muted-foreground`

**Left (count):**

- `0` → `0 {nouns}` (e.g. `0 traces`, `0 items`)
- `total ≤ 10` → `{total} {noun}`, plain text — same weight and color as the count on the plain (fetch-everything) list pages, e.g. `/agents`. No bolding.
- `total > 10` → `Showing {start}–{end} of {total} {nouns}`, plain text. `start = offset + 1`, `end = min(offset + items.length, total)`.

**Right** (only when `total > 10`): handled inside `ServerPaginatedListBar` — `PageSizeSelect` plus icon prev/next and `Page X of Y` when `pageCount > 1`. Reset `offset` to `0` when page size changes. Disable nav while a fetch is in flight.

- Do **not** use text labels like "Previous" / "Next", do not put pagination below the table, and do not inline a second copy of this markup.

**Component:** `ServerPaginatedListBar` from `@/components/ui`. The parent list section uses `space-y-3` between toolbar, optional bulk strip, and a `space-y-1` group holding the bar + table.

**Reference implementations:** `src/components/ui/ServerPaginatedListBar.tsx`, wired in `TracesTabContent` and `src/app/[org]/human-alignment/tasks/[uuid]/page.tsx`. Styling details live in `.cursor/rules/design.md` under **Server-paginated list bar**.

## Writing UI copy

Every user-facing string in this app — headings, labels, buttons, empty states, notes, tooltips, error messages — is written for a **domain expert who is not technical**. Picture the person who runs the programme the voice agent serves: they know their own field and what a good conversation with a caller looks like, they do not know machine learning, statistics, or software.

**Who is reading it: a team, not one person.** The reader is a nonprofit with a team of domain experts. The people who label items (annotators) are usually not the same person reading the screen. So never address the reader as the one doing the labelling: no "label the items yourself", no "how often it agrees with you", no "your annotators". Write about the work, not about the reader: "Once annotators label the same items, this section shows how often the evaluator and the annotators agree." Second person is fine only for an action the reader themselves takes on that screen ("Run an evaluator on these items").

Rules:

- **Name things after the question the reader is asking**, not after the data structure behind them. "What the evaluators found" beats "Evaluator run aggregates".
- **No machine learning or statistics vocabulary** in the interface: no inference, ground truth, inter-annotator reliability, F1, precision/recall, aggregation, normalisation, distribution, threshold tuning. If a concept genuinely needs one of these, say it in ordinary words and put the detail in the description line below the heading.
- **No software vocabulary** either: no payload, schema, endpoint, config, JSON, uuid, null, boolean, cache, poll. The user should never have to know how the app is built.
- **Do not invent a term** and then reuse it as if it were established. Use the words already on screen and in the docs (evaluator, annotator, task, item, run, score, agreement). One product, one vocabulary.
- **Say what a number is and what it is measured against.** "Human agreement" is clear; "alignment" alone is not. A number with no stated comparison is a number nobody trusts.
- **Plain sentence case, expanded contractions** (does not, cannot), no em-dashes, no idioms, no metaphors, no cute phrasing.
- **Short, but never at the cost of the detail that makes it usable.** Cut the padding, keep the fact.
- **Write the sentence the way a person would say it, from the reader's side.** "The scores each evaluator gave these items" beats "What each evaluator scored across the items in this task". Anything that reads like a description of the data ("what the evaluators scored", "run aggregates", "alignment with humans") is still developer language even when the words are common ones.
- **An empty state says what to do next**, in one or two short sentences: the action that fills the screen, then what appears once it is done.

When renaming or adding copy, apply the change everywhere the same idea appears (both the run page and the task page, the dialog and the list) rather than only where the user pointed. Inconsistent wording for the same thing reads as two different things.

**That rule covers renaming one idea. It does not license a tone rewrite of nearby copy.** If the user objects to the wording of one string, change that string. Leave every other string alone, even when the same weakness is visible in the heading right next to it. Say what else you would rewrite and let the user decide. Rewriting copy nobody asked about buries the fix they did ask for in a diff they now have to review.

## Before making any change (mandatory)

Whenever making a change, adding a new feature, or modifying anything, always do the following before writing code:

1. **Review the existing code thoroughly** — search the codebase for existing code, functionality, components, hooks, and utilities that already do (or partly do) what's being asked. Don't build on assumptions about what exists; go look.
2. **Make a parallel execution plan** — split the work into subtasks, mark which are independent, and plan to run the independent ones as multiple weak agents in parallel (each owning a disjoint set of files/sections). When it is time to implement, always invoke the `parallelize` skill to run that plan. See `## Parallel execution` below.
3. **Identify reuse** — call out which parts of the existing code can be reused directly or repackaged/extracted into reusable functions or components to support what needs to be built, rather than duplicating logic.
4. **Prefer reliable libraries** — if the needed functionality is well-covered by a well-known, reliable library, bias toward using it instead of re-implementing it here, unless the requirements genuinely demand a custom solution.
5. **Share the plan and surface choices** — present the plan and explicitly raise any decisions to be made, along with their tradeoffs, and ask the user instead of making assumptions.
6. **Abstract the fix, apply it everywhere** — when fixing or changing something (especially from user feedback), derive the general rule and apply it to _every_ place it's relevant, not only the instance the user quoted. Then audit the whole set (grep, a small script, a checklist) to confirm consistency — don't eyeball a single case. Naive, one-spot patches are treated as incomplete work.

## Parallel execution (default)

**Always invoke the `parallelize` skill before you start implementing.** The moment the
plan is agreed and it is time to write code, run the skill and let it drive the work.
This is not optional and does not need the user to ask for it.

The skill splits the work into subtasks, marks which are independent, and runs the
independent ones as parallel agents, each owning a disjoint set of files/sections so
they never edit the same file at once. Dependent subtasks stay sequential. Show the
plan before launching.

Only skip it for a change so small it is a single edit to a single file.

## Workflow

- **Write tests before you call it done — non-negotiable.** Any change that adds or modifies runtime code MUST come with tests that cover the changed lines, and you MUST run them (`npm test`, plus `npm run test:coverage` to confirm the changed files aren't leaving diff lines uncovered) and see them pass BEFORE you say the work is complete or commit. "It builds and typechecks" is NOT done — CI's `codecov/patch` gate will fail a PR whose new code is untested even when the build is green. Do not report a task as finished, and do not commit, until the new behavior is exercised by passing tests. If a change seems untestable, that's a signal to extract the logic into a hook/component/util that can be unit-tested (see `useJobDeletion` and `src/components/eval-jobs/JobDeleteControls.tsx`).
- **On a later iteration on an existing PR, push before running the local checks.** This only applies once the branch already has an open PR (the first push that creates the PR still needs the full local pass first, same as above) and once the change has its tests written. From there on, commit and push right away, then run `npm test` / `npm run test:coverage` / lint / build locally afterward — don't hold the push on a local pass. The two exceptions where the old order (verify locally, then push) still applies: the first push that creates the PR, and any push right after resolving a rebase's merge conflicts (a bad conflict resolution pushed blind can leave the branch broken for everyone watching it).
- **Run `npm run coverage:patch` before you call it done.** It runs the component tests and then checks that the lines this branch adds are covered at least as well as the codebase overall, which is what Codecov's `patch` check does on the PR. `.husky/pre-push` runs the same check, so a push with untested lines is refused; `SKIP_COVERAGE=1 git push` bypasses it. If a changed file is only reached by the Playwright tests, run `npm run test:e2e:coverage` first so its coverage is on disk too.
- **Abstract the fix; apply it to every relevant place**: when the user reports a problem or asks for a change, treat the quoted instance as an _example_, not the whole job. Extract the underlying rule and apply it across all the code and copy it touches, then audit the full set (grep / a quick script) to prove consistency instead of checking one case. Shipping a naive one-spot patch and leaving siblings inconsistent is a recurring failure — do not repeat it.
- **Auto-commit when done**: once all changes for the user's request are complete and verified (including tests written and passing), create a git commit without waiting for the user to ask. Use a clear, scoped commit message that explains the why.
- **Auto-push on feature branches**: after committing, push without waiting for approval, as long as the branch is NOT the default branch (`main`). This is standing permission — do not ask, do not offer, just push and say which branch you pushed. On `main` itself, never commit or push directly: create a worktree and a branch instead.
- **Keep CLAUDE.md in sync with reality**: after making changes, check whether any high-level understanding of the app has shifted — new routes, new top-level concepts, renamed nav items, changed auth flow, new architectural patterns, new conventions, retired features, etc. If yes, update CLAUDE.md in the same commit so this file stays an accurate map of the codebase. Skip updates for low-level details (individual component tweaks, copy changes, bug fixes that don't change architecture).
