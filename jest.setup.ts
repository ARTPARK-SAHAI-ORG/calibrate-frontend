import "@testing-library/jest-dom";

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
});
