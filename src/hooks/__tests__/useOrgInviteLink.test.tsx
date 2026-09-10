// The hook renders nothing that reads the address, but useOrganizations pulls
// next/navigation in, so it is faked here the way useOrganizations.test.ts does.
jest.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: jest.fn(),
  notFound: jest.fn(),
}));

// Relative specifiers, not "@/": next/jest only rewrites the alias in import
// declarations, not inside jest.mock()'s first argument.
jest.mock("../../lib/api", () => ({
  apiClient: jest.fn(),
  apiDelete: jest.fn(),
  apiGet: jest.fn(),
  apiPost: jest.fn(),
}));

jest.mock("../../lib/reportError", () => ({
  reportError: jest.fn(),
}));

import { renderHook, act, waitFor } from "@testing-library/react";
import { useOrgInviteLink } from "@/hooks/useOrganizations";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { clearAllRequestCaches } from "@/lib/requestCache";
import type { InviteLink } from "@/lib/invites";

const mockApiGet = apiGet as jest.Mock;
const mockApiPost = apiPost as jest.Mock;
const mockApiDelete = apiDelete as jest.Mock;

const ORG = "org-1";
const TOKEN = "token-a";
const link: InviteLink = { token: "tok-123", created_at: "2024-01-01" };

beforeEach(() => {
  jest.clearAllMocks();
  // The hook caches per token and workspace at module scope; wipe it so one
  // case's answer never shows up in the next.
  clearAllRequestCaches();
});

describe("useOrgInviteLink", () => {
  it("loads the workspace's link", async () => {
    mockApiGet.mockResolvedValueOnce(link);

    const { result } = renderHook(() => useOrgInviteLink(TOKEN, ORG));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.inviteLink).toEqual(link);
    expect(result.current.error).toBeNull();
    expect(mockApiGet).toHaveBeenCalledWith(
      `/organizations/${ORG}/invite-link`,
      TOKEN,
    );
  });

  it("reports no link, and no error, when the workspace has none", async () => {
    mockApiGet.mockRejectedValueOnce(
      new Error("Request failed: 404 - Not Found"),
    );

    const { result } = renderHook(() => useOrgInviteLink(TOKEN, ORG));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.inviteLink).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("sets an error for any other failure", async () => {
    mockApiGet.mockRejectedValueOnce(
      new Error("Request failed: 500 - Server error"),
    );

    const { result } = renderHook(() => useOrgInviteLink(TOKEN, ORG));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe("Request failed: 500 - Server error");
    expect(result.current.inviteLink).toBeNull();
  });

  it("makes a link and shows the new one", async () => {
    mockApiGet.mockRejectedValueOnce(
      new Error("Request failed: 404 - Not Found"),
    );
    const created: InviteLink = { token: "tok-new", created_at: "2024-02-02" };
    mockApiPost.mockResolvedValueOnce(created);

    const { result } = renderHook(() => useOrgInviteLink(TOKEN, ORG));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(result.current.createInviteLink()).resolves.toEqual(created);
    });

    expect(mockApiPost).toHaveBeenCalledWith(
      `/organizations/${ORG}/invite-link`,
      TOKEN,
      {},
    );
    expect(result.current.inviteLink).toEqual(created);
  });

  it("turns the link off", async () => {
    mockApiGet.mockResolvedValueOnce(link);
    mockApiDelete.mockResolvedValueOnce({});

    const { result } = renderHook(() => useOrgInviteLink(TOKEN, ORG));
    await waitFor(() => expect(result.current.inviteLink).toEqual(link));

    await act(async () => {
      await result.current.revokeInviteLink();
    });

    expect(mockApiDelete).toHaveBeenCalledWith(
      `/organizations/${ORG}/invite-link`,
      TOKEN,
    );
    expect(result.current.inviteLink).toBeNull();
  });

  it("reuses the answer it already has instead of asking again", async () => {
    mockApiGet.mockResolvedValueOnce(link);

    const first = renderHook(() => useOrgInviteLink(TOKEN, ORG));
    await waitFor(() => expect(first.result.current.inviteLink).toEqual(link));
    expect(mockApiGet).toHaveBeenCalledTimes(1);

    const second = renderHook(() => useOrgInviteLink(TOKEN, ORG));
    await waitFor(() =>
      expect(second.result.current.isLoading).toBe(false),
    );
    expect(second.result.current.inviteLink).toEqual(link);
    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });

  it("reads the other workspace's link after switching workspace", async () => {
    const other: InviteLink = { token: "tok-other", created_at: "2024-03-03" };
    mockApiGet.mockResolvedValueOnce(link).mockResolvedValueOnce(other);

    const { result, rerender } = renderHook(
      ({ org }: { org: string }) => useOrgInviteLink(TOKEN, org),
      { initialProps: { org: ORG } },
    );
    await waitFor(() => expect(result.current.inviteLink).toEqual(link));

    rerender({ org: "org-2" });

    await waitFor(() => expect(result.current.inviteLink).toEqual(other));
    expect(mockApiGet).toHaveBeenLastCalledWith(
      "/organizations/org-2/invite-link",
      TOKEN,
    );
  });

  it("refuses to make or turn off a link without a signed-in reader", async () => {
    const { result } = renderHook(() => useOrgInviteLink(null, ORG));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(result.current.createInviteLink()).rejects.toThrow(
      "Not signed in",
    );
    await expect(result.current.revokeInviteLink()).rejects.toThrow(
      "Not signed in",
    );
    expect(mockApiPost).not.toHaveBeenCalled();
    expect(mockApiDelete).not.toHaveBeenCalled();
  });

  it("does not read anything without a signed-in reader", async () => {
    const { result } = renderHook(() => useOrgInviteLink(null, ORG));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockApiGet).not.toHaveBeenCalled();
    expect(result.current.inviteLink).toBeNull();
  });

  it("does not read anything without a workspace", async () => {
    const { result } = renderHook(() => useOrgInviteLink(TOKEN, null));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockApiGet).not.toHaveBeenCalled();
    expect(result.current.inviteLink).toBeNull();
  });
});
