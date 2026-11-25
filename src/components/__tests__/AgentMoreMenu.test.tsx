import { render, screen, setupUser } from "@/test-utils";
import { AgentMoreMenu } from "../AgentMoreMenu";

describe("AgentMoreMenu", () => {
  it("opens on the dots and duplicates from the menu, closing it", async () => {
    const user = setupUser();
    const onDuplicate = jest.fn();
    render(<AgentMoreMenu onDuplicate={onDuplicate} />);
    expect(screen.queryByRole("menu")).toBeNull();

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Duplicate agent" }));

    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on Escape without duplicating", async () => {
    const user = setupUser();
    const onDuplicate = jest.fn();
    render(<AgentMoreMenu onDuplicate={onDuplicate} />);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onDuplicate).not.toHaveBeenCalled();
  });
});

it("shows a plain Duplicate button on a wide screen and the menu below that", async () => {
  const user = setupUser();
  const onDuplicate = jest.fn();
  render(<AgentMoreMenu onDuplicate={onDuplicate} />);

  const plain = screen.getByRole("button", { name: "Duplicate" });
  expect(plain).toHaveClass("hidden", "xl:flex");
  expect(
    screen.getByRole("button", { name: "More actions" }).parentElement
      ?.parentElement,
  ).toHaveClass("xl:hidden");

  await user.click(plain);
  expect(onDuplicate).toHaveBeenCalledTimes(1);
});
