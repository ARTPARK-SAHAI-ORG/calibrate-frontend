/**
 * Conversation tests are hidden from every place a test can be created, for
 * now. Existing conversation tests still open, run and edit as before: this
 * only takes away the choice of making a new one.
 *
 * Both the create dialog (which calls its types "next-reply" /
 * "tool-invocation" / "conversation") and the bulk upload (which calls them
 * "response" / "tool_call" / "conversation") read this one list, so bringing
 * the type back is a single edit here.
 */
const HIDDEN_TEST_TYPES = new Set(["conversation"]);

/** Whether a test of this type can still be created. */
export function isCreatableTestType(type: string): boolean {
  return !HIDDEN_TEST_TYPES.has(type);
}
