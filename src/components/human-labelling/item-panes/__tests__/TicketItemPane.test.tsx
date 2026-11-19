import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import { istToMs } from "@/lib/ticketView";
import { TicketItemPane } from "../TicketItemPane";
import { ItemPane, rightColumnMetadata } from "../../AnnotationJobView";
import type { Item } from "../../AnnotationJobView";

const at = (s: string) => ({ at_ist: s, ts: istToMs(s) });

const payload = {
  name: "a7c6f5f2",
  transcript: [
    {
      role: "user",
      label: "Caregiver",
      kind: "message",
      content: "Kya phir sab normal hay",
      versions: { "English translation": "So is everything normal?" },
      tags: ["ai-Medical"],
      emergency_tag: true,
      ...at("2026-11-16 19:01:00"),
    },
    {
      role: "note",
      label: "NOTE: MSE to MO",
      kind: "note",
      content: "QUERY-I had my checkup today",
      ...at("2026-11-16 19:46:00"),
    },
    {
      role: "assistant",
      label: "MSE",
      kind: "message",
      content: "[Audio message]",
      placeholder: true,
      ...at("2026-11-16 22:56:00"),
    },
    {
      role: "user",
      label: "Caregiver",
      kind: "message",
      content: "An earlier question",
      ...at("2026-11-15 10:00:00"),
    },
    {
      role: "user",
      label: "Caregiver",
      kind: "message",
      content: "A later thanks",
      ...at("2026-11-17 09:00:00"),
    },
  ],
};

const metadata = [
  { key: "Condition area", value: "anc_edd" },
  { key: "Language", value: "hindi" },
  { key: "Opened", value: "2026-11-16 19:01:00" },
  { key: "Closed", value: "2026-11-16 22:56:00" },
  { key: "Escalated", value: "2026-11-16 19:46:00" },
  { key: "Escalated to", value: "Medical Officer" },
];

