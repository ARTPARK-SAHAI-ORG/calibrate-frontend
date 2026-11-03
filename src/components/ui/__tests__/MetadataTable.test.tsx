import { render, screen } from "@/test-utils";
import { MetadataTable } from "../MetadataTable";

describe("MetadataTable", () => {
  it.each([undefined, null, []])("renders nothing for %p", (entries) => {
    const { container } = render(<MetadataTable entries={entries} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the heading and one row per entry", () => {
    render(
      <MetadataTable
        entries={[
          { key: "region", value: "south" },
          { key: "channel", value: "whatsapp" },
        ]}
      />
    );
    expect(screen.getByRole("heading", { name: "Metadata" })).toBeInTheDocument();
    expect(screen.getByText("Field")).toBeInTheDocument();
    expect(screen.getByText("Value")).toBeInTheDocument();
    expect(screen.getByText("region")).toBeInTheDocument();
    expect(screen.getByText("south")).toBeInTheDocument();
    expect(screen.getByText("channel")).toBeInTheDocument();
    expect(screen.getByText("whatsapp")).toBeInTheDocument();
  });

  it("sizes the field column to its names and breaks inside a word only when it must", () => {
    render(<MetadataTable entries={[{ key: "region", value: "south" }]} />);
    const key = screen.getByText("region");
    const value = screen.getByText("south");
    expect(key).toHaveClass("wrap-anywhere");
    expect(value).toHaveClass("wrap-anywhere");
    expect(value).not.toHaveClass("break-all");
    expect(value.parentElement).toHaveClass(
      "grid-cols-[fit-content(50%)_minmax(0,1fr)]",
    );
  });
});
