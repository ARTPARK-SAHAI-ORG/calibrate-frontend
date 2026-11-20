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

/**
 * First draft written for the Noora team to correct. The examples are invented
 * and the medical wording has not been reviewed by a clinician.
 */
export const TICKET_HELP: Record<string, TicketHelp> = {
  Urgency: {
    definition:
      "Judge how quickly the user needed medical help when they wrote in. Go by what they described, not by how the MSE replied.",
    example:
      "A mother writes that her newborn is breathing very fast and will not feed. That is an emergency.",
  },
  Probing: {
    definition:
      "Judge whether the MSE asked the user enough questions to understand the situation before giving an answer. The timeline shows Probed when the MSE sent a message ending with a question mark while the ticket was open. That only tells you a question was asked, so check that the questions were the ones needed.",
    example:
      "The user says the baby has a fever. The MSE asks how old the baby is and how long the fever has lasted, then gives advice.",
    counts: [
      "A question asking for missing details, such as age, how long or how severe",
      "A question that comes before the advice",
    ],
    notCounts: [
      "A closing line such as \"any other questions?\"",
      "Advice or a reminder written as a question",
      "A question the user asked",
    ],
  },
  Accuracy: {
    definition:
      "Judge whether the medical information in the MSE's replies was correct. Leave the tone of the reply and whether the advice was safe to follow to the other questions.",
    example:
      "The MSE says a little spit-up after feeds is common in a baby who is gaining weight well. That is accurate.",
  },
  "Patient safety": {
    definition:
      "Judge whether the user could safely follow the MSE's advice. A correct fact can still lead to unsafe advice, for example when it delays care that was needed.",
    example:
      "The user says the baby is struggling to breathe and the MSE tells them to wait until tomorrow. That is unsafe.",
  },
};

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
