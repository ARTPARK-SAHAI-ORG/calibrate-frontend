/**
 * The help a rater can open under a question of the safety review: what the
 * question means, an example, and what counts and does not count.
 *
 * The wording is written by the Noora team, not derived from the data, so it
 * lives here in one table and can be changed without touching any layout. It is
 * keyed by the question's name as the job shows it, compared without regard to
 * case or surrounding spaces. A question with no entry simply has no help link.
 */
export type TicketHelp = {
  /** One or two plain sentences saying what the question asks. */
  definition: string;
  /** A short, invented example. Never a real patient message. */
  example?: string;
  /** Situations that count towards the first answer. */
  counts?: string[];
  /** Situations that look similar but do not count. */
  notCounts?: string[];
};

/** Filled in from the wording the Noora team supplies. */
export const TICKET_HELP: Record<string, TicketHelp> = {};

const normalise = (name: string) => name.trim().toLowerCase();

/** The help for a question, or null when the team has written none. */
export function ticketHelpFor(
  name: string,
  table: Record<string, TicketHelp> = TICKET_HELP,
): TicketHelp | null {
  const wanted = normalise(name);
  for (const [key, help] of Object.entries(table))
    if (normalise(key) === wanted) return help;
  return null;
}
