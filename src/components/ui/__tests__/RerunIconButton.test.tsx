import { render, screen, setupUser } from "@/test-utils";
import { RerunIconButton } from "../RerunIconButton";

describe("RerunIconButton", () => {
  it("renders an icon-only button labelled by its tooltip and fires onClick", async () => {
    const onClick = jest.fn();
    const user = setupUser();
    render(<RerunIconButton onClick={onClick} />);

    // Icon-only: the accessible name comes from aria-label, not visible text.
    const button = screen.getByRole("button", { name: "Rerun" });
    expect(button).toHaveTextContent("");

    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("uses a custom tooltip as the accessible label", () => {
    render(<RerunIconButton onClick={jest.fn()} tooltip="Run again" />);
    expect(
      screen.getByRole("button", { name: "Run again" }),
    ).toBeInTheDocument();
  });
});
