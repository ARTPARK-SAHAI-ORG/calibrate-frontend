// Derives the Overview task-selector dropdown options from the labelling-task
// list. Only tasks that have at least one comparable pair (all-time
// `has_agreement`, returned by GET /annotation-tasks) belong in the dropdown,
// so the page can filter in memory instead of probing the per-task agreement
// endpoint once per task.

export type TaskOptionSource = {
  uuid: string;
  name: string;
  has_agreement?: boolean;
};

export type TaskOption = {
  uuid: string;
  name: string;
};

export function taskOptionsWithAgreement(
  tasks: TaskOptionSource[],
): TaskOption[] {
  return tasks
    .filter((t) => t.has_agreement)
    .map((t) => ({ uuid: t.uuid, name: t.name }));
}
