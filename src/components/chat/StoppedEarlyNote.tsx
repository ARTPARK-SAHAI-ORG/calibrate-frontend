/** Said under a reply the agent never finished: it kept calling tools until
 *  the server's limit stopped it. Shared by the chat page and the trace window. */
export function StoppedEarlyNote() {
  return (
    <p className="mt-2 text-sm text-muted-foreground">
      The agent was stopped after using tools too many times in a row, before it
      replied
    </p>
  );
}
