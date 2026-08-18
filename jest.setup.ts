import "@testing-library/jest-dom";

/**
 * A build that does not say which address it answers on is treated as a copy
 * of the hosted site, and asks search engines to skip it (IS_CANONICAL_SITE in
 * src/lib/site.ts). Tests run as the hosted site, so that guard does not turn
 * itself on everywhere. The tests in src/app/__tests__/seo.test.ts set their
 * own value where they need a different one.
 */
process.env.NEXT_PUBLIC_APP_URL ||= "https://calibrate.artpark.ai";

/**
 * Global mocks for component/interaction tests.
 *
 * These modules ship untranspiled ESM (next-auth) or require the Next.js
 * runtime (next/navigation) that jsdom doesn't provide. Component tests care
 * about *our* UI behavior, not these libraries, so we stub them here once for
 * every test. Individual tests can still override with their own `jest.mock`.
 */

// next-auth/react — pulled in transitively via AppLayout's sidebar.
jest.mock("next-auth/react", () => ({
  __esModule: true,
  signIn: jest.fn(),
  signOut: jest.fn(),
  useSession: () => ({ data: null, status: "unauthenticated" }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// next/navigation — App Router hooks. Pages call router.push on interactions;
// override the return value per-test when you need to assert on navigation.
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
  prefetch: jest.fn(),
};

jest.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: () => mockRouter,
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: jest.fn(),
  notFound: jest.fn(),
}));

// Reset navigation spies between tests so call counts don't leak.
afterEach(() => {
  Object.values(mockRouter).forEach((fn) => fn.mockClear());
  // Components that keep view state in the address bar (open dialogs, item
  // filters) write it with history.replaceState. jsdom keeps one address bar
  // for the whole file, so without this the next test starts on the previous
  // test's URL.
  window.history.replaceState(null, "", "/");
});

// jsdom has no layout, so it ships no scrollIntoView. Components that scroll a
// conversation to the newest turn call it on a real element; stub it here
// rather than making the product code guard for a browser feature that always
// exists outside tests.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = jest.fn();
}
