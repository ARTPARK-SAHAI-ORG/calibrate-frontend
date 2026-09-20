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

  it("keeps the last step clickable when it still has a page to open", () => {
    // Error pages trim the trail down to the section name, which has to stay
    // clickable or there is no way back to the list.
    render(<Breadcrumbs items={[{ label: "Agents", href: "/agents" }]} />);

    expect(screen.getByRole("link", { name: "Agents" })).toHaveAttribute(
      "href",
      "/agents",
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

  it("puts a step's own hover text in the app's box, not the browser's", async () => {
    const user = setupUser();
    render(
      <Breadcrumbs
        items={[
          { label: "Agents", href: "/agents" },
          {
            label: "Support bot",
            onClick: jest.fn(),
            title: "Click to edit name",
          },
        ]}
      />,
    );

    const step = screen.getByRole("button", { name: "Support bot" });
    expect(step).not.toHaveAttribute("title");
    await user.hover(step);
    expect(await screen.findByText("Click to edit name")).toBeInTheDocument();
  });

  it("shows no hover text on a step that was given none", async () => {
    const user = setupUser();
    const { container } = render(
      <Breadcrumbs
        items={[
          { label: "Agents", href: "/agents" },
          { label: "Support bot", onClick: jest.fn() },
        ]}
      />,
    );

    await user.hover(screen.getByRole("button", { name: "Support bot" }));
    expect(container.textContent).toBe("Agents/Support bot");
  });
});
