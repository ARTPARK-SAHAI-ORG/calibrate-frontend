import { render, screen, setupUser } from "@/test-utils";
import { Breadcrumbs } from "../Breadcrumbs";

describe("Breadcrumbs", () => {
  it("links every step except the one you are on", () => {
    render(
      <Breadcrumbs
        items={[
          { label: "Agents", href: "/agents" },
          { label: "Support bot" },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "Agents" })).toHaveAttribute(
      "href",
      "/agents",
    );
    expect(screen.queryByRole("link", { name: "Support bot" })).toBeNull();
    expect(screen.getByText("Support bot")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows a separator between steps", () => {
    const { container } = render(
      <Breadcrumbs
        items={[
          { label: "Human alignment", href: "/human-alignment" },
          { label: "Task one", href: "/human-alignment/tasks/1" },
          { label: "Evaluation run" },
        ]}
      />,
    );

    expect(container.textContent).toBe(
      "Human alignment/Task one/Evaluation run",
    );
  });

  it("runs the action on a step that has one", async () => {
    const onClick = jest.fn();
    const user = setupUser();
    render(
      <Breadcrumbs
        items={[
          { label: "Agents", href: "/agents" },
          { label: "Support bot", onClick, title: "Click to edit name" },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Support bot" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
