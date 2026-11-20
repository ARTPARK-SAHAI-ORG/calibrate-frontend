import { TICKET_HELP, ticketHelpFor, type TicketHelp } from "../ticketHelp";

const TABLE: Record<string, TicketHelp> = {
  Urgency: { definition: "How quickly the user needed help" },
};

describe("ticketHelpFor", () => {
  it("finds a question's help by name, ignoring case and spaces", () => {
    expect(ticketHelpFor("  urgency ", TABLE)?.definition).toBe(
      "How quickly the user needed help",
    );
  });

  it("is null for a question with no help written", () => {
    expect(ticketHelpFor("Accuracy", TABLE)).toBeNull();
  });

  it("reads the team's own table by default", () => {
    expect(ticketHelpFor("No such question")).toBeNull();
    expect(typeof TICKET_HELP).toBe("object");
  });

  it("has help for each of the four questions of the safety review", () => {
    for (const name of ["Urgency", "Probing", "Accuracy", "Patient safety"]) {
      const help = ticketHelpFor(name);
      expect(help?.definition.length).toBeGreaterThan(20);
      expect(help?.choices?.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("writes no full stop after a one-line label and no dash that reads as an em-dash", () => {
    for (const help of Object.values(TICKET_HELP)) {
      const lines = [
        ...(help.choices ?? []).map((c) => c.text),
        ...(help.counts ?? []),
        ...(help.notCounts ?? []),
      ];
      for (const line of lines) expect(line.endsWith(".")).toBe(false);
      expect(JSON.stringify(help)).not.toContain("\u2014");
    }
  });
});
