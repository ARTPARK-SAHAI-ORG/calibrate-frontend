import { render, screen, setupUser } from "@/test-utils";
import { NestedContainer } from "../NestedContainer";

describe("NestedContainer", () => {
  it("renders children", () => {
    render(
      <NestedContainer>
        <div>child content</div>
      </NestedContainer>
    );
    expect(screen.getByText("child content")).toBeInTheDocument();
  });

  it("shows the add button by default with the default label when onAddProperty is provided", () => {
    const onAddProperty = jest.fn();
    render(
      <NestedContainer onAddProperty={onAddProperty}>
        <div>content</div>
      </NestedContainer>
    );
    expect(screen.getByRole("button", { name: "Add property" })).toBeInTheDocument();
  });

  it("uses a custom addButtonText", () => {
    const onAddProperty = jest.fn();
    render(
      <NestedContainer onAddProperty={onAddProperty} addButtonText="Add item">
        <div>content</div>
      </NestedContainer>
    );
    expect(screen.getByRole("button", { name: "Add item" })).toBeInTheDocument();
  });

  it("does not render the add button when showAddButton is false", () => {
    const onAddProperty = jest.fn();
    render(
      <NestedContainer onAddProperty={onAddProperty} showAddButton={false}>
        <div>content</div>
      </NestedContainer>
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("does not render the add button when onAddProperty is not provided", () => {
    render(
      <NestedContainer>
        <div>content</div>
      </NestedContainer>
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("calls onAddProperty when the add button is clicked", async () => {
    const user = setupUser();
    const onAddProperty = jest.fn();
    render(
      <NestedContainer onAddProperty={onAddProperty}>
        <div>content</div>
      </NestedContainer>
    );
    await user.click(screen.getByRole("button", { name: "Add property" }));
    expect(onAddProperty).toHaveBeenCalledTimes(1);
  });

  it("applies the validation error border class when showValidationError is true", () => {
    const onAddProperty = jest.fn();
    render(
      <NestedContainer onAddProperty={onAddProperty} showValidationError>
        <div>content</div>
      </NestedContainer>
    );
    expect(screen.getByRole("button", { name: "Add property" })).toHaveClass(
      "border-red-500"
    );
  });

  it("uses the default border class when showValidationError is false", () => {
    const onAddProperty = jest.fn();
    render(
      <NestedContainer onAddProperty={onAddProperty}>
        <div>content</div>
      </NestedContainer>
    );
    expect(screen.getByRole("button", { name: "Add property" })).toHaveClass(
      "border-border"
    );
  });
});
