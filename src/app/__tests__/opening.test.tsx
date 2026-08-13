/**
 * The page shown in place of an address that does not name a workspace.
 *
 * The middleware keeps the address the person typed, so the address on screen
 * IS the page they asked for. These tests set that address, then check the page
 * puts the workspace in front of it. The network call and sign-in state are
 * mocked, so nothing here talks to the backend.
 */
import { render, screen, waitFor } from "@/test-utils";
import { ACTIVE_ORG_UUID_KEY, type Organization } from "@/lib/orgs";

const replace = jest.fn();

jest.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: () => ({ push: jest.fn(), replace, prefetch: jest.fn() }),
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
  useParams: () => ({}),
  redirect: jest.fn(),
  notFound: jest.fn(),
}));

let authState = { accessToken: "token-1" as string | null, isLoading: false };

jest.mock("../../hooks/useAccessToken", () => ({
  __esModule: true,
  useAuth: () => ({
    ...authState,
    isAuthenticated: !!authState.accessToken,
  }),
  useAccessToken: () => authState.accessToken,
}));

const fetchOrganizationsDedup = jest.fn();

jest.mock("../../hooks/useOrganizations", () => ({
  __esModule: true,
  fetchOrganizationsDedup: (token: string) => fetchOrganizationsDedup(token),
}));

import OpeningPage from "../opening/page";

const PERSONAL = "8f3c1a2b-4d5e-4f6a-8b9c-0d1e2f3a4b5c";
const TEAM = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

const org = (uuid: string, is_personal = false): Organization => ({
  uuid,
  name: is_personal ? "Personal" : "Team",
  is_personal,
  created_by_user_id: "user-1",
  member_role: "owner",
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
});

const ORGS = [org(PERSONAL, true), org(TEAM)];

/** Put the page the person asked for in the address, as the middleware leaves it. */
function askedFor(address: string) {
  window.history.replaceState(null, "", address);
}

/** A page that is nothing like the /agents fallback, so a fallback cannot pass as a pass. */
const DEEP_PAGE = "/simulations/abc/runs/def";

beforeEach(() => {
  replace.mockClear();
  fetchOrganizationsDedup.mockReset();
  fetchOrganizationsDedup.mockResolvedValue(ORGS);
  authState = { accessToken: "token-1", isLoading: false };
  window.localStorage.clear();
  askedFor(DEEP_PAGE);
});

it("opens the page in the address, in the workspace last used", async () => {
  window.localStorage.setItem(ACTIVE_ORG_UUID_KEY, TEAM);
  askedFor("/tests");

  render(<OpeningPage />);

  await waitFor(() => expect(replace).toHaveBeenCalledWith(`/${TEAM}/tests`));
  expect(window.localStorage.getItem(ACTIVE_ORG_UUID_KEY)).toBe(TEAM);
});

it("keeps the query and the # part of the page asked for", async () => {
  window.localStorage.setItem(ACTIVE_ORG_UUID_KEY, TEAM);
  askedFor(`${DEEP_PAGE}?tab=x&scores=e1:pass#item-4`);

  render(<OpeningPage />);

  await waitFor(() =>
    expect(replace).toHaveBeenCalledWith(
      `/${TEAM}${DEEP_PAGE}?tab=x&scores=e1:pass#item-4`,
    ),
  );
});

it("falls back to the personal workspace when the last one used is gone", async () => {
  window.localStorage.setItem(
    ACTIVE_ORG_UUID_KEY,
    "e4d5c6b7-a8b9-4c0d-8e1f-2a3b4c5d6e7f",
  );
  askedFor("/tools");

  render(<OpeningPage />);

  await waitFor(() =>
    expect(replace).toHaveBeenCalledWith(`/${PERSONAL}/tools`),
  );
  expect(window.localStorage.getItem(ACTIVE_ORG_UUID_KEY)).toBe(PERSONAL);
});

it("opens a plain agents visit in the workspace", async () => {
  window.localStorage.setItem(ACTIVE_ORG_UUID_KEY, TEAM);
  askedFor("/agents");

  render(<OpeningPage />);

  await waitFor(() => expect(replace).toHaveBeenCalledWith(`/${TEAM}/agents`));
});

it("opens the agents page when someone types the opening address itself", async () => {
  window.localStorage.setItem(ACTIVE_ORG_UUID_KEY, TEAM);
  askedFor("/opening");

  render(<OpeningPage />);

  await waitFor(() => expect(replace).toHaveBeenCalledWith(`/${TEAM}/agents`));
});

it("sends someone with no sign-in to login, carrying the page they asked for", async () => {
  authState = { accessToken: null, isLoading: false };
  askedFor(`${DEEP_PAGE}?tab=x`);

  render(<OpeningPage />);

  await waitFor(() =>
    expect(replace).toHaveBeenCalledWith(
      `/login?callbackUrl=${encodeURIComponent(`${DEEP_PAGE}?tab=x`)}`,
    ),
  );
  expect(fetchOrganizationsDedup).not.toHaveBeenCalled();
});

it("shows the error screen when the person has no workspace", async () => {
  fetchOrganizationsDedup.mockResolvedValue([]);

  render(<OpeningPage />);

  expect(
    await screen.findByText("We could not open your workspace."),
  ).toBeInTheDocument();
  expect(replace).not.toHaveBeenCalled();
});

it("shows the error screen when the workspace list cannot be loaded", async () => {
  fetchOrganizationsDedup.mockResolvedValue(null);

  render(<OpeningPage />);

  expect(
    await screen.findByText("We could not open your workspace."),
  ).toBeInTheDocument();
  expect(replace).not.toHaveBeenCalled();
});

it("reloads the page when the person retries after the error", async () => {
  fetchOrganizationsDedup.mockResolvedValue(null);
  const reload = jest.fn();
  const original = window.location;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...original, pathname: DEEP_PAGE, search: "", hash: "", reload },
  });

  try {
    render(<OpeningPage />);
    (await screen.findByText("Retry")).click();
    expect(reload).toHaveBeenCalled();
  } finally {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: original,
    });
  }
});

it("waits while sign-in is still loading", async () => {
  authState = { accessToken: null, isLoading: true };

  render(<OpeningPage />);

  await Promise.resolve();
  expect(fetchOrganizationsDedup).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
});
