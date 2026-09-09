import type { Task } from "./workflow";

export function tasksForView(tasks: Task[], userId: string, filter: string, now = Date.now()) {
  if (filter === "archive") return tasks.filter(t => !!t.archivedAt)
    .sort((a, b) => b.archivedAt!.localeCompare(a.archivedAt!));
  return tasks.filter(t => !t.archivedAt && (filter === "completed" ? t.status === "done" :
    t.status !== "done" && (filter === "all" ||
      filter === "overdue" && t.status === "open" && !!t.dueAt && Date.parse(t.dueAt) < now ||
      filter === "sent" && t.createdBy === userId || filter === "mine" && t.assignee === userId)));
}
