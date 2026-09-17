import { render, screen, setupUser } from "@/test-utils";
import { RunModelsChoice } from "../RunModelsChoice";

it("shows both choices with the current one picked", () => {
  render(<RunModelsChoice value={true} onChange={jest.fn()} />);

  expect(screen.getByRole("radio", { name: "Parallel" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "Sequential" })).not.toBeChecked();
});

it("reports the choice the user makes", async () => {
  const user = setupUser();
  const onChange = jest.fn();
  const { rerender } = render(
    <RunModelsChoice value={true} onChange={onChange} />,
  );

  await user.click(screen.getByRole("radio", { name: "Sequential" }));
  expect(onChange).toHaveBeenCalledWith(false);

  onChange.mockClear();
  rerender(<RunModelsChoice value={false} onChange={onChange} />);
  await user.click(screen.getByRole("radio", { name: "Parallel" }));
  expect(onChange).toHaveBeenCalledWith(true);
});

it("uses the group name it is given, so two on one page do not clash", () => {
  render(<RunModelsChoice value={true} onChange={jest.fn()} name="mine" />);

  expect(screen.getByRole("radio", { name: "Parallel" })).toHaveAttribute(
    "name",
    "mine",
  );
});

it("cannot be changed while it is disabled", async () => {
  const user = setupUser();
  const onChange = jest.fn();
  render(<RunModelsChoice value={true} onChange={onChange} disabled />);

  const sequential = screen.getByRole("radio", { name: "Sequential" });
  expect(sequential).toBeDisabled();
  expect(screen.getByRole("radio", { name: "Parallel" })).toBeDisabled();
  await user.click(sequential);
  expect(onChange).not.toHaveBeenCalled();
});
