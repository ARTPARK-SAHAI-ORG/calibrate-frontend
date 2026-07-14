import React from "react";
import { render, screen } from "@/test-utils";
import { TtsItemPane } from "../TtsItemPane";

describe("TtsItemPane", () => {
  it("renders reference text and an audio player when present", () => {
    render(
      <TtsItemPane
        payload={{
          name: "Clip 1",
          text: "Hello world",
          audio_path: "https://example.com/a.wav",
        }}
      />,
    );

    // Name belongs in the surrounding dialog/job header, not here.
    expect(screen.queryByText("Clip 1")).not.toBeInTheDocument();
    expect(screen.getByText("Hello world")).toBeInTheDocument();
    expect(screen.getByText("Reference text")).toBeInTheDocument();
    expect(screen.getByText("Generated audio")).toBeInTheDocument();
    // LazyAudioPlayer renders a Play button until the user starts playback.
    expect(screen.getByLabelText("Play")).toBeInTheDocument();
  });

  it("shows an em-dash when text is missing or non-string", () => {
    render(<TtsItemPane payload={{ text: 5, audio_path: "https://x/a.wav" }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows a fallback message when no audio is provided", () => {
    render(<TtsItemPane payload={{ text: "Hi" }} />);
    expect(screen.getByText("No audio provided")).toBeInTheDocument();
    expect(screen.queryByLabelText("Play")).not.toBeInTheDocument();
  });
});
