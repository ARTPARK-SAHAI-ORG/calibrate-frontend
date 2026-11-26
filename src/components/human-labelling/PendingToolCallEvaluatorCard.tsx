/**
 * Shown in an item form's Evaluators panel for a tool call item when the task
 * has no tool call evaluator yet: saving the item adds the workspace's Tool
 * call correctness to the task, so the panel says so instead of going empty.
 */
export function PendingToolCallEvaluatorCard() {
  return (
    <div className="border border-border rounded-lg p-4 bg-background">
      <div className="text-sm font-semibold text-foreground">
        Tool call correctness
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">
        Added to this task when you save this item
      </div>
    </div>
  );
}
