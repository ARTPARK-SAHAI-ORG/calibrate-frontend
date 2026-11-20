import {
  dayAndTime,
  dayHeading,
  endsWithQuestion,
  hourMinute,
  isTicketPayload,
  istToMs,
  parseTicket,
  ticketRowSummary,
  ticketTitle,
} from "../ticketView";

const T = (at: string) => istToMs(at);

function ticketPayload() {
  return {
    name: "a7c6f5f2",
    transcript: [
      {
        role: "user",
        label: "User",
        kind: "message",
        content: "Kya phir sab normal hay",
        versions: { "English translation": "So is everything normal?" },
        at_ist: "2026-11-16 19:01:00",
        ts: T("2026-11-16 19:01:00"),
        tags: ["ai-Medical"],
        emergency_tag: true,
      },
      {
        role: "assistant",
        label: "MSE",
        kind: "message",
        content: "Okay",
        versions: { "English translation": "Okay" },
        at_ist: "2026-11-16 22:56:00",
        ts: T("2026-11-16 22:56:00"),
        placeholder: true,
      },
      {
        role: "note",
        label: "NOTE: MSE to MO",
        kind: "note",
        content: "QUERY-I had my checkup today",
        at_ist: "2026-11-16 19:46:00",
        ts: T("2026-11-16 19:46:00"),
      },
      {
        role: "user",
        label: "User",
        kind: "message",
        content: "Earlier question",
        at_ist: "2026-11-15 10:00:00",
        ts: T("2026-11-15 10:00:00"),
      },
      {
        role: "assistant",
        label: "Automated",
        kind: "message",
        content: "Thanks, goodbye",
        at_ist: "2026-11-17 09:00:00",
        ts: T("2026-11-17 09:00:00"),
      },
    ],
  };
}

const META = [
  { key: "Language", value: "hindi" },
  { key: "Condition area", value: "anc_edd" },
  { key: "Opened", value: "2026-11-16 19:01:00" },
  { key: "Closed", value: "2026-11-16 22:56:00" },
  { key: "Escalated", value: "2026-11-16 19:46:00" },
  { key: "Escalated to", value: "Medical Officer" },
  { key: "Trimester", value: "3" },
  { key: "Programme", value: "not shown in the strip" },
];

describe("time helpers", () => {
  it("reads an Indian time as that moment, not local time", () => {
    expect(istToMs("2026-11-16 19:01:00")).toBe(
      Date.UTC(2026, 10, 16, 13, 31, 0),
    );
    expect(istToMs("not a time")).toBeNaN();
  });

  it("formats times for the screen", () => {
    expect(hourMinute("2026-11-16 19:01:00")).toBe("19:01");
    expect(dayAndTime("2026-11-06 19:01:00")).toBe("6 Nov, 19:01");
    expect(dayHeading("2026-11-16 19:01:00")).toBe("Mon, 16 Nov 2026");
  });
});

describe("isTicketPayload", () => {
  it("is true only when a turn carries a ticket kind", () => {
    expect(isTicketPayload(ticketPayload())).toBe(true);
    expect(isTicketPayload({ transcript: [{ kind: "note" }] })).toBe(true);
  });

  it("is false for an ordinary conversation or anything else", () => {
    expect(
      isTicketPayload({ transcript: [{ role: "user", content: "hi" }] }),
    ).toBe(false);
    expect(isTicketPayload({ transcript: "nope" })).toBe(false);
    expect(isTicketPayload({ transcript: [null, 4, "x"] })).toBe(false);
    expect(isTicketPayload(null)).toBe(false);
    expect(isTicketPayload([])).toBe(false);
  });
});

