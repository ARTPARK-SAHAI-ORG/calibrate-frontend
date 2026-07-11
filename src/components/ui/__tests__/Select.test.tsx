import { render, screen, setupUser } from "@/test-utils";
import { Select } from "../Select";

describe("Select", () => {
  it("renders options and forwards native select props", () => {
    render(
      <Select aria-label="Fruit" defaultValue="apple">
        <option value="apple">Apple</option>
        <option value="banana">Banana</option>
      </Select>
    );
    const select = screen.getByRole("combobox", { name: "Fruit" });
    expect(select).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Apple" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Banana" })).toBeInTheDocument();
  });

  it("merges custom className with the base styling", () => {
    render(
      <Select aria-label="Fruit" className="custom-class">
        <option value="apple">Apple</option>
      </Select>
    );
    const select = screen.getByRole("combobox");
    expect(select).toHaveClass("custom-class");
    expect(select).toHaveClass("appearance-none");
  });

  it("applies wrapperClassName to the wrapping div", () => {
    const { container } = render(
      <Select aria-label="Fruit" wrapperClassName="wrapper-extra">
        <option value="apple">Apple</option>
      </Select>
    );
    const wrapper = container.querySelector("div");
    expect(wrapper).toHaveClass("wrapper-extra");
    expect(wrapper).toHaveClass("relative");
  });

  it("calls onChange when a new option is selected", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(
      <Select aria-label="Fruit" onChange={onChange} defaultValue="apple">
        <option value="apple">Apple</option>
        <option value="banana">Banana</option>
      </Select>
    );
    await user.selectOptions(screen.getByRole("combobox"), "banana");
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByRole("combobox")).toHaveValue("banana");
  });

  it("supports the disabled prop", () => {
    render(
      <Select aria-label="Fruit" disabled>
        <option value="apple">Apple</option>
      </Select>
    );
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
