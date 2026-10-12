import { render, screen } from "@/test-utils";
import { hasItemDetails, ItemDetailsBlock, itemDescriptionOf } from "../ItemDetailsBlock";

describe("ItemDetailsBlock", () => {
  it("draws the trimmed description and the metadata", () => {
    render(
      <ItemDetailsBlock
        payload={{ description: "  Mother asks about a vaccine  " }}
        metadata={[{ key: "district", value: "Pune" }]}
      />,
    );
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Mother asks about a vaccine")).toBeInTheDocument();
    expect(screen.getByText("district")).toBeInTheDocument();
  });

  it("draws nothing for an item with neither", () => {
    const { container } = render(
      <ItemDetailsBlock payload={{ description: "   " }} metadata={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("reads the description only from an object payload", () => {
    expect(itemDescriptionOf(null)).toBe("");
    expect(itemDescriptionOf({ description: 3 })).toBe("");
    expect(hasItemDetails({}, [{ key: "a", value: "b" }])).toBe(true);
    expect(hasItemDetails({ description: " " }, null)).toBe(false);
  });
});
