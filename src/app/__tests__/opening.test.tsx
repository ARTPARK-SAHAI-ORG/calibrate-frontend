/**
 * The page shown in place of an address that does not name a workspace.
 *
 * It works out which workspace the person should land in, remembers it, and
 * replaces the address with the wanted page under that workspace. The network
 * call and sign-in state are mocked, so nothing here talks to the backend.
 */
import { render, screen, waitFor } from "@/test-utils";
import { ACTIVE_ORG_UUID_KEY, type Organization } from "@/lib/orgs";

const replace = jest.fn();

jest.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: () => ({ push: jest.fn(), replace, prefetch: jest.fn() }),
  usePathname: () => "/opening",
  useSearchParams: () => new URLSearchParams(),
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

function openAt(search: string) {
  window.history.replaceState(null, "", `/opening${search}`);
}

beforeEach(() => {
  replace.mockClear();
  fetchOrganizationsDedup.mockReset();
  fetchOrganizationsDedup.mockResolvedValue(ORGS);
  authState = { accessToken: "token-1", isLoading: false };
  window.localStorage.clear();
  openAt("");
});

it("opens the wanted page in the workspace last used", async () => {
  window.localStorage.setItem(ACTIVE_ORG_UUID_KEY, TEAM);
  openAt("?to=%2Ftests%3Ftab%3Druns");

  render(<OpeningPage />);

  await waitFor(() =>
    expect(replace).toHaveBeenCalledWith(`/${TEAM}/tests?tab=runs`),
  );
  expect(window.localStorage.getItem(ACTIVE_ORG_UUID_KEY)).toBe(TEAM);
});

it("falls back to the personal workspace when the last one used is gone", async () => {
  window.localStorage.setItem(ACTIVE_ORG_UUID_KEY, "e4d5c6b7-a8b9-4c0d-8e1f-2a3b4c5d6e7f");
  openAt("?to=%2Ftools");

  render(<OpeningPage />);

  await waitFor(() => expect(replace).toHaveBeenCalledWith(`/${PERSONAL}/tools`));
  expect(window.localStorage.getItem(ACTIVE_ORG_UUID_KEY)).toBe(PERSONAL);
});

it("opens the agents page when no page was asked for", async () => {
  render(<OpeningPage />);

  await waitFor(() =>
    expect(replace).toHaveBeenCalledWith(`/${PERSONAL}/agents`),
  );
});

it("ignores a page on another site and opens the agents page", async () => {
  openAt("?to=https%3A%2F%2Fevil.example%2Fsteal");

  render(<OpeningPage />);

  await waitFor(() =>
    expect(replace).toHaveBeenCalledWith(`/${PERSONAL}/agents`),
  );
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
    value: { ...original, search: "", reload },
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

it("waits when there is no signed-in person", async () => {
  authState = { accessToken: null, isLoading: false };

  render(<OpeningPage />);

  await Promise.resolve();
  expect(fetchOrganizationsDedup).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
});
