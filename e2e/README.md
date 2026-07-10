# End-to-end tests (Playwright)

These tests drive a **real browser** through the actual running app — the layer
above the Jest/React Testing Library component tests in `src/`.

## Running

```bash
npm run test:e2e          # headless, boots `npm run dev` automatically
npm run test:e2e:ui       # interactive UI mode (watch, time-travel, pick tests)
npx playwright test e2e/login.spec.ts       # a single file
npx playwright test -g "short password"     # a single test by name
```

Config lives in `playwright.config.ts`. The `webServer` block starts
`npm run dev -- -p 3100` and waits for `http://localhost:3100` — a dedicated
port so E2E never reuses (or mixes coverage with) a dev server you're running by
hand on :3000, or one from another git worktree. Override with `E2E_PORT`.

First-time setup only: `npx playwright install chromium` to download the browser.

## Coverage

E2E coverage is **separate** from the Jest component coverage:

```bash
npm run test:e2e:coverage   # -> coverage/e2e/   (this suite)
npm run test:coverage       # -> coverage/component/ (Jest / RTL)
npm run coverage            # both, into their own dirs
```

`npm run test:e2e:coverage` sets `E2E_COVERAGE=1`, which turns on the
`monocart-reporter` and the coverage hook in `e2e/fixtures.ts`: Chromium's V8 JS
coverage is collected per test, mapped back to `src/*` via source maps, and
written as `coverage/e2e/lcov.info` plus a browsable HTML report at
`coverage/e2e/index.html`. A post-step (`scripts/clean-e2e-lcov.mjs`) strips the
generated bundle chunks monocart also emits, leaving only real `src/` files in
the lcov so CI tools don't double-count. Coverage collection is Chromium-only
and a no-op on a plain `npm run test:e2e` run.

## When you need the backend

The starter `login.spec.ts` only touches the public `/login` route and its
client-side validation, so it needs **no backend**.

Authenticated flows (agents, tests, simulations) go through the auth middleware
and call `NEXT_PUBLIC_BACKEND_URL`. Two options:

1. **Real/staging backend** — set `NEXT_PUBLIC_BACKEND_URL` and seed an
   `access_token` (via `page.addInitScript` writing to `localStorage` + cookie,
   mirroring what `src/app/login/page.tsx` does on success) to skip the login UI.
2. **Mock at the network layer** — `page.route("**/agents", route => route.fulfill({ json: [...] }))`
   to return canned responses without a backend.

## Where each kind of test goes

- **Component / interaction behavior** (a dialog opens, a form validates, a
  filter updates a list): Jest + RTL in `src/**/__tests__/` — fast, no browser.
  See `src/test-utils/` for the shared render helper.
- **Full flows across pages** (login → navigate → create → verify), routing,
  middleware: Playwright here in `e2e/`.
