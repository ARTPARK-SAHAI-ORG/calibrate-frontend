"use client";

import { useState } from "react";

export const TICKET_DENSITIES = ["comfortable", "compact"] as const;
export type TicketDensity = (typeof TICKET_DENSITIES)[number];

/** One remembered choice for how much room a ticket takes on the labelling page. */
const TICKET_DENSITY_KEY = "calibrate:ticket-density";

const DEFAULT_DENSITY: TicketDensity = "comfortable";

/** The saved choice, or comfortable when there is none, it is not one of the
 *  options, or there is no browser (rendering on the server). */
function savedDensity(): TicketDensity {
  if (typeof window === "undefined") return DEFAULT_DENSITY;
  // A browser set to block site data throws on both reading and writing here.
  // Forgetting the choice is fine; taking the page down with it is not.
  try {
    const stored = window.localStorage.getItem(TICKET_DENSITY_KEY);
    return (TICKET_DENSITIES as readonly string[]).includes(stored ?? "")
      ? (stored as TicketDensity)
      : DEFAULT_DENSITY;
  } catch {
    return DEFAULT_DENSITY;
  }
}

/**
 * The reader's preferred density for a ticket on the labelling page. Read
 * before the first render and saved on every change, in this browser, for every
 * job. Mount it once, above both the settings menu and the ticket, and hand the
 * value down: two copies of this hook would not see each other's changes.
 */
export function useTicketDensity(): [TicketDensity, (next: TicketDensity) => void] {
  const [density, setDensity] = useState<TicketDensity>(savedDensity);

  const change = (next: TicketDensity) => {
    try {
      window.localStorage.setItem(TICKET_DENSITY_KEY, next);
    } catch {
      // Not saved, but the choice still applies until the page is closed.
    }
    setDensity(next);
  };

  return [density, change];
}
