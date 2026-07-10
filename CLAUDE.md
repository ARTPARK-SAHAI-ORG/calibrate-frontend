# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
npm run test:coverage  # coverage report
```

Before starting dev: `cp env.example .env.local` and fill in `NEXT_PUBLIC_BACKEND_URL`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Husky installs git hooks via `npm install` (`prepare` script).

There is currently no test suite checked in — `jest.config.js` is configured but no `__tests__/` or `*.test.*` files exist.

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

**Paginated list endpoints**: the backend list endpoints — `GET /agents`, `/tests`, `/evaluators`, `/annotation-tasks`, `/agent-tests/agent/{uuid}/tests`, `/agent-tests/agent/{uuid}/runs`, and `/agent-tests/runs` — return a `{ items, total, limit, offset }` envelope (`Paginated<T>` in `api.ts`), not a bare array. Read the array through `unwrapList<T>(data)` from `src/lib/api.ts`; it tolerates the envelope, a legacy `{ runs: [...] }` payload, and a bare array (so it's safe for the still-unchanged list endpoints like `/tools`, `/personas`, `/scenarios`). The `q`/`limit`/`offset`/`type`/`status`/`has_failures` query params are all optional and currently unused — all list filtering/search/sort is still done client-side over the fully-fetched `items`.

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
- `src/components/agent-tabs/` — the tabbed UI on `/agents/[uuid]` (Agent / Tools / Data Extraction / Tests / Settings for build agents; Connection / Tests / Settings for connection agents). Which tabs appear is data-driven via `calibrateTabs` / `connectionTabs` arrays and a `tabLabels` map.
- `src/components/simulation-tabs/` — simulation configuration and runs UI.
- `src/components/eval-details/` — shared display components for STT / TTS / simulation-run result pages (metrics grids, provider cards, tables).
- `src/components/human-labelling/` — labelling-task dialogs. `AddRunToLabellingTaskDialog.tsx` powers the "Submit for labelling" action in `TestRunnerDialog` and `BenchmarkResultsDialog`: pick or inline-create an `llm`-type task, then convert response-type results into items via `buildItemsFromSource(source, taskType)` (maps `test_case.config.history` → `payload.chat_history`, `output.response` → `payload.agent_response`, evaluator `variable_values` → `payload.evaluator_variables`; tool-call results are skipped). Existing tasks get missing evaluators auto-attached; new tasks pass them via `evaluator_ids[]` on `POST /annotation-tasks`. Widening to other task types or source kinds is additive — extend the `SUPPORTED_TARGET_TASK_TYPES` constant and the source discriminated union.
- `src/components/ui/` — primitive UI components.
- `src/components/providers/` — React context providers (e.g. `FloatingButtonProvider`).
- `src/hooks/` — shared hooks, re-exported from `index.ts`. `useCrudResource` is the generic CRUD hook used across resource list pages.
- `src/lib/` — utilities (`api.ts`, `sidebar.ts`, `status.ts`, `datasets.ts`).
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
