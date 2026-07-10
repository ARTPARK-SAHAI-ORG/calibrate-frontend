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
`npm run dev` and waits for `http://localhost:3000`; if a dev server is already
running it reuses it (locally — in CI it always starts a fresh one).

First-time setup only: `npx playwright install chromium` to download the browser.

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
