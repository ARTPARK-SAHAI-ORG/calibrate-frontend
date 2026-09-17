import { render, screen, setupUser } from "@/test-utils";
import { Switch } from "../Switch";

describe("Switch", () => {
  it("reads as off, and asks to be turned on", async () => {
    const onChange = jest.fn();
    const user = setupUser();
    render(<Switch checked={false} onChange={onChange} label="Invite link" />);

    const control = screen.getByRole("switch", { name: "Invite link" });
    expect(control).toHaveAttribute("aria-checked", "false");

    await user.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("reads as on, and asks to be turned off", async () => {
    const onChange = jest.fn();
    const user = setupUser();
    render(<Switch checked onChange={onChange} label="Invite link" />);

    const control = screen.getByRole("switch", { name: "Invite link" });
    expect(control).toHaveAttribute("aria-checked", "true");

    await user.click(control);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("does nothing while it is turned off to clicks", async () => {
    const onChange = jest.fn();
    const user = setupUser();
    render(
      <Switch checked={false} onChange={onChange} disabled label="Invite link" />,
    );

    await user.click(screen.getByRole("switch", { name: "Invite link" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
