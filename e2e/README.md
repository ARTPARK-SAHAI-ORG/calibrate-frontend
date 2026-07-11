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
npm run test:e2e:coverage              # public specs      -> coverage/e2e/
npm run test:e2e:integration:coverage  # authenticated     -> coverage/e2e/ (needs backend)
npm run test:coverage                  # component (Jest)  -> coverage/component/
npm run coverage                       # component + public e2e, into their own dirs
```

`npm run test:e2e:coverage` sets `E2E_COVERAGE=1`, which turns on the
`monocart-reporter` and the coverage hook in `e2e/fixtures.ts`: Chromium's V8 JS
coverage is collected per test, mapped back to `src/*` via source maps, and
written as `coverage/e2e/lcov.info` plus a browsable HTML report at
`coverage/e2e/index.html`. A post-step (`scripts/clean-e2e-lcov.mjs`) strips the
generated bundle chunks monocart also emits, leaving only real `src/` files in
the lcov so CI tools don't double-count. Coverage collection is Chromium-only
and a no-op on a plain `npm run test:e2e` run.

## Two kinds of E2E: public vs. integration

Specs are split into two Playwright **projects** (see `playwright.config.ts`):

| Project | Command | Backend | Specs |
| --- | --- | --- | --- |
| `public` | `npm run test:e2e` | none | `login.spec.ts`, `signup.spec.ts`, `landing.spec.ts` — public routes, client-side validation/behavior (any `*.spec.ts` that isn't `*.auth.spec.ts`) |
| `authenticated` | `npm run test:e2e:integration` | **required** | `*.auth.spec.ts` — logged-in CRUD flows against a real backend (agents/agent detail, tools, evaluators, personas/scenarios, STT/TTS datasets, simulations, workspace settings, and cross-page navigation) |

The authenticated specs all share **one** backend account (seeded once by
`auth.setup.ts`) and mutate global workspace state, so `test:e2e:integration`
runs them with `--workers=1`. The `public` specs are independent and run fully
parallel.

### How authenticated specs log in (no login UI)

`auth.setup.ts` runs first (a project dependency). It calls the backend's
`POST /auth/signup` to mint a real JWT, seeds it as the `access_token` cookie +
localStorage (exactly what `src/app/login/page.tsx` does on a real login), and
saves it as Playwright storage state (`e2e/.auth/user.json`, gitignored). The
`authenticated` specs load that state, so they start already logged in and can
hit protected pages directly.

### Running the backend

The backend is the open-source [`calibrate-backend`](https://github.com/ARTPARK-SAHAI-ORG/calibrate-backend).
It's a Python/`uv` app using on-disk SQLite — no external services.

Locally:

```bash
# in a clone of calibrate-backend, from its src/ dir
DB_ROOT_DIR=/tmp/cal-db OBJECT_STORAGE_MODE=local MAX_CONCURRENT_JOBS=1 \
  JWT_SECRET_KEY=dev-secret-at-least-32-characters-long \
  CORS_ALLOWED_ORIGINS=http://localhost:3100 \
  uv run uvicorn main:app --port 8000

# then, in this repo:
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000 npm run test:e2e:integration
```

Point `NEXT_PUBLIC_BACKEND_URL` at any backend (local or staging). CI does the
same automatically in the `e2e-integration` job — it checks out the backend,
boots it on `:8000`, and runs `test:e2e:integration:coverage`.

> CORS: the E2E frontend runs on `:3100`, so the backend's
> `CORS_ALLOWED_ORIGINS` must include `http://localhost:3100`.

Prefer not to run a backend for a given spec? Mock at the network layer instead:
`page.route("**/agents", route => route.fulfill({ json: [...] }))`.

## Where each kind of test goes

- **Component / interaction behavior** (a dialog opens, a form validates, a
  filter updates a list): Jest + RTL in `src/**/__tests__/` — fast, no browser.
  See `src/test-utils/` for the shared render helper.
- **Full flows across pages** (login → navigate → create → verify), routing,
  middleware: Playwright here in `e2e/`.
