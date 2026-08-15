/**
 * The wrapper every page behind sign-in sits inside.
 *
 * It shows the page straight away and only swaps to the Not Found screen once
 * it knows the workspace in the address is not one the person belongs to. The
 * network call and sign-in state are mocked, so nothing here talks to the
 * backend.
 */
import { render, screen, waitFor } from "@/test-utils";
import { ACTIVE_ORG_UUID_KEY, type Organization } from "@/lib/orgs";

const MINE = "8f3c1a2b-4d5e-4f6a-8b9c-0d1e2f3a4b5c";
const SOMEONE_ELSES = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

let params: { org?: string } = { org: MINE };

jest.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => params,
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

import WorkspaceLayout from "../[org]/layout";

const org = (uuid: string): Organization => ({
  uuid,
  name: "Workspace",
  is_personal: true,
  created_by_user_id: "user-1",
  member_role: "owner",
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
});

const page = <p>Agent list</p>;

beforeEach(() => {
  params = { org: MINE };
  authState = { accessToken: "token-1", isLoading: false };
  fetchOrganizationsDedup.mockReset();
  fetchOrganizationsDedup.mockResolvedValue([org(MINE)]);
  window.localStorage.clear();
});

it("shows the page while the workspace is still being checked", () => {
  fetchOrganizationsDedup.mockReturnValue(new Promise(() => {}));

  render(<WorkspaceLayout>{page}</WorkspaceLayout>);

  expect(screen.getByText("Agent list")).toBeInTheDocument();
  expect(screen.queryByText("Not Found")).not.toBeInTheDocument();
});

it("keeps showing the page for a workspace the person belongs to", async () => {
  render(<WorkspaceLayout>{page}</WorkspaceLayout>);

  await waitFor(() =>
    expect(window.localStorage.getItem(ACTIVE_ORG_UUID_KEY)).toBe(MINE),
  );
  expect(screen.getByText("Agent list")).toBeInTheDocument();
});

it("shows the not-available screen for a workspace the person does not belong to", async () => {
  params = { org: SOMEONE_ELSES };

  render(<WorkspaceLayout>{page}</WorkspaceLayout>);

  expect(
    await screen.findByText("This page is not available"),
  ).toBeInTheDocument();
  expect(screen.queryByText("Agent list")).not.toBeInTheDocument();
  expect(window.localStorage.getItem(ACTIVE_ORG_UUID_KEY)).toBeNull();
});

it("keeps showing the page when the workspace list cannot be loaded", async () => {
  fetchOrganizationsDedup.mockResolvedValue(null);

  render(<WorkspaceLayout>{page}</WorkspaceLayout>);

  await waitFor(() => expect(fetchOrganizationsDedup).toHaveBeenCalled());
  expect(screen.getByText("Agent list")).toBeInTheDocument();
  expect(screen.queryByText("Not Found")).not.toBeInTheDocument();
});

it("does not check anything while sign-in is still loading", async () => {
  authState = { accessToken: null, isLoading: true };

  render(<WorkspaceLayout>{page}</WorkspaceLayout>);

  await Promise.resolve();
  expect(fetchOrganizationsDedup).not.toHaveBeenCalled();
  expect(screen.getByText("Agent list")).toBeInTheDocument();
});

it("does not check anything when the address names no workspace", async () => {
  params = {};

  render(<WorkspaceLayout>{page}</WorkspaceLayout>);

  await Promise.resolve();
  expect(fetchOrganizationsDedup).not.toHaveBeenCalled();
  expect(screen.getByText("Agent list")).toBeInTheDocument();
});
