import React from "react";
import { render, screen } from "@/test-utils";
import { setupUser } from "@/test-utils";
import { ProviderSidebar, type ProviderSidebarItem } from "../ProviderSidebar";

const items: ProviderSidebarItem[] = [
  { key: "pending", label: "Pending Provider", success: null },
  { key: "ok", label: "Successful Provider", success: true },
  { key: "bad", label: "Failed Provider", success: false },
];

describe("ProviderSidebar", () => {
  it("renders all items with their labels", () => {
    render(<ProviderSidebar items={items} activeKey={null} onSelect={jest.fn()} />);
    expect(screen.getByText("Pending Provider")).toBeInTheDocument();
    expect(screen.getByText("Successful Provider")).toBeInTheDocument();
    expect(screen.getByText("Failed Provider")).toBeInTheDocument();
  });

  it("applies the selected styling to the active item", () => {
    render(<ProviderSidebar items={items} activeKey="ok" onSelect={jest.fn()} />);
    const activeLabel = screen.getByText("Successful Provider");
    const row = activeLabel.closest("div.flex.items-center");
    expect(row?.className).toContain("bg-muted");
  });

  it("calls onSelect with the item key when clicked", async () => {
    const user = setupUser();
    const onSelect = jest.fn();
    render(<ProviderSidebar items={items} activeKey={null} onSelect={onSelect} />);
    await user.click(screen.getByText("Failed Provider"));
    expect(onSelect).toHaveBeenCalledWith("bad");
  });

  it("renders nothing extra when items is empty", () => {
    render(<ProviderSidebar items={[]} activeKey={null} onSelect={jest.fn()} />);
    expect(screen.queryByText("Pending Provider")).not.toBeInTheDocument();
  });
});
