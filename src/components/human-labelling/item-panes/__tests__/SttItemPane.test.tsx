import React from "react";
import { render, screen } from "@/test-utils";
import { SttItemPane } from "../SttItemPane";

describe("SttItemPane", () => {
  it("renders name, reference transcript, and predicted transcript when all present", () => {
    render(
      <SttItemPane
        payload={{
          name: "Sample 1",
          reference_transcript: "Hello world",
          predicted_transcript: "Hello word",
        }}
      />
    );

    expect(screen.getByText("Sample 1")).toBeInTheDocument();
    expect(screen.getByText("Hello world")).toBeInTheDocument();
    expect(screen.getByText("Hello word")).toBeInTheDocument();
    expect(screen.getByText("Reference transcript")).toBeInTheDocument();
    expect(screen.getByText("Predicted transcript")).toBeInTheDocument();
  });

  it("omits the name paragraph when name is not a string", () => {
    const { container } = render(
      <SttItemPane
        payload={{
          name: 42,
          reference_transcript: "Ref",
          predicted_transcript: "Pred",
        }}
      />
    );
    expect(container.querySelector("p.font-semibold")).not.toBeInTheDocument();
  });

  it("omits the name paragraph when name is missing", () => {
    render(
      <SttItemPane
        payload={{ reference_transcript: "Ref", predicted_transcript: "Pred" }}
      />
    );
    expect(screen.queryByText(/^Sample/)).not.toBeInTheDocument();
  });

  it("shows em-dash placeholders when reference/predicted are missing or non-string", () => {
    render(<SttItemPane payload={{ reference_transcript: 5, predicted_transcript: null }} />);
    const dashes = screen.getAllByText("—");
    expect(dashes).toHaveLength(2);
  });

  it("shows em-dash placeholders for empty-string transcripts", () => {
    render(
      <SttItemPane
        payload={{ reference_transcript: "", predicted_transcript: "" }}
      />
    );
    const dashes = screen.getAllByText("—");
    expect(dashes).toHaveLength(2);
  });
});
