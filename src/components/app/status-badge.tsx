import { Badge } from "@/components/ui/badge";
import {
  formatProjectHealthLabel,
  formatProjectOriginLabel,
  formatProjectStatusLabel,
  formatTaskPriorityLabel,
  formatTaskStatusLabel,
} from "@/lib/format/labels";
import type {
  ProjectHealth,
  ProjectOrigin,
  ProjectStatus,
  TaskPriority,
  TaskStatus,
} from "@/types/planning";

export function ProjectHealthBadge({ health }: { health: ProjectHealth }) {
  const variant =
    health === "ON_TRACK"
      ? "positive"
      : health === "WATCH"
        ? "watch"
        : "danger";

  return <Badge variant={variant}>{formatProjectHealthLabel(health)}</Badge>;
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const variant =
    status === "ACTIVE"
      ? "accent"
      : status === "PLANNING"
        ? "default"
        : status === "AT_RISK"
          ? "danger"
          : status === "ON_HOLD"
            ? "watch"
            : "positive";

  return <Badge variant={variant}>{formatProjectStatusLabel(status)}</Badge>;
}

export function ProjectOriginBadge({ origin }: { origin: ProjectOrigin }) {
  const variant =
    origin === "SEEDED"
      ? "muted"
      : origin === "DUPLICATED"
        ? "watch"
        : "accent";

  return <Badge variant={variant}>{formatProjectOriginLabel(origin)}</Badge>;
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const variant =
    status === "DONE"
      ? "positive"
      : status === "IN_PROGRESS"
        ? "accent"
        : status === "BLOCKED"
          ? "danger"
          : "muted";

  return <Badge variant={variant}>{formatTaskStatusLabel(status)}</Badge>;
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const variant =
    priority === "URGENT"
      ? "danger"
      : priority === "HIGH"
        ? "watch"
        : priority === "MEDIUM"
          ? "default"
          : "muted";

  return <Badge variant={variant}>{formatTaskPriorityLabel(priority)}</Badge>;
}
