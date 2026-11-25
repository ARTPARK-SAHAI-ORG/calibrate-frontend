import { render, screen, setupUser, waitFor } from "@/test-utils";
import type { Organization } from "@/lib/orgs";
import { ChatLimitSection } from "../ChatLimitSection";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const updateOrganization = jest.fn();
const clearOrgLimitsCache = jest.fn();
let limits: {
  uses_own_provider_keys: boolean;
  max_chat_replies_per_day: number | null;
};

jest.mock("../../../hooks", () => ({
  useAccessToken: () => "tok",
  useOrganizations: () => ({ updateOrganization }),
  useOrgLimits: () => limits,
}));
jest.mock("../../../hooks/useMaxRowsPerEval", () => ({
  clearOrgLimitsCache: () => clearOrgLimitsCache(),
}));

const org = (limitWithOwnKeys?: boolean): Organization => ({
  uuid: "org-1",
  name: "Acme",
  is_personal: false,
  created_by_user_id: "u",
  member_role: "owner",
  created_at: "",
  updated_at: "",
  ...(limitWithOwnKeys === undefined
    ? {}
    : { settings: { chat_link: { limit_with_own_keys: limitWithOwnKeys } } }),
});

beforeEach(() => {
  jest.clearAllMocks();
  limits = { uses_own_provider_keys: true, max_chat_replies_per_day: 300 };
});

it("is hidden for a workspace on Calibrate's keys", () => {
  limits = { uses_own_provider_keys: false, max_chat_replies_per_day: 200 };
  render(<ChatLimitSection org={org()} />);
  expect(screen.queryByText("Chat links")).toBeNull();
});

it("shows the limit as on by default, with the workspace's number", () => {
  render(<ChatLimitSection org={org()} />);
  expect(
    screen.getByRole("checkbox", {
      name: "Limit each chat link to 300 replies a day",
    }),
  ).toBeChecked();
});

it("falls back to 200 a day when the limit is off", () => {
  limits = { uses_own_provider_keys: true, max_chat_replies_per_day: null };
  render(<ChatLimitSection org={org(false)} />);
  expect(
    screen.getByRole("checkbox", {
      name: "Limit each chat link to 200 replies a day",
    }),
  ).not.toBeChecked();
});

it("saves the choice and forgets the stored limits", async () => {
  updateOrganization.mockResolvedValue({});
  const user = setupUser();
  render(<ChatLimitSection org={org()} />);
  const box = screen.getByRole("checkbox");
  await user.click(box);
  expect(updateOrganization).toHaveBeenCalledWith("org-1", {
    settings: { chat_link: { limit_with_own_keys: false } },
  });
  await waitFor(() => expect(clearOrgLimitsCache).toHaveBeenCalled());
  expect(box).not.toBeChecked();
});

it("puts the box back and says why when the save fails", async () => {
  updateOrganization.mockRejectedValue(new Error("Server said no"));
  const user = setupUser();
  render(<ChatLimitSection org={org()} />);
  const box = screen.getByRole("checkbox");
  await user.click(box);
  await waitFor(() => expect(box).toBeChecked());
  expect(screen.getByText("Server said no")).toBeInTheDocument();
  expect(clearOrgLimitsCache).not.toHaveBeenCalled();
});
