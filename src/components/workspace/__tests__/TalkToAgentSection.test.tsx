import { render, screen, setupUser, waitFor } from "@/test-utils";
import { toast } from "sonner";
import type { Organization } from "@/lib/orgs";
import { TalkToAgentSection } from "../TalkToAgentSection";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const updateOrganization = jest.fn();
let maximum: number | null = 300;

jest.mock("../../../hooks", () => ({
  useAccessToken: () => "tok",
  useOrganizations: () => ({ updateOrganization }),
  useOrgLimits: () => ({
    uses_own_provider_keys: false,
    max_chat_replies_per_day: maximum,
  }),
}));

const org = (perDay?: number): Organization => ({
  uuid: "org-1",
  name: "Acme",
  is_personal: false,
  created_by_user_id: "u",
  member_role: "owner",
  created_at: "",
  updated_at: "",
  ...(perDay === undefined
    ? {}
    : { settings: { talk_to_agent: { default_messages_per_day: perDay } } }),
});

const box = () => screen.getByLabelText("Default messages per day");

beforeEach(() => {
  jest.clearAllMocks();
  maximum = 300;
  updateOrganization.mockResolvedValue(undefined);
});

it("shows the saved number, or the backend default when none is saved", () => {
  const { unmount } = render(<TalkToAgentSection org={org(50)} />);
  expect(screen.getByText("Talk to agent")).toBeInTheDocument();
  expect(box()).toHaveValue(50);
  unmount();
  render(<TalkToAgentSection org={org()} />);
  expect(box()).toHaveValue(200);
});

it("saves a new number on Enter", async () => {
  const user = setupUser();
  render(<TalkToAgentSection org={org(50)} />);
  await user.clear(box());
  await user.type(box(), "80{Enter}");
  await waitFor(() =>
    expect(updateOrganization).toHaveBeenCalledWith("org-1", {
      settings: { talk_to_agent: { default_messages_per_day: 80 } },
    }),
  );
  expect(toast.success).toHaveBeenCalledWith(
    "Saved the default messages per day",
  );
});

it("saves on leaving the box, and not when the number is unchanged", async () => {
  const user = setupUser();
  render(<TalkToAgentSection org={org(50)} />);
  await user.click(box());
  await user.tab();
  expect(updateOrganization).not.toHaveBeenCalled();
  await user.clear(box());
  await user.type(box(), "60");
  await user.tab();
  await waitFor(() => expect(updateOrganization).toHaveBeenCalledTimes(1));
});

it("never saves a number below 1", async () => {
  const user = setupUser();
  render(<TalkToAgentSection org={org(50)} />);
  await user.clear(box());
  await user.type(box(), "0{Enter}");
  expect(updateOrganization).not.toHaveBeenCalled();
});

it("marks a number above the maximum and does not save it", async () => {
  const user = setupUser();
  render(<TalkToAgentSection org={org(50)} />);
  await user.clear(box());
  await user.type(box(), "301{Enter}");
  expect(box().className).toContain("border-red-500/60");
  expect(
    screen.getByText(/This is more than your workspace allows/),
  ).toBeInTheDocument();
  expect(updateOrganization).not.toHaveBeenCalled();
});

it("allows any number when the workspace has no maximum", async () => {
  maximum = null;
  const user = setupUser();
  render(<TalkToAgentSection org={org(50)} />);
  await user.clear(box());
  await user.type(box(), "5000{Enter}");
  await waitFor(() => expect(updateOrganization).toHaveBeenCalled());
  expect(screen.queryByText(/This is more than/)).toBeNull();
});

it("puts the saved number back and shows why when the save fails", async () => {
  updateOrganization.mockRejectedValueOnce(
    new Error("Messages per day cannot be more than 300"),
  );
  const user = setupUser();
  render(<TalkToAgentSection org={org(50)} />);
  await user.clear(box());
  await user.type(box(), "90{Enter}");
  expect(
    await screen.findByText("Messages per day cannot be more than 300"),
  ).toBeInTheDocument();
  expect(box()).toHaveValue(50);
});

it("puts the saved number back when the box is left empty", async () => {
  const user = setupUser();
  render(<TalkToAgentSection org={org(50)} />);
  await user.clear(box());
  await user.tab();
  expect(box()).toHaveValue(50);
  expect(updateOrganization).not.toHaveBeenCalled();
});