describe("TicketItemPane", () => {
  it("draws the case details and the timeline", () => {
    render(<TicketItemPane payload={payload} metadata={metadata} />);
    expect(screen.getByText("Case details")).toBeInTheDocument();
    expect(screen.getByText("Area")).toBeInTheDocument();
    expect(screen.getByText("anc edd")).toBeInTheDocument();
    expect(screen.getByText("hindi")).toBeInTheDocument();
    expect(screen.getByText("Ticket timeline")).toBeInTheDocument();
    expect(screen.getByText("Escalated")).toBeInTheDocument();
    expect(screen.getByText("First reply")).toBeInTheDocument();
  });

  it("marks when the ticket opened and closed", () => {
    render(<TicketItemPane payload={payload} metadata={metadata} />);
    expect(
      screen.getByText("Ticket opened · 16 Nov, 19:01 IST"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ticket closed · 16 Nov, 22:56 IST"),
    ).toBeInTheDocument();
  });

  it("shows the translation first with the original under it, and can switch it off", async () => {
    const user = setupUser();
    render(<TicketItemPane payload={payload} metadata={metadata} />);
    expect(screen.getByText("So is everything normal?")).toBeInTheDocument();
    expect(screen.getByText("Kya phir sab normal hay")).toBeInTheDocument();

    const toggle = screen.getByRole("switch", { name: /English translation/ });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(
      screen.queryByText("So is everything normal?"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Kya phir sab normal hay")).toBeInTheDocument();
  });

  it("shows the escalation, the staff note and the message flags", () => {
    render(<TicketItemPane payload={payload} metadata={metadata} />);
    expect(
      screen.getByText("Escalated to a Medical Officer (internal) · 19:46"),
    ).toBeInTheDocument();
    expect(screen.getByText("NOTE: MSE to MO · 19:46")).toBeInTheDocument();
    expect(
      screen.getByText("QUERY-I had my checkup today"),
    ).toBeInTheDocument();
    expect(screen.getByText("ai-Medical")).toBeInTheDocument();
    expect(screen.getByText("Marked as emergency")).toBeInTheDocument();
    expect(screen.getByText("[Audio message]")).toBeInTheDocument();
  });

  it("keeps messages from before and after the ticket folded until asked for", async () => {
    const user = setupUser();
    render(<TicketItemPane payload={payload} metadata={metadata} />);
    expect(screen.queryByText("An earlier question")).not.toBeInTheDocument();
    expect(screen.queryByText("A later thanks")).not.toBeInTheDocument();

    const earlier = screen.getByRole("button", {
      name: "Show 1 earlier message",
    });
    await user.click(earlier);
    expect(screen.getByText("An earlier question")).toBeInTheDocument();
    expect(earlier).toHaveTextContent("Hide 1 earlier message");
    await user.click(earlier);
    expect(screen.queryByText("An earlier question")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /later message/ }));
    expect(screen.getByText("A later thanks")).toBeInTheDocument();
  });

  it("puts a date heading above each new day", async () => {
    const user = setupUser();
    render(<TicketItemPane payload={payload} metadata={metadata} />);
    expect(screen.getByText("Mon, 16 Nov 2026")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Show 1 earlier message" }),
    );
    expect(screen.getByText("Sun, 15 Nov 2026")).toBeInTheDocument();
  });

  it("offers no translation switch when nothing has a translation", () => {
    render(
      <TicketItemPane
        payload={{
          transcript: [
            {
              role: "user",
              kind: "message",
              content: "Hello",
              ...at("2026-11-16 19:01:00"),
            },
          ],
        }}
        metadata={[]}
      />,
    );
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.queryByText("Case details")).not.toBeInTheDocument();
    // No opening, closing or reply time to put on a timeline.
    expect(screen.queryByText("Ticket timeline")).not.toBeInTheDocument();
  });

  it("says plainly when the escalation is not to a Medical Officer", () => {
    render(
      <TicketItemPane
        payload={payload}
        metadata={[
          ...metadata.filter((m) => m.key !== "Escalated to"),
          { key: "Escalated to", value: "Doctor" },
        ]}
      />,
    );
    expect(screen.getByText("Escalated (internal) · 19:46")).toBeInTheDocument();
  });

  it("marks a file with no words as one that cannot be played, in place of its placeholder", () => {
    render(
      <TicketItemPane
        payload={{
          transcript: [
            {
              role: "user",
              kind: "message",
              content: "[Audio message]",
              placeholder: true,
              media: { type: "audio", mime: "audio/ogg", uri: "https://x/a.ogg" },
              ...at("2026-11-16 19:01:00"),
            },
          ],
        }}
        metadata={[]}
      />,
    );
    expect(screen.getByTestId("ticket-media")).toHaveTextContent(
      "Audio message · cannot be played here",
    );
    expect(screen.queryByText("[Audio message]")).not.toBeInTheDocument();
  });

  it("keeps the words of a picture that has a caption, and marks the picture", () => {
    render(
      <TicketItemPane
        payload={{
          transcript: [
            {
              role: "user",
              kind: "message",
              content: "This is the powder",
              media: { type: "image", mime: "image/jpeg", uri: "https://x/i.jpg" },
              ...at("2026-11-16 19:01:00"),
            },
          ],
        }}
        metadata={[]}
      />,
    );
    expect(screen.getByText("This is the powder")).toBeInTheDocument();
    expect(screen.getByTestId("ticket-media")).toHaveTextContent(
      "Image · cannot be played here",
    );
  });

  it("draws nothing for an item that is not a ticket", () => {
    const { container } = render(
      <TicketItemPane payload={{ transcript: [] }} metadata={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ticket items in the job view", () => {
  const ticketItem = {
    uuid: "i1",
    payload,
    metadata,
  } as unknown as Item;

  it("is drawn by the ticket pane for a conversation task", () => {
    render(<ItemPane item={ticketItem} taskType="conversation" />);
    expect(screen.getByTestId("ticket-pane")).toBeInTheDocument();
  });

  it("hides the case details on the right for a ticket, and only for a ticket", () => {
    expect(rightColumnMetadata(ticketItem)).toBeNull();
    const plain = {
      uuid: "i2",
      payload: { transcript: [{ role: "user", content: "hi" }] },
      metadata: [{ key: "Language", value: "hindi" }],
    } as unknown as Item;
    expect(rightColumnMetadata(plain)).toEqual([
      { key: "Language", value: "hindi" },
    ]);
  });
});
