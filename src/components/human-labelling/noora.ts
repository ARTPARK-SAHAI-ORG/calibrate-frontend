/**
 * The Noora Health look for the labelling job of support tickets, following the
 * Noora safety viewer on Material 3.
 *
 * Every string here is added to a component's own classes and only applies
 * inside `.skin-noora` (see `globals.css`, the `noora:` variant), so the same
 * component looks as it always did on every other page. Corners are modest (8px
 * for controls, 12px for cards) and pills are kept for small chips. Blue is the
 * colour of the interface; pink, green and amber are for outcomes.
 */

/** Material 3 tonal button: a quiet fill and no outline, for the everyday actions. */
export const NOORA_TONAL =
  "noora:h-11 noora:md:h-10 noora:rounded-lg noora:border-transparent noora:bg-surface-container noora:px-4 noora:text-foreground noora:hover:bg-surface-high noora:focus-visible:ring-secondary";

/** The same for a square icon button. */
export const NOORA_ICON_TONAL =
  "noora:h-11 noora:w-11 noora:md:h-10 noora:md:w-10 noora:rounded-lg noora:border-transparent noora:bg-surface-container noora:text-foreground noora:hover:bg-surface-high noora:focus-visible:ring-secondary";

/** Material 3 filled button: the one main action on the page. */
export const NOORA_FILLED =
  "noora:h-11 noora:md:h-10 noora:rounded-lg noora:bg-primary noora:px-5 noora:font-semibold noora:text-on-primary noora:hover:bg-primary-hover noora:hover:opacity-100 noora:focus-visible:ring-secondary";

/** A card: a 12px corner and a hairline; the fill is set where it is used. */
export const NOORA_CARD = "noora:rounded-xl noora:border-outline-variant";

/** The headline face, Playfair Display, for the page title only. */
export const NOORA_DISPLAY = "noora:[font-family:var(--noora-display)]";
