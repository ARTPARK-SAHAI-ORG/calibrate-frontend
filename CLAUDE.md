# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Calibrate** (npm: `calibrate-frontend`) — a Next.js 16 / React 19 frontend for a voice-agent simulation and evaluation platform. Users create voice AI agents, unit-test STT/TTS providers, and run end-to-end simulated conversations with personas, scenarios, and custom evaluators.

> Branding note: UI says "Calibrate" everywhere, but external infra (Discord etc.) still references "pense". Community URLs live in `src/constants/links.ts` — import from there, never hardcode.

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
- Public: `/` (landing), `/login`, `/signup`, `/about`, `/public/...` (shareable result pages)
- Authenticated app pages: `/agents`, `/tools`, `/evaluators`, `/stt`, `/tests`, `/tts`, `/personas`, `/scenarios`, `/simulations`, `/datasets/[id]`
- API routes: `/api/auth` (NextAuth handler), `/api/debug-env`
- The sidebar in `src/components/AppLayout.tsx` drives navigation: each `NavItem.id` maps to the route `/${id}`. Renaming a nav item's `id` changes the route.

**Auth** (`src/middleware.ts`, `src/auth.ts`): NextAuth v5 with Google provider. The middleware accepts EITHER a NextAuth session OR an `access_token` cookie (backend-issued JWT from email/password login). On Google sign-in, `auth.ts` exchanges the Google id_token with the backend's `/auth/google` to get a backend JWT. Public routes (landing, login, signup, /public/*, /about, /terms, /privacy, /debug, /docs) bypass auth. `MAINTENANCE_MODE=true` redirects all non-API traffic to `/`.

**Access token hook**: Use `useAuth()` / `useAccessToken()` from `src/hooks/useAccessToken.ts` in new code — it unifies NextAuth session and localStorage JWT. Do NOT use `useSession()` directly (it only covers Google OAuth, not email/password).

**Sign-out must clear all three**: `localStorage` (`access_token`, `user`), the `access_token` cookie, and `signOut()`.

**API client**: `src/lib/api.ts` wraps fetch with default headers (`ngrok-skip-browser-warning`, Bearer token) and auto-signs-out on 401. Prefer it over raw fetch when adding new backend calls.

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
- `src/components/ui/` — primitive UI components.
- `src/components/providers/` — React context providers (e.g. `FloatingButtonProvider`).
- `src/hooks/` — shared hooks, re-exported from `index.ts`. `useCrudResource` is the generic CRUD hook used across resource list pages.
- `src/lib/` — utilities (`api.ts`, `sidebar.ts`, `status.ts`, `datasets.ts`).
- `src/constants/` — inbuilt tools catalogue, limits, shared links, polling intervals.

**Agent types**: there are two — `type: "agent"` (Build, platform-configured STT/TTS/LLM) and `type: "connection"` (Connect, external `agent_url`). Never use `"calibrate"` as the type value. Tabs and settings differ between the two.

**Monitoring**: Sentry is wired through `sentry.edge.config.ts`, `sentry.server.config.ts`, `src/instrumentation.ts`, and `src/instrumentation-client.ts`. `@vercel/analytics` is also enabled.

## Conventions worth knowing

- Tailwind v4 with semantic tokens (`foreground`, `background`, `muted`, `accent`, `border`). Avoid hardcoded colors outside the validation/status patterns documented in `.cursor/rules/design.md`.
- All interactive elements need `cursor-pointer`; disabled elements `cursor-not-allowed disabled:opacity-50`.
- Mobile-first. Primary breakpoint is `md:` (768px). Tables convert to card layouts on mobile (`hidden md:block` for the table, `md:hidden` for the card version).
- Page titles are set via `document.title` in a `useEffect` in the page component AND via `metadata` export in the route's `layout.tsx` — keep them in sync when renaming.
