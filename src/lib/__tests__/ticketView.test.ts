import {
  dayAndTime,
  dayHeading,
  hourMinute,
  isTicketPayload,
  istToMs,
  parseTicket,
} from "../ticketView";

const T = (at: string) => istToMs(at);

function ticketPayload() {
  return {
    name: "a7c6f5f2",
    transcript: [
      {
        role: "user",
        label: "Caregiver",
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
        label: "Caregiver",
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
    const caregiver = t.during[0];
    expect(caregiver).toMatchObject({
      kind: "message",
      who: "caregiver",
      label: "Caregiver",
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
    expect(t.during[0]).toMatchObject({ label: "Caregiver", tags: [] });
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
});
