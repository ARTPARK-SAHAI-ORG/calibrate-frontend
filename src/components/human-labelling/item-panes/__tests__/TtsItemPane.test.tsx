import React from "react";
import { render, screen } from "@/test-utils";
import { TtsItemPane } from "../TtsItemPane";

describe("TtsItemPane", () => {
  it("renders name, text, and an audio player when all present", () => {
    render(
      <TtsItemPane
        payload={{
          name: "Clip 1",
          text: "Hello world",
          audio_path: "https://example.com/a.wav",
        }}
      />
    );

    expect(screen.getByText("Clip 1")).toBeInTheDocument();
    expect(screen.getByText("Hello world")).toBeInTheDocument();
    expect(screen.getByText("Text")).toBeInTheDocument();
    expect(screen.getByText("Generated audio")).toBeInTheDocument();
    // LazyAudioPlayer renders a Play button until the user starts playback.
    expect(screen.getByLabelText("Play")).toBeInTheDocument();
  });

  it("omits the name paragraph when name is not a string", () => {
    const { container } = render(
      <TtsItemPane
        payload={{ name: 42, text: "Hi", audio_path: "https://x/a.wav" }}
      />
    );
    expect(container.querySelector("p.font-semibold")).not.toBeInTheDocument();
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
