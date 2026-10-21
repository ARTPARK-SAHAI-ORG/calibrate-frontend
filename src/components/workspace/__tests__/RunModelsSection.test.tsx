import React from "react";
import { render, screen, setupUser, waitFor } from "@/test-utils";
import { toast } from "sonner";
import { RunModelsSection } from "../RunModelsSection";
import type { Organization } from "@/lib/orgs";

jest.mock("sonner", () => ({ toast: { success: jest.fn() } }));

const updateOrganization = jest.fn();
jest.mock("../../../hooks", () => ({
  useAccessToken: () => "tok",
  useOrganizations: () => ({ updateOrganization }),
}));

const org = (settings: Organization["settings"] = undefined): Organization => ({
  uuid: "org-1",
  name: "Org",
  is_personal: false,
  created_by_user_id: "u1",
  member_role: "owner",
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
  settings,
});

const rangesSwitch = () =>
  screen.getByRole("switch", { name: "Show likely ranges" });

describe("RunModelsSection", () => {
  beforeEach(() => jest.clearAllMocks());

  it("starts with likely ranges off when the workspace never turned them on", () => {
    render(<RunModelsSection org={org()} />);
    expect(rangesSwitch()).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByText(
        "Under each pass rate and score, show the range the true value is likely to fall in 95% of the time",
      ),
    ).toBeInTheDocument();
  });

  it("saves likely ranges on, and says so", async () => {
    updateOrganization.mockResolvedValue(org());
    const user = setupUser();
    render(<RunModelsSection org={org()} />);

    await user.click(rangesSwitch());

    expect(updateOrganization).toHaveBeenCalledWith("org-1", {
      settings: { model_benchmarking: { show_likely_ranges: true } },
    });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Likely ranges are now shown"),
    );
    expect(rangesSwitch()).toHaveAttribute("aria-checked", "true");
  });

  it("saves likely ranges off", async () => {
    updateOrganization.mockResolvedValue(org());
    const user = setupUser();
    render(
      <RunModelsSection
        org={org({ model_benchmarking: { show_likely_ranges: true } })}
      />,
    );

    await user.click(rangesSwitch());

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Likely ranges are now hidden",
      ),
    );
    expect(rangesSwitch()).toHaveAttribute("aria-checked", "false");
  });

  it("puts the switch back and says why when the save fails", async () => {
    updateOrganization.mockRejectedValue(new Error("boom"));
    const user = setupUser();
    render(<RunModelsSection org={org()} />);

    await user.click(rangesSwitch());

    await waitFor(() =>
      expect(rangesSwitch()).toHaveAttribute("aria-checked", "false"),
    );
    expect(screen.getByText(/boom|Failed to save/)).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("saves how the models run, and puts the choice back on failure", async () => {
    updateOrganization.mockRejectedValueOnce(new Error("boom"));
    updateOrganization.mockResolvedValueOnce(org());
    const user = setupUser();
    render(<RunModelsSection org={org()} />);

    await user.click(screen.getByLabelText("Sequential"));
    expect(updateOrganization).toHaveBeenCalledWith("org-1", {
      settings: { model_benchmarking: { run_models_in_parallel: false } },
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Parallel")).toBeChecked(),
    );

    await user.click(screen.getByLabelText("Sequential"));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Saved how the models run in a comparison",
      ),
    );
    expect(screen.getByLabelText("Sequential")).toBeChecked();
  });
});
