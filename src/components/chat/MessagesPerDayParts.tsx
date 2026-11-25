"use client";

import { Tooltip } from "@/components/Tooltip";
import { InfoIcon } from "@/components/icons";
import { CONTACT_LINK } from "@/constants/limits";

function ContactLink() {
  return (
    <a
      href={CONTACT_LINK}
      target="_blank"
      rel="noopener noreferrer"
      className="font-bold no-underline text-inherit cursor-pointer"
    >
      Click here
    </a>
  );
}

/** The "i" beside a messages per day setting: the workspace maximum and how
 *  to raise it. Draws nothing when the workspace has no maximum. */
export function MessagesPerDayInfo({ maximum }: { maximum: number | null }) {
  if (maximum === null) return null;
  return (
    <Tooltip
      position="right"
      contentStyle={{ width: 280 }}
      content={
        <span>
          The maximum number of messages allowed per day is{" "}
          {maximum.toLocaleString("en-US")}. <ContactLink /> to increase it.
        </span>
      }
    >
      <span
        aria-label="More about this limit"
        className="flex text-muted-foreground"
      >
        <InfoIcon className="w-4 h-4" />
      </span>
    </Tooltip>
  );
}

/** Shown under the number box when it is above the workspace maximum. */
export function MessagesPerDayTooHigh() {
  return (
    <p className="text-[13px] md:text-sm text-red-600 dark:text-red-400">
      This is more than your workspace allows. <ContactLink /> to contact us
      to extend your limits.
    </p>
  );
}

/** Whether `value` is above the workspace maximum (`null` means none). */
export function overMessagesPerDayMaximum(
  value: number,
  maximum: number | null,
): boolean {
  return maximum !== null && value > maximum;
}
