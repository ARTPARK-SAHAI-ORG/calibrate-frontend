/**
 * The Noora Health look for the labelling job of support tickets, on Material 3.
 *
 * Every string here is added to a component's own classes and only applies
 * inside `.skin-noora` (see `globals.css`, the `noora:` variant), so the same
 * component looks as it always did on every other page. The colour roles are
 * the brand colours: pink is the main action colour, and blue, green and orange
 * mark an opening, a closing and an escalation.
 */

/** Material 3 outlined button: pill shape, an outline, pink text, a faint pink wash on hover. */
export const NOORA_OUTLINED =
  "noora:h-10 noora:rounded-full noora:border-outline noora:bg-transparent noora:px-5 noora:text-primary noora:hover:bg-primary/8 noora:focus-visible:ring-primary/40";

/** The same for a round icon button. */
export const NOORA_ICON_OUTLINED =
  "noora:h-10 noora:w-10 noora:rounded-full noora:border-outline noora:bg-transparent noora:text-primary noora:hover:bg-primary/8 noora:focus-visible:ring-primary/40";

/** Material 3 filled button: the one main action on the page. */
export const NOORA_FILLED =
  "noora:h-10 noora:rounded-full noora:bg-primary noora:px-6 noora:text-on-primary noora:shadow-sm noora:hover:bg-primary-hover noora:hover:opacity-100 noora:hover:shadow-md noora:focus-visible:ring-primary/40";

/** A card: rounded corners and a hairline in place of a heavy border; the surface tone is set where it is used. */
export const NOORA_CARD = "noora:rounded-2xl noora:border-outline-variant";

/** The headline face, Playfair Display, for titles. */
export const NOORA_DISPLAY = "noora:[font-family:var(--noora-display)]";
