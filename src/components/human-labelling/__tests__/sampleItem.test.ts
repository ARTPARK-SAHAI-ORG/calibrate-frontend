import { sampleItem } from "../sampleItem";

describe("sampleItem", () => {
  it("numbers the name and fills the fields each task type needs", () => {
    expect(sampleItem("llm", 3)).toEqual({
      name: "Example item 3",
      payload: {
        chat_history: [{ role: "user", content: expect.any(String) }],
        agent_response: expect.any(String),
      },
    });
    const convo = sampleItem("conversation", 1);
    expect(convo.name).toBe("Example item 1");
    expect(convo.payload.transcript.length).toBeGreaterThan(1);
    expect(sampleItem("llm-general", 1)).toMatchObject({ input: expect.any(String), output: expect.any(String) });
    expect(sampleItem("stt", 1)).toMatchObject({ actual: expect.any(String), predicted: expect.any(String) });
    expect(sampleItem("tts", 1)).toMatchObject({ text: expect.any(String) });
  });
});
