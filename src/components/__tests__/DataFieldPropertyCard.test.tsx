import { render, screen } from "@/test-utils";
import { DataFieldPropertyCard } from "../DataFieldPropertyCard";
import type { Parameter } from "../ParameterCard";

jest.mock("../ParameterCard", () => ({
  __esModule: true,
  ParameterCard: (props: any) => (
    <div data-testid="parameter-card">{JSON.stringify(props)}</div>
  ),
}));

const property: Parameter = {
  id: "1",
  name: "field",
  type: "string",
} as Parameter;

describe("DataFieldPropertyCard", () => {
  it("forwards props to ParameterCard with showRequired=false and defaults applied", () => {
    const onUpdate = jest.fn();
    const onRemove = jest.fn();
    const onAddProperty = jest.fn();
    const onSetItems = jest.fn();

    render(
      <DataFieldPropertyCard
        property={property}
        path={["a", "b"]}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onAddProperty={onAddProperty}
        onSetItems={onSetItems}
      />,
    );

    const rendered = screen.getByTestId("parameter-card");
    const passedProps = JSON.parse(rendered.textContent || "{}");
    expect(passedProps.param).toEqual(property);
    expect(passedProps.path).toEqual(["a", "b"]);
    expect(passedProps.validationAttempted).toBe(false);
    expect(passedProps.isArrayItem).toBe(false);
    expect(passedProps.showRequired).toBe(false);
  });

  it("forwards explicit validationAttempted/isArrayItem overrides", () => {
    render(
      <DataFieldPropertyCard
        property={property}
        path={[]}
        onUpdate={jest.fn()}
        onRemove={jest.fn()}
        onAddProperty={jest.fn()}
        onSetItems={jest.fn()}
        validationAttempted
        isArrayItem
      />,
    );

    const rendered = screen.getByTestId("parameter-card");
    const passedProps = JSON.parse(rendered.textContent || "{}");
    expect(passedProps.validationAttempted).toBe(true);
    expect(passedProps.isArrayItem).toBe(true);
  });
});
