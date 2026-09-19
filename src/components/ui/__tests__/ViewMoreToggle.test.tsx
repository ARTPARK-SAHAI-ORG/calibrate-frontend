import { render, screen, setupUser } from "@/test-utils";
import { ViewMoreToggle } from "../ViewMoreToggle";

it("offers View more while closed and View less while open", async () => {
  const user = setupUser();
  const onClick = jest.fn();
  const { rerender } = render(
    <ViewMoreToggle expanded={false} onClick={onClick} />,
  );

  const closed = screen.getByRole("button", { name: "View more" });
  expect(closed).toHaveAttribute("aria-expanded", "false");
  await user.click(closed);
  expect(onClick).toHaveBeenCalledTimes(1);

  rerender(<ViewMoreToggle expanded onClick={onClick} />);
  expect(screen.getByRole("button", { name: "View less" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});


it("keeps extra classes the parent needs for overlay or inline placement", () => {
  render(
    <ViewMoreToggle
      expanded={false}
      onClick={() => {}}
      className="shadow-sm"
    />,
  );
  expect(screen.getByRole("button", { name: "View more" })).toHaveClass(
    "shadow-sm",
  );
});
