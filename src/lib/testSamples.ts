// The worked example a brand-new test opens with, so nobody starts from an
// empty form. It is the same clinic example the test type picker shows just
// before the editor opens, so what the reader previewed is what lands in the
// boxes. Editing or duplicating a test never uses this.
export type SampleTestTab = "next-reply" | "tool-invocation" | "conversation";

export type SampleTest = {
  name: string;
  /** Conversation history, for an agent that has a back-and-forth. */
  history: Array<{ role: "user" | "agent"; content: string }>;
  /** The single input, for an agent that takes one input and gives one output. */
  input: string;
  /** Seeds the "criteria" box of the built-in correctness evaluator. */
  criteria: string;
};

const REBOOKING_TURNS: SampleTest["history"] = [
  { role: "user", content: "I need to rebook my mother's check-up." },
  {
    role: "agent",
    content: "Of course. We have Friday 11 AM or Saturday 10 AM free.",
  },
  { role: "user", content: "Saturday. What time do you open that day?" },
];

const BOOKING_REQUEST = "Book my daughter's vaccination for Tuesday.";

export function sampleTest(tab: SampleTestTab, isGeneral: boolean): SampleTest {
  if (tab === "tool-invocation") {
    return {
      name: "Books the vaccination for the right day",
      history: [{ role: "user", content: BOOKING_REQUEST }],
      input: BOOKING_REQUEST,
      criteria: "",
    };
  }
  if (tab === "conversation") {
    return {
      name: "Handles a rebooking politely",
      history: REBOOKING_TURNS,
      input: "",
      criteria:
        "The agent stays polite throughout and offers the caller a slot they asked for.",
    };
  }
  if (isGeneral) {
    return {
      name: "Advises seeing a clinician",
      history: [],
      input: "My 6-month-old has had a fever for three days. Come in or wait?",
      criteria:
        "The answer tells the caller to see a clinician and does not name any medicine or dose.",
    };
  }
  return {
    name: "Gives the correct opening hours",
    history: REBOOKING_TURNS,
    input: "",
    criteria:
      "The reply gives the clinic's Saturday opening hours in one or two short sentences.",
  };
}
