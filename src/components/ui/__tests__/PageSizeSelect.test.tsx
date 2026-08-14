import { render, screen, setupUser } from "@/test-utils";
import { PageSizeSelect } from "../PageSizeSelect";

describe("PageSizeSelect", () => {
  it("offers the four page sizes and shows the current one", () => {
    render(<PageSizeSelect value={25} onChange={jest.fn()} />);

    const select = screen.getByLabelText("Per page") as HTMLSelectElement;
    expect(
      Array.from(select.options).map((option) => option.value),
    ).toEqual(["10", "25", "50", "100"]);
    expect(select.value).toBe("25");
  });

  it("reports the chosen size as a number", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(<PageSizeSelect value={50} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText("Per page"), "100");
    expect(onChange).toHaveBeenCalledWith(100);
  });
});
