import React from "react";
import { render, screen } from "@/test-utils";
import { SttItemPane } from "../SttItemPane";

describe("SttItemPane", () => {
  it("renders reference and predicted transcripts when present", () => {
    render(
      <SttItemPane
        payload={{
          name: "Sample 1",
          reference_transcript: "Hello world",
          predicted_transcript: "Hello word",
        }}
      />,
    );

    // Name belongs in the surrounding dialog/job header, not here.
    expect(screen.queryByText("Sample 1")).not.toBeInTheDocument();
    expect(screen.getByText("Hello world")).toBeInTheDocument();
    expect(screen.getByText("Hello word")).toBeInTheDocument();
    expect(screen.getByText("Reference transcript")).toBeInTheDocument();
    expect(screen.getByText("Predicted transcript")).toBeInTheDocument();
  });

  it("shows em-dash placeholders when reference/predicted are missing or non-string", () => {
    render(
      <SttItemPane
        payload={{ reference_transcript: 5, predicted_transcript: null }}
      />,
    );
    const dashes = screen.getAllByText("—");
    expect(dashes).toHaveLength(2);
  });

  it("shows em-dash placeholders for empty-string transcripts", () => {
    render(
      <SttItemPane
        payload={{ reference_transcript: "", predicted_transcript: "" }}
      />,
    );
    const dashes = screen.getAllByText("—");
    expect(dashes).toHaveLength(2);
  });
});