describe("parseTicket", () => {
  it("returns null when the item is not a ticket", () => {
    expect(parseTicket({ transcript: [] }, META)).toBeNull();
  });

  it("splits events into earlier, during and later, in time order", () => {
    const t = parseTicket(ticketPayload(), META)!;
    expect(t.earlier.map((e) => e.kind)).toEqual(["message"]);
    expect(t.later.map((e) => e.kind)).toEqual(["message"]);
    // The note and the escalation share a minute; the note was sent first.
    expect(t.during.map((e) => e.kind)).toEqual([
      "message",
      "note",
      "escalation",
      "message",
    ]);
    expect(t.openedAt).toBe("2026-11-16 19:01:00");
    expect(t.closedAt).toBe("2026-11-16 22:56:00");
  });

  it("reads a message: who wrote it, the translation, tags and flags", () => {
    const t = parseTicket(ticketPayload(), META)!;
    const user = t.during[0];
    expect(user).toMatchObject({
      kind: "message",
      who: "user",
      label: "User",
      text: "Kya phir sab normal hay",
      english: "So is everything normal?",
      tags: ["ai-Medical"],
      emergencyTag: true,
      placeholder: false,
    });
    // A translation identical to the text, or none at all, is no translation.
    const mse = t.during[3];
    expect(mse).toMatchObject({
      who: "mse",
      english: null,
      placeholder: true,
      tags: [],
      emergencyTag: false,
    });
    expect(t.later[0]).toMatchObject({ who: "automated", label: "Automated" });
  });

  it("marks the escalation, and who it went to", () => {
    const t = parseTicket(ticketPayload(), META)!;
    expect(t.during[2]).toMatchObject({
      kind: "escalation",
      toMedicalOfficer: true,
    });
    const doctor = parseTicket(ticketPayload(), [
      ...META.filter((m) => m.key !== "Escalated to"),
      { key: "Escalated to", value: "Doctor" },
    ])!;
    expect(doctor.during[2]).toMatchObject({ toMedicalOfficer: false });
  });

  it("reads a note with its label", () => {
    const t = parseTicket(ticketPayload(), META)!;
    expect(t.during[1]).toMatchObject({
      kind: "note",
      label: "NOTE: MSE to MO",
      text: "QUERY-I had my checkup today",
    });
  });

  it("builds the timeline from the opening, escalation, first reply and close", () => {
    const t = parseTicket(ticketPayload(), META)!;
    expect(t.steps.map((s) => [s.key, s.at])).toEqual([
      ["opened", "2026-11-16 19:01:00"],
      ["escalated", "2026-11-16 19:46:00"],
      ["first-reply", "2026-11-16 22:56:00"],
      ["closed", "2026-11-16 22:56:00"],
    ]);
  });

  it("counts only an MSE message inside the ticket as the first reply", () => {
    const turn = (role: string, label: string, at: string) => ({
      kind: "message",
      role,
      label,
      content: "x",
      at_ist: at,
      ts: T(at),
    });
    const t = parseTicket(
      {
        transcript: [
          // Months earlier: an automated broadcast and an old MSE reply.
          turn("assistant", "Automated", "2026-06-28 09:31:00"),
          turn("assistant", "MSE", "2026-06-28 09:40:00"),
          turn("user", "Caregiver", "2026-11-16 19:01:00"),
          // Inside the ticket: an automated acknowledgement, then the MSE.
          turn("assistant", "Automated", "2026-11-16 19:02:00"),
          turn("assistant", "MSE", "2026-11-16 19:30:00"),
        ],
      },
      [
        { key: "Opened", value: "2026-11-16 19:01:00" },
        { key: "Closed", value: "2026-11-16 20:00:00" },
      ],
    )!;
    expect(t.steps.find((s) => s.key === "first-reply")?.at).toBe(
      "2026-11-16 19:30:00",
    );
  });

  it("keeps only the case details the strip shows, in its own order", () => {
    const t = parseTicket(ticketPayload(), META)!;
    expect(t.facts).toEqual([
      { label: "Condition area", value: "anc_edd" },
      { label: "Language", value: "hindi" },
      { label: "Trimester", value: "3" },
    ]);
    expect(t.language).toBe("hindi");
  });

  it("treats everything as during when no opening or closing time is given", () => {
    const t = parseTicket(ticketPayload(), null)!;
    expect(t.earlier).toEqual([]);
    expect(t.later).toEqual([]);
    expect(t.during).toHaveLength(5);
    expect(t.steps.map((s) => s.key)).toEqual(["first-reply"]);
    expect(t.facts).toEqual([]);
    expect(t.language).toBe("");
  });

  it("keeps a message sent in the same second the ticket closed", () => {
    const closed = T("2026-11-16 22:56:00");
    const t = parseTicket(
      {
        transcript: [
          {
            role: "assistant",
            label: "MSE",
            kind: "message",
            content: "closing reply",
            at_ist: "2026-11-16 22:56:00",
            ts: closed + 640,
          },
          {
            role: "assistant",
            label: "MSE",
            kind: "message",
            content: "a second too late",
            at_ist: "2026-11-16 22:56:01",
            ts: closed + 1200,
          },
        ],
      },
      [
        { key: "Opened", value: "2026-11-16 19:01:00" },
        { key: "Closed", value: "2026-11-16 22:56:00" },
      ],
    )!;
    expect(t.during.map((e) => (e as { text: string }).text)).toEqual([
      "closing reply",
    ]);
    expect(t.later.map((e) => (e as { text: string }).text)).toEqual([
      "a second too late",
    ]);
  });

  it("falls back to the written time when a turn has no timestamp", () => {
    const t = parseTicket(
      {
        transcript: [
          {
            role: "user",
            kind: "message",
            content: "hello",
            at_ist: "2026-11-16 19:01:00",
          },
        ],
      },
      undefined,
    )!;
    expect(t.during[0].ts).toBe(T("2026-11-16 19:01:00"));
    expect(t.during[0]).toMatchObject({ label: "User", tags: [] });
  });

  it("drops notes with no text and turns that are not ticket turns", () => {
    const t = parseTicket(
      {
        transcript: [
          { kind: "note", content: "  ", at_ist: "2026-11-16 19:00:00" },
          { kind: "note", content: "kept", at_ist: "2026-11-16 19:01:00" },
          { kind: "other", content: "ignored" },
          "stray",
          { kind: "message", role: "assistant", content: "hi", tags: [1, "x"] },
        ],
      },
      [],
    )!;
    expect(t.during.map((e) => e.kind)).toEqual(["note", "message"]);
    expect(t.during[0]).toMatchObject({ label: "Note", text: "kept" });
    expect(t.during[1]).toMatchObject({ tags: ["x"] });
  });

  it("reads the kind of file a message carried, and never its link", () => {
    const turn = (media: unknown) => ({
      kind: "message",
      role: "user",
      content: "[Audio message]",
      at_ist: "2026-11-16 19:01:00",
      ts: T("2026-11-16 19:01:00"),
      media,
    });
    const t = parseTicket(
      {
        transcript: [
          turn({ type: "audio", mime: "audio/ogg; codecs=opus", uri: "https://x/1.ogg" }),
          turn({ type: "Image", mime: "image/jpeg", uri: "https://x/2.jpg" }),
          turn({ type: "sticker", mime: "image/webp" }),
          turn({ mime: "x" }),
          turn("not an object"),
          turn(undefined),
        ],
      },
      [],
    )!;
    const media = t.during.map((e) => (e as { media: unknown }).media);
    expect(media).toEqual([
      { kind: "audio", mime: "audio/ogg; codecs=opus" },
      { kind: "image", mime: "image/jpeg" },
      { kind: "other", mime: "image/webp" },
      { kind: "other", mime: "x" },
      null,
      null,
    ]);
  });

  it("always calls the person writing in the User, whatever the data labelled them", () => {
    const t = parseTicket(
      {
        transcript: [
          {
            kind: "message",
            role: "user",
            label: "Caregiver",
            content: "hello",
            at_ist: "2026-11-16 19:01:00",
            ts: T("2026-11-16 19:01:00"),
          },
          {
            kind: "message",
            role: "user",
            content: "no label at all",
            at_ist: "2026-11-16 19:02:00",
            ts: T("2026-11-16 19:02:00"),
          },
        ],
      },
      [],
    )!;
    expect(t.during.map((e) => (e as { label: string }).label)).toEqual([
      "User",
      "User",
    ]);
  });
});

