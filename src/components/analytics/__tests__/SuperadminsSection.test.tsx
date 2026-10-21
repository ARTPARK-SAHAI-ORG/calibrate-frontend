import React from "react";
import { render, screen, setupUser, waitFor } from "@/test-utils";
import { toast } from "sonner";
import { SuperadminsSection } from "../SuperadminsSection";
import {
  addSuperadmin,
  fetchSuperadmins,
  removeSuperadmin,
  type Superadmin,
} from "@/lib/analyticsApi";

jest.mock("../../../lib/analyticsApi", () => ({
  fetchSuperadmins: jest.fn(),
  addSuperadmin: jest.fn(),
  removeSuperadmin: jest.fn(),
}));
jest.mock("../../../lib/reportError", () => ({ reportError: jest.fn() }));
jest.mock("sonner", () => ({ toast: { error: jest.fn() } }));

const mockFetch = fetchSuperadmins as jest.MockedFunction<typeof fetchSuperadmins>;
const mockAdd = addSuperadmin as jest.MockedFunction<typeof addSuperadmin>;
const mockRemove = removeSuperadmin as jest.MockedFunction<typeof removeSuperadmin>;

const owner: Superadmin = {
  uuid: "u-owner",
  email: "owner@example.com",
  first_name: "Olive",
  last_name: "Owner",
  can_remove: false,
};
const helper: Superadmin = {
  uuid: "u-helper",
  email: "helper@example.com",
  first_name: "",
  last_name: "",
  can_remove: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue([owner, helper]);
});

describe("SuperadminsSection", () => {
  it("lists each superadmin by name, falling back to the email", async () => {
    render(<SuperadminsSection accessToken="t" />);
    expect(await screen.findByText("Olive Owner")).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getAllByText("helper@example.com")).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledWith("t");
  });

  it("shows a remove button only for superadmins that can be removed", async () => {
    render(<SuperadminsSection accessToken="t" />);
    await screen.findByText("Olive Owner");
    expect(screen.getAllByRole("button", { name: "Remove superadmin" })).toHaveLength(1);
  });

  it("adds a superadmin and reads the list back", async () => {
    const user = setupUser();
    mockAdd.mockResolvedValue(helper);
    render(<SuperadminsSection accessToken="t" />);
    await screen.findByText("Olive Owner");

    await user.type(screen.getByLabelText("Email address"), " new@example.com ");
    await user.click(screen.getByRole("button", { name: "Add superadmin" }));

    expect(mockAdd).toHaveBeenCalledWith("t", "new@example.com");
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByLabelText("Email address")).toHaveValue(""));
  });

  it("shows the server's reason under the email box when adding fails", async () => {
    const user = setupUser();
    mockAdd.mockRejectedValue(
      new Error('Request failed: 404 - {"detail":"No Calibrate account uses this email"}'),
    );
    render(<SuperadminsSection accessToken="t" />);
    await screen.findByText("Olive Owner");

    await user.type(screen.getByLabelText("Email address"), "nobody@example.com{Enter}");

    expect(await screen.findByText("No Calibrate account uses this email")).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toHaveValue("nobody@example.com");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("removes a superadmin after confirming, keeping the dialog until the list is read back", async () => {
    const user = setupUser();
    let finishReload: (v: Superadmin[]) => void = () => {};
    mockRemove.mockResolvedValue({});
    render(<SuperadminsSection accessToken="t" />);
    await screen.findByText("Olive Owner");

    await user.click(screen.getByRole("button", { name: "Remove superadmin" }));
    expect(screen.getByRole("heading", { name: "Remove superadmin" })).toBeInTheDocument();

    mockFetch.mockReturnValueOnce(new Promise((r) => (finishReload = r)));
    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(mockRemove).toHaveBeenCalledWith("t", "u-helper");
    expect(screen.getByRole("button", { name: /Removing/ })).toBeDisabled();

    finishReload([owner]);
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Remove superadmin" })).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("helper@example.com")).not.toBeInTheDocument();
  });

  it("keeps the dialog open and says why when removing fails", async () => {
    const user = setupUser();
    mockRemove.mockRejectedValue(
      new Error(
        'Request failed: 400 - {"detail":"This superadmin is set by the server and cannot be removed"}',
      ),
    );
    render(<SuperadminsSection accessToken="t" />);
    await screen.findByText("Olive Owner");

    await user.click(screen.getByRole("button", { name: "Remove superadmin" }));
    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "This superadmin is set by the server and cannot be removed",
      ),
    );
    expect(screen.getByRole("heading", { name: "Remove superadmin" })).toBeInTheDocument();
  });

  it("offers a retry when the list cannot be loaded", async () => {
    const user = setupUser();
    mockFetch.mockRejectedValueOnce(new Error("network"));
    render(<SuperadminsSection accessToken="t" />);

    await user.click(await screen.findByText("Retry", { exact: false }));
    expect(await screen.findByText("Olive Owner")).toBeInTheDocument();
  });
});
