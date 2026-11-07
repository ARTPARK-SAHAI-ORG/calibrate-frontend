import React from "react";
import { render, screen, setupUser, within } from "@/test-utils";
import { WorkspacesTable, sortWorkspaces } from "../WorkspacesTable";
import type { AnalyticsWorkspaceRow } from "@/lib/analyticsApi";

function row(name: string, over: Partial<AnalyticsWorkspaceRow> = {}): AnalyticsWorkspaceRow {
  return {
    org_uuid: `org-${name}`,
    name,
    is_personal: false,
    members: 1,
    last_active_at: null,
    evaluations: 0,
    cost: null,
    ...over,
  } as AnalyticsWorkspaceRow;
}

const tableCell = (name: string) => within(screen.getByRole("table")).getByText(name);
const card = (name: string) =>
  screen.getAllByText(name).find((el) => !el.closest("table"))!.parentElement!;

describe("WorkspacesTable owner", () => {
  it("shows the owner's full name and email on hover, and on the phone card", async () => {
    const user = setupUser();
    render(
      <WorkspacesTable
        rows={[row("Alpha", { owner: { email: "a@x.org", first_name: "Asha", last_name: "Rao" } })]}
      />,
    );
    expect(screen.queryByText("a@x.org")).not.toBeInTheDocument();
    expect(within(card("Alpha")).getByText("Asha Rao · a@x.org")).toBeInTheDocument();

    await user.hover(tableCell("Alpha"));
    expect(await screen.findByText("Asha Rao")).toBeInTheDocument();
    expect(screen.getByText("a@x.org")).toBeInTheDocument();

    const writeText = jest.spyOn(navigator.clipboard, "writeText");
    await user.click(screen.getByRole("button", { name: "Copy name" }));
    expect(writeText).toHaveBeenLastCalledWith("Asha Rao");
    await user.click(screen.getByRole("button", { name: "Copy email" }));
    expect(writeText).toHaveBeenLastCalledWith("a@x.org");
    // Copying keeps the owner box open, so the other one can be copied too.
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.getByText("Asha Rao")).toBeInTheDocument();
  });

  it("shows only the email when the names are empty", async () => {
    const user = setupUser();
    render(
      <WorkspacesTable
        rows={[row("Beta", { owner: { email: "b@x.org", first_name: " ", last_name: "" } })]}
      />,
    );
    expect(within(card("Beta")).getByText("b@x.org")).toBeInTheDocument();

    await user.hover(tableCell("Beta"));
    expect(await screen.findAllByText("b@x.org")).toHaveLength(2);
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it.each([
    ["null", { owner: null }],
    ["missing", {}],
  ])("shows no owner when it is %s", async (_label, over) => {
    const user = setupUser();
    render(<WorkspacesTable rows={[row("Gamma", over)]} />);
    expect(card("Gamma").querySelectorAll("p")).toHaveLength(1);

    await user.hover(tableCell("Gamma"));
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });
});

describe("WorkspacesTable created", () => {
  it("shows when each workspace was created as the last column and sorts by it", async () => {
    const user = setupUser();
    render(
      <WorkspacesTable
        rows={[
          row("Old", { created_at: "2026-01-02T08:00:00Z" }),
          row("New", { created_at: "2026-10-05T08:00:00Z" }),
          row("Unknown"),
        ]}
      />,
    );
    const headers = within(screen.getByRole("table")).getAllByRole("columnheader");
    expect(headers[headers.length - 1]).toHaveTextContent("Created");

    await user.click(within(headers[headers.length - 1]).getByRole("button"));
    const names = within(screen.getByRole("table"))
      .getAllByRole("row")
      .slice(1)
      .map((r) => r.querySelector("td")!.textContent);
    expect(names).toEqual(["New", "Old", "Unknown"]);
  });
});

describe("sortWorkspaces", () => {
  it("reads a missing cost as zero", () => {
    const rows = [row("Free", { cost: null }), row("Paid", { cost: 2 }), row("None", { cost: null })];
    expect(sortWorkspaces(rows, "cost", false).map((r) => r.name)).toEqual(["Free", "None", "Paid"]);
  });
});
