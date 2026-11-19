import { render, screen, setupUser } from "@/test-utils";
import { JobSettingsMenu } from "../JobSettingsMenu";

describe("JobSettingsMenu", () => {
  it("is closed until the Settings button is pressed", async () => {
    const user = setupUser();
    render(<JobSettingsMenu density="comfortable" onDensityChange={jest.fn()} />);
    const button = screen.getByRole("button", { name: /Settings/ });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByText("Density")).toBeInTheDocument();
  });

  it("shows which density is on", async () => {
    const user = setupUser();
    render(<JobSettingsMenu density="compact" onDensityChange={jest.fn()} />);
    await user.click(screen.getByRole("button", { name: /Settings/ }));
    expect(screen.getByRole("radio", { name: /Compact/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Comfortable/ })).not.toBeChecked();
  });

  it("reports the density that was picked", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(<JobSettingsMenu density="comfortable" onDensityChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /Settings/ }));
    await user.click(screen.getByRole("radio", { name: /Compact/ }));
    expect(onChange).toHaveBeenCalledWith("compact");
    await user.click(screen.getByRole("radio", { name: /Comfortable/ }));
    expect(onChange).toHaveBeenLastCalledWith("comfortable");
  });

  it("closes on Escape, on a click outside, and when the button is pressed again", async () => {
    const user = setupUser();
    render(
      <div>
        <span>outside</span>
        <JobSettingsMenu density="comfortable" onDensityChange={jest.fn()} />
      </div>,
    );
    const button = screen.getByRole("button", { name: /Settings/ });

    await user.click(button);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(button);
    await user.click(screen.getByText("outside"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(button);
    await user.click(button);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stays open while a density is being picked", async () => {
    const user = setupUser();
    render(<JobSettingsMenu density="comfortable" onDensityChange={jest.fn()} />);
    await user.click(screen.getByRole("button", { name: /Settings/ }));
    await user.click(screen.getByRole("radio", { name: /Compact/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
