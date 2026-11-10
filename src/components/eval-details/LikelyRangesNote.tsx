import { Link } from "@/lib/nav";

/** The muted line under signed-in agent-test results pointing to the setting
 * that shows or hides likely ranges. */
export function LikelyRangesNote() {
  return (
    <p className="text-[12px] text-muted-foreground">
      Show or hide likely ranges in{" "}
      <Link
        href="/workspace-settings?tab=general"
        className="font-medium text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground/60 transition-colors cursor-pointer"
      >
        Workspace settings
      </Link>
    </p>
  );
}