describe("endsWithQuestion", () => {
  it.each([
    ["Are you pregnant?", true],
    ["Are you pregnant?  ", true],
    ["*Are you pregnant?*", true],
    ["Is the baby feeding well? 🙂", true],
    ["क्या आप गर्भवती हैं？", true],
    ["Did you take the tablet?_", true],
    ["Please go to the hospital.", false],
    ["Is it ok? Go to the hospital", false],
    ["", false],
  ])("%j -> %s", (text, expected) => {
    expect(endsWithQuestion(text)).toBe(expected);
  });
});

describe("probes on the timeline", () => {
  const turn = (role: string, label: string, at: string, content: string, extra = {}) => ({
    kind: "message",
    role,
    label,
    content,
    at_ist: at,
    ts: T(at),
    ...extra,
  });
  const META_WINDOW = [
    { key: "Opened", value: "2026-11-16 19:00:00" },
    { key: "Closed", value: "2026-11-16 21:00:00" },
  ];
  const stepOf = (t: ReturnType<typeof parseTicket>, key: string) =>
    t!.steps.find((s) => s.key === key);

  it("counts an MSE question inside the ticket, in order with the other steps", () => {
    const t = parseTicket(
      {
        transcript: [
          turn("user", "x", "2026-11-16 19:00:00", "Is my baby ok?"),
          turn("assistant", "MSE", "2026-11-16 19:10:00", "Hello, thank you."),
          turn("assistant", "MSE", "2026-11-16 19:20:00", "How old is your baby?"),
        ],
      },
      META_WINDOW,
    )!;
    expect(stepOf(t, "probed")).toMatchObject({ at: "2026-11-16 19:20:00", label: "Probed" });
    expect(stepOf(t, "probed")?.note).toBeUndefined();
    expect(t.steps.map((s) => s.key)).toEqual(["opened", "first-reply", "probed", "closed"]);
  });

  it("puts a probe before the first reply when it is the first reply", () => {
    const t = parseTicket(
      { transcript: [turn("assistant", "MSE", "2026-11-16 19:05:00", "How old is your baby?")] },
      META_WINDOW,
    )!;
    expect(t.steps.map((s) => s.key)).toEqual(["opened", "first-reply", "probed", "closed"]);
    expect(stepOf(t, "probed")?.at).toBe(stepOf(t, "first-reply")?.at);
  });

  it("notes how many questions were asked when there are several", () => {
    const t = parseTicket(
      {
        transcript: [
          turn("assistant", "MSE", "2026-11-16 19:05:00", "How old is your baby?"),
          turn("assistant", "MSE", "2026-11-16 19:06:00", "Is the baby feeding?"),
          turn("assistant", "MSE", "2026-11-16 19:07:00", "Thank you."),
        ],
      },
      META_WINDOW,
    )!;
    expect(stepOf(t, "probed")).toMatchObject({ at: "2026-11-16 19:05:00", note: "2 questions" });
  });

  it("ignores the user's questions, automated questions, and MSE questions outside the ticket", () => {
    const t = parseTicket(
      {
        transcript: [
          turn("user", "x", "2026-11-16 19:01:00", "Is this normal?"),
          turn("assistant", "Automated", "2026-11-16 19:02:00", "Are you pregnant?"),
          turn("assistant", "MSE", "2026-11-15 10:00:00", "An old question?"),
          turn("assistant", "MSE", "2026-11-17 10:00:00", "A later question?"),
          turn("assistant", "MSE", "2026-11-16 19:03:00", "A statement."),
          turn("assistant", "MSE", "2026-11-16 19:04:00", "[Audio message]?", { placeholder: true }),
        ],
      },
      META_WINDOW,
    )!;
    expect(stepOf(t, "probed")).toBeUndefined();
  });

  it("reads a question mark in the English translation too", () => {
    const t = parseTicket(
      {
        transcript: [
          turn("assistant", "MSE", "2026-11-16 19:05:00", "Baby ki age entha", {
            versions: { "English translation": "How old is the baby?" },
          }),
        ],
      },
      META_WINDOW,
    )!;
    expect(stepOf(t, "probed")?.at).toBe("2026-11-16 19:05:00");
  });
});

