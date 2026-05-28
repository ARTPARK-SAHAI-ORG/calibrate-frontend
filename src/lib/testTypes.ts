/**
 * Test-type helpers shared across the tests list views.
 *
 * A test's `type` is one of these three backend values. Keeping the
 * human-readable label in one place means a rename only happens here
 * instead of in every table / card that shows the type.
 */
export type TestType = "response" | "tool_call" | "conversation";

/**
 * Human-readable label for a test type.
 *
 * Unknown / missing types fall back to `fallback`. The agent Tests tab
 * treats anything non-tool_call / non-conversation as "Next Reply" (the
 * default fallback); the standalone /tests page passes "—" so a truly
 * unknown type renders as a dash.
 */
export function testTypeLabel(
  type: string | null | undefined,
  fallback = "Next Reply",
): string {
  switch (type) {
    case "tool_call":
      return "Tool Call";
    case "conversation":
      return "Conversation";
    case "response":
      return "Next Reply";
    default:
      return fallback;
  }
}
