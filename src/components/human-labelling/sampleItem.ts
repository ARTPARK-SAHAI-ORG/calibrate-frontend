export type SampleItemTaskType = "llm" | "conversation" | "llm-general" | "stt" | "tts";

type Turn = { role: "user" | "assistant"; content: string };

type SampleItemFor<T extends SampleItemTaskType> = { name: string } & (T extends "llm"
  ? { payload: { chat_history: Turn[]; agent_response: string } }
  : T extends "conversation"
    ? { payload: { transcript: Turn[] } }
    : T extends "llm-general"
      ? { input: string; output: string }
      : T extends "stt"
        ? { actual: string; predicted: string }
        : { text: string });

const USER_TURN = "When is my baby's next vaccination due?";
const AGENT_TURN =
  "Your baby's measles vaccine is due at 9 months. It is free at your nearest anganwadi or health centre.";

/** Starting values for a new item, so most of the form is filled in when it
 *  opens. A TTS sample still needs its audio picked, and an evaluator variable
 *  with no default still needs a value. `n` is the task's item count plus one,
 *  which can repeat a name after an item is deleted. */
export function sampleItem<T extends SampleItemTaskType>(taskType: T, n: number): SampleItemFor<T> {
  const name = `Example item ${n}`;
  const byType: { [K in SampleItemTaskType]: SampleItemFor<K> } = {
    llm: {
      name,
      payload: {
        chat_history: [{ role: "user", content: USER_TURN }],
        agent_response: AGENT_TURN,
      },
    },
    conversation: {
      name,
      payload: {
        transcript: [
          { role: "user", content: "I want to apply for a ration card." },
          { role: "assistant", content: "I can help with that. Does every family member have an Aadhaar card?" },
          { role: "user", content: "Yes, all four of us." },
          { role: "assistant", content: "Then take those cards and a proof of address to your nearest ration office." },
        ],
      },
    },
    "llm-general": {
      name,
      input: "Summarise: the village health camp is moved from Monday to Wednesday at the primary health centre.",
      output: "The health camp is now on Wednesday at the primary health centre.",
    },
    stt: {
      name,
      actual: "my child has had a fever for three days",
      predicted: "my child has had a fever for tree days",
    },
    tts: { name, text: "Your next antenatal check-up is on Friday at the primary health centre." },
  };
  return byType[taskType];
}