describe("ticketTitle", () => {
  it("shortens a ticket's long id to its first eight characters", () => {
    expect(ticketTitle("77286594-f7cd-4880-4d30-40705fd6c6e8")).toBe("Ticket 77286594");
  });

  it("keeps any other name as it is", () => {
    expect(ticketTitle("  Fever case ")).toBe("Fever case");
    expect(ticketTitle("")).toBe("");
  });
});

describe("ticketRowSummary", () => {
  const meta = [
    { key: "Opened", value: "2026-11-16 19:00:00" },
    { key: "Closed", value: "2026-11-16 22:30:00" },
  ];
  const turn = (role: string, content: string, at: string, extra = {}) => ({
    role,
    label: role === "user" ? "User" : "MSE",
    kind: "message",
    content,
    at_ist: at,
    ts: T(at),
    ...extra,
  });

  it("previews the first thing the user wrote, in English", () => {
    const sum = ticketRowSummary(
      {
        name: "77286594-f7cd-4880-4d30-40705fd6c6e8",
        transcript: [
          turn("user", "Older chat", "2026-11-15 10:00:00"),
          turn("user", "Kya bukhar hai", "2026-11-16 19:01:00", {
            versions: { "English translation": "Does the baby have a fever" },
          }),
          turn("assistant", "How old is the baby?", "2026-11-16 19:05:00"),
        ],
      },
      meta,
    );
    expect(sum.preview).toBe("Does the baby have a fever");
    expect(sum.searchText).toContain("ticket 77286594");
    expect(sum.searchText).toContain("kya bukhar hai");
    expect(sum.searchText).toContain("does the baby have a fever");
    expect(sum.searchText).toContain("how old is the baby?");
  });

  it("names an audio message when the user wrote nothing", () => {
    const sum = ticketRowSummary(
      {
        name: "t",
        transcript: [
          turn("user", "", "2026-11-16 19:01:00", {
            media: { type: "audio", mime: "audio/ogg", uri: "https://example.com/a" },
          }),
        ],
      },
      meta,
    );
    expect(sum.preview).toBe("Audio message");
  });

  it("falls back to the chat's older history, then to nothing", () => {
    const older = ticketRowSummary(
      { name: "t", transcript: [turn("user", "Before it opened", "2026-11-15 10:00:00")] },
      meta,
    );
    expect(older.preview).toBe("Before it opened");
    const none = ticketRowSummary(
      { name: "t", transcript: [turn("assistant", "Hello", "2026-11-16 19:05:00")] },
      meta,
    );
    expect(none.preview).toBe("");
  });

  it("copes with something that is not a ticket", () => {
    expect(ticketRowSummary({ chat_history: [] }, meta)).toEqual({
      preview: "",
      searchText: "",
    });
  });
});
