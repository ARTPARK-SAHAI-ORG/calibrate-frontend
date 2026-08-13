/**
 * The page shown while the app works out which workspace a link belongs to.
 *
 * Every page behind sign-in normally names its workspace in the address. Two
 * kinds of address do not: a link made before that was true, and the page
 * someone lands on straight after signing in. For those, the middleware shows
 * this page in place of the one asked for, keeping the address the person
 * typed, and this page puts the workspace into the address as soon as it knows
 * it.
 */

export const OPENING_PATH = "/opening";

/** Carries the page that was asked for. */
export const OPENING_TARGET_PARAM = "to";
