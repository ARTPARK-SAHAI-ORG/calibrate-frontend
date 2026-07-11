import React from "react";
import { render, screen, fireEvent } from "@/test-utils";
import { SimulationTranscriptDialog } from "../SimulationTranscriptDialog";
import type { SimulationResult } from "../SimulationResultsTable";

const baseSimulation: SimulationResult = {
  simulation_name: "sim-1",
  persona: { label: "Persona A", characteristics: "", gender: "", language: "" },
  scenario: { name: "Scenario A", description: "" },
  evaluation_results: [],
  transcript: [],
};

describe("SimulationTranscriptDialog", () => {
  it("renders the empty-transcript placeholder and calls onClose on backdrop click / close button", () => {
    const onClose = jest.fn();
    const { container } = render(
      <SimulationTranscriptDialog simulation={baseSimulation} runType="text" onClose={onClose} />,
    );
    expect(screen.getByText("No transcript available yet")).toBeInTheDocument();
    expect(screen.getByText("Transcript")).toBeInTheDocument();

    const backdrop = container.querySelector(".absolute.inset-0.bg-black\\/50")!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("renders the full conversation audio player when conversation_wav_url is present and fires onAudioError", () => {
    const onAudioError = jest.fn();
    const sim: SimulationResult = { ...baseSimulation, conversation_wav_url: "https://example.com/full.wav" };
    const { container } = render(
      <SimulationTranscriptDialog simulation={sim} runType="voice" onClose={jest.fn()} onAudioError={onAudioError} />,
    );
    expect(screen.getByText("Hear the full conversation")).toBeInTheDocument();
    const audioEl = container.querySelector("audio")!;
    fireEvent.error(audioEl);
    expect(onAudioError).toHaveBeenCalled();
  });

  it("does not render the conversation audio player when conversation_wav_url is absent", () => {
    render(<SimulationTranscriptDialog simulation={baseSimulation} runType="text" onClose={jest.fn()} />);
    expect(screen.queryByText("Hear the full conversation")).not.toBeInTheDocument();
  });

  it("filters out end_reason entries and renders user/assistant text bubbles", () => {
    const sim: SimulationResult = {
      ...baseSimulation,
      transcript: [
        { role: "user", content: "Hi there" },
        { role: "assistant", content: "Hello, how can I help?" },
        { role: "end_reason", content: "completed" },
      ],
    };
    render(<SimulationTranscriptDialog simulation={sim} runType="text" onClose={jest.fn()} />);
    expect(screen.getByText("Hi there")).toBeInTheDocument();
    expect(screen.getByText("Hello, how can I help?")).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
  });

  it("shows the max-turns banner when the last transcript entry is an end_reason of max_turns", () => {
    const sim: SimulationResult = {
      ...baseSimulation,
      transcript: [
        { role: "user", content: "Hi" },
        { role: "end_reason", content: "max_turns" },
      ],
    };
    render(<SimulationTranscriptDialog simulation={sim} runType="text" onClose={jest.fn()} />);
    expect(screen.getByText("Maximum number of assistant turns reached")).toBeInTheDocument();
  });

  it("does not show max-turns banner for other end_reason values", () => {
    const sim: SimulationResult = {
      ...baseSimulation,
      transcript: [
        { role: "user", content: "Hi" },
        { role: "end_reason", content: "user_ended" },
      ],
    };
    render(<SimulationTranscriptDialog simulation={sim} runType="text" onClose={jest.fn()} />);
    expect(screen.queryByText("Maximum number of assistant turns reached")).not.toBeInTheDocument();
  });

  it("shows the aborted banner when simulation.aborted is true", () => {
    const sim: SimulationResult = { ...baseSimulation, aborted: true, transcript: [{ role: "user", content: "hi" }] };
    render(<SimulationTranscriptDialog simulation={sim} runType="text" onClose={jest.fn()} />);
    expect(screen.getByText("Simulation aborted by user")).toBeInTheDocument();
  });

  it("renders an assistant tool-call block with parsed args (excluding 'headers') and multi-line formatting", () => {
    const sim: SimulationResult = {
      ...baseSimulation,
      transcript: [
        {
          role: "assistant",
          tool_calls: [
            {
              function: {
                name: "lookup_order",
                arguments: JSON.stringify({
                  order_id: "123",
                  headers: { auth: "secret" },
                  details: { nested: "line1\nline2" },
                  count: 5,
                  flag: null,
                  extra: undefined,
                }),
              },
            },
          ],
        },
      ],
    };
    render(<SimulationTranscriptDialog simulation={sim} runType="text" onClose={jest.fn()} />);
    expect(screen.getByText("Agent Tool Call")).toBeInTheDocument();
    expect(screen.getByText("lookup_order")).toBeInTheDocument();
    expect(screen.getByText("order_id")).toBeInTheDocument();
    expect(screen.getByText("123")).toBeInTheDocument();
    expect(screen.queryByText("headers")).not.toBeInTheDocument();
    expect(screen.getByText("count")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("flag")).toBeInTheDocument();
    expect(screen.getByText("null")).toBeInTheDocument();
  });

  it("handles unparseable tool_call arguments gracefully (empty params, no crash)", () => {
    const sim: SimulationResult = {
      ...baseSimulation,
      transcript: [
        {
          role: "assistant",
          tool_calls: [{ function: { name: "broken_tool", arguments: "not json" } }],
        },
      ],
    };
    render(<SimulationTranscriptDialog simulation={sim} runType="text" onClose={jest.fn()} />);
    expect(screen.getByText("broken_tool")).toBeInTheDocument();
  });

  it("does not render assistant content bubble when tool_calls are present", () => {
    const sim: SimulationResult = {
      ...baseSimulation,
      transcript: [
        {
          role: "assistant",
          content: "should not show",
          tool_calls: [{ function: { name: "t", arguments: "{}" } }],
        },
      ],
    };
    render(<SimulationTranscriptDialog simulation={sim} runType="text" onClose={jest.fn()} />);
    expect(screen.queryByText("should not show")).not.toBeInTheDocument();
  });

  it("filters out 'tool' entries that are not webhook_response type", () => {
    const sim: SimulationResult = {
      ...baseSimulation,
      transcript: [
        { role: "tool", content: JSON.stringify({ type: "other" }) },
        { role: "user", content: "hi" },
      ],
    };
    render(<SimulationTranscriptDialog simulation={sim} runType="text" onClose={jest.fn()} />);
    expect(screen.getByText("hi")).toBeInTheDocument();
  });

  it("filters out 'tool' entries with unparseable content", () => {
    const sim: SimulationResult = {
      ...baseSimulation,
      transcript: [
        { role: "tool", content: "not json" },
        { role: "user", content: "hi" },
      ],
    };
    render(<SimulationTranscriptDialog simulation={sim} runType="text" onClose={jest.fn()} />);
    expect(screen.getByText("hi")).toBeInTheDocument();
  });

  it("renders webhook_response tool entry as success block with formatted JSON", () => {
    const sim: SimulationResult = {
      ...baseSimulation,
      transcript: [
        {
          role: "tool",
          content: JSON.stringify({
            type: "webhook_response",
            status: "success",
            response: { result: "ok", value: 42 },
          }),
        },
      ],
    };
    render(<SimulationTranscriptDialog simulation={sim} runType="text" onClose={jest.fn()} />);
    expect(screen.getByText("Agent Tool Response")).toBeInTheDocument();
    expect(screen.getByText(/"result": "ok"/)).toBeInTheDocument();
  });

  it("renders webhook_response tool entry as error block when status is error", () => {
    const sim: SimulationResult = {
      ...baseSimulation,
      transcript: [
        {
          role: "tool",
          content: JSON.stringify({
            type: "webhook_response",
            status: "error",
            response: { message: "failed" },
          }),
        },
      ],
    };
    render(<SimulationTranscriptDialog simulation={sim} runType="text" onClose={jest.fn()} />);
    expect(screen.getByText("Tool Response Error")).toBeInTheDocument();
  });

  it("renders nothing for a webhook_response tool entry whose response is missing or non-object", () => {
    const sim: SimulationResult = {
      ...baseSimulation,
      transcript: [
        { role: "tool", content: JSON.stringify({ type: "webhook_response", response: "just a string" }) },
        { role: "user", content: "hi" },
      ],
    };
    render(<SimulationTranscriptDialog simulation={sim} runType="text" onClose={jest.fn()} />);
    expect(screen.queryByText("Agent Tool Response")).not.toBeInTheDocument();
    expect(screen.getByText("hi")).toBeInTheDocument();
  });

  it("wires per-entry voice audio using the audio layout helpers when runType='voice'", () => {
    const sim: SimulationResult = {
      ...baseSimulation,
      audio_urls: ["1_user.wav", "1_bot.wav"],
      transcript: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
      ],
    };
    const { container } = render(
      <SimulationTranscriptDialog simulation={sim} runType="voice" onClose={jest.fn()} />,
    );
    const audioEls = container.querySelectorAll("audio");
    expect(audioEls.length).toBe(2);
    expect(audioEls[0].getAttribute("src")).toContain("user.wav");
    expect(audioEls[1].getAttribute("src")).toContain("bot.wav");
  });

  it("does not attach per-entry audio when runType='text' even if audio_urls are present", () => {
    const sim: SimulationResult = {
      ...baseSimulation,
      audio_urls: ["1_user.wav"],
      transcript: [{ role: "user", content: "Hi" }],
    };
    const { container } = render(
      <SimulationTranscriptDialog simulation={sim} runType="text" onClose={jest.fn()} />,
    );
    expect(container.querySelectorAll("audio").length).toBe(0);
  });

  it("treats a null/undefined transcript as an empty list", () => {
    const sim: SimulationResult = { ...baseSimulation, transcript: null };
    render(<SimulationTranscriptDialog simulation={sim} runType="text" onClose={jest.fn()} />);
    expect(screen.getByText("No transcript available yet")).toBeInTheDocument();
  });

  it("filters out a 'tool' entry with empty/undefined content", () => {
    const sim: SimulationResult = {
      ...baseSimulation,
      transcript: [{ role: "tool" }, { role: "user", content: "hi" }],
    };
    render(<SimulationTranscriptDialog simulation={sim} runType="text" onClose={jest.fn()} />);
    expect(screen.getByText("hi")).toBeInTheDocument();
  });

  it("does not render a user bubble when content is empty", () => {
    const sim: SimulationResult = {
      ...baseSimulation,
      transcript: [{ role: "user", content: "" }],
    };
    const { container } = render(
      <SimulationTranscriptDialog simulation={sim} runType="text" onClose={jest.fn()} />,
    );
    // Only the header svg + close icon should exist; no bubble text content.
    expect(container.querySelectorAll(".bg-muted.border.border-border.rounded-xl").length).toBe(0);
  });
});
