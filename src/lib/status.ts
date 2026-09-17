/**
 * Formats a status string for display
 */
export const formatStatus = (status: string): string => {
  switch (status.toLowerCase()) {
    case "queued":
      return "Queued";
    case "in_progress":
      return "Running";
    case "done":
      return "Done";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return status;
  }
};

/**
 * Returns Tailwind CSS classes for status badge styling
 */
export const getStatusBadgeClass = (status: string): string => {
  switch (status.toLowerCase()) {
    case "done":
    case "completed":
      return "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400";
    case "running":
    case "in_progress":
      return "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400";
    case "failed":
    case "error":
      return "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400";
    case "pending":
    case "queued":
      return "bg-gray-200 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400";
    default:
      return "bg-gray-200 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400";
  }
};

/**
 * Returns true if the status indicates an active/running task
 */
export const isActiveStatus = (status: string): boolean => {
  const s = status.toLowerCase();
  return s === "queued" || s === "in_progress" || s === "running";
};
