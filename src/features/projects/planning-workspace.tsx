"use client";

import { FrenchDateInput } from "@/components/ui/french-date-input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useActionState,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type PointerEvent,
} from "react";

import {
  captureBaselineAction,
  createTaskAction,
  deleteDependencyAction,
  deleteTaskAction,
  moveTaskAction,
  rescheduleTaskFromGanttAction,
  saveDependencyAction,
  saveTaskAction,
} from "@/features/projects/actions";
import { initialFormState } from "@/features/projects/form-state";
import { LtResourceEditor } from "@/features/projects/lt-resource-editor";
import { getProjectB2PDates } from "@/lib/fgf/b2p";
import { fromWorkingDays, timeUnitShortLabel } from "@/lib/planning/time-unit";
import {
  formatDateLabel,
  formatLongDate,
  formatPercent,
} from "@/lib/format/formatters";
import {
  formatTaskTypeLabel,
  weekdayLabelsFr,
  workingDayOptionsFr,
} from "@/lib/format/labels";
import {
  addCalendarDays,
  compareIsoDates,
  isWorkingDay,
  parseIsoDate,
} from "@/lib/planning/date-utils";
import {
  getTaskDailyCapacityHours,
  getTaskTotalAllocationPct,
} from "@/lib/planning/work-model";
import type {
  Dependency,
  ProjectView,
  ScheduledTask,
  TaskConstraintType,
  TaskSchedulingMode,
  TaskWorkFormula,
} from "@/types/planning";
import { EmptyState } from "@/components/app/empty-state";
import { PriorityBadge, TaskStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 46;
const CELL_WIDTH = 34;
const DENSITY_CONFIG = {
  compact: { label: "Compact", rowHeight: 24, taskText: "text-xs", subText: "text-[10px]" },
  normal: { label: "Normal", rowHeight: 46, taskText: "text-sm", subText: "text-[10px]" },
  comfortable: { label: "Confort", rowHeight: 40, taskText: "text-sm", subText: "text-[11px]" },
} as const;
type DensityMode = keyof typeof DENSITY_CONFIG;
const WEEKDAY_LABELS = weekdayLabelsFr;
const WORKING_DAY_OPTIONS = workingDayOptionsFr;
const CONSTRAINT_OPTIONS: Array<{
  value: TaskConstraintType;
  label: string;
}> = [
  { value: "ASAP", label: "Dès que possible" },
  { value: "START_NO_EARLIER_THAN", label: "Début au plus tôt le" },
  { value: "START_NO_LATER_THAN", label: "Début au plus tard le" },
  { value: "FINISH_NO_EARLIER_THAN", label: "Fin au plus tôt le" },
  { value: "FINISH_NO_LATER_THAN", label: "Fin au plus tard le" },
  { value: "MUST_START_ON", label: "Doit débuter le" },
  { value: "MUST_FINISH_ON", label: "Doit finir le" },
];
const SCHEDULING_MODE_OPTIONS: Array<{
  value: TaskSchedulingMode;
  label: string;
}> = [
  { value: "AUTO", label: "Planifie automatiquement" },
  { value: "MANUAL", label: "Planifie manuellement" },
];
const WORK_FORMULA_OPTIONS: Array<{
  value: TaskWorkFormula;
  label: string;
}> = [
  { value: "FIXED_DURATION", label: "Durée fixe" },
  { value: "FIXED_WORK", label: "Charge fixe" },
  { value: "FIXED_UNITS", label: "Unités fixes" },
];

function diffCalendarDays(startDate: string, endDate: string) {
  return Math.round(
    (parseIsoDate(endDate).getTime() - parseIsoDate(startDate).getTime()) /
      (24 * 60 * 60 * 1000),
  );
}

function getTimelineDays(startDate: string, finishDate: string) {
  const days: string[] = [];
  let cursor = startDate;

  while (compareIsoDates(cursor, finishDate) <= 0) {
    days.push(cursor);
    cursor = addCalendarDays(cursor, 1);
  }

  return days;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function getConstraintLabel(constraintType: TaskConstraintType) {
  return (
    CONSTRAINT_OPTIONS.find((option) => option.value === constraintType)?.label ??
    "Dès que possible"
  );
}

function getSchedulingModeLabel(schedulingMode: TaskSchedulingMode) {
  return (
    SCHEDULING_MODE_OPTIONS.find((option) => option.value === schedulingMode)?.label ??
    "Planifie automatiquement"
  );
}

function getWorkFormulaLabel(workFormula: TaskWorkFormula) {
  return (
    WORK_FORMULA_OPTIONS.find((option) => option.value === workFormula)?.label ??
    "Durée fixe"
  );
}

function formatHours(value?: number | null) {
  if (value == null) {
    return "0h";
  }

  const rounded = Math.round(value * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2)}h`;
}

function serializeCalendarExceptions(
  exceptions: Array<{ date: string; label: string; isWorkingDay: boolean }>,
) {
  return [...exceptions]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map(
      (exception) =>
        `${exception.date} | ${exception.label} | ${
          exception.isWorkingDay ? "working" : "off"
        }`,
    )
    .join("\n");
}


function getFilteredTasks(view: ProjectView, query: string) {
  if (!query) {
    return view.tasks;
  }

  const lowerQuery = query.toLowerCase();
  const taskMap = new Map(view.tasks.map((task) => [task.id, task]));
  const included = new Set<string>();

  for (const task of view.tasks) {
    const haystack = `${task.wbsCode} ${task.name} ${task.description} ${task.notes}`.toLowerCase();
    if (haystack.includes(lowerQuery)) {
      let cursor: ScheduledTask | undefined = task;
      while (cursor) {
        included.add(cursor.id);
        cursor = cursor.parentId ? taskMap.get(cursor.parentId) : undefined;
      }
    }
  }

  return view.tasks.filter((task) => included.has(task.id));
}

function getDependencyPath(
  dependency: Dependency,
  taskPositions: Map<string, { index: number; task: ScheduledTask }>,
  timelineStart: string,
  cellWidth = CELL_WIDTH,
  rowHeight = ROW_HEIGHT,
) {
  const predecessor = taskPositions.get(dependency.predecessorTaskId);
  const successor = taskPositions.get(dependency.successorTaskId);

  if (
    !predecessor?.task.scheduledStartDate ||
    !predecessor.task.scheduledFinishDate ||
    !successor?.task.scheduledStartDate ||
    !successor.task.scheduledFinishDate
  ) {
    return null;
  }

  const predecessorStart = diffCalendarDays(
    timelineStart,
    predecessor.task.scheduledStartDate,
  );
  const predecessorFinish = diffCalendarDays(
    timelineStart,
    predecessor.task.scheduledFinishDate,
  );
  const successorStart = diffCalendarDays(
    timelineStart,
    successor.task.scheduledStartDate,
  );
  const successorFinish = diffCalendarDays(
    timelineStart,
    successor.task.scheduledFinishDate,
  );

  const predecessorStartX = predecessorStart * cellWidth + cellWidth / 2;
  const predecessorEndX = predecessorFinish * cellWidth + cellWidth - 6;
  const successorStartX = successorStart * cellWidth + 6;
  const successorEndX = successorFinish * cellWidth + cellWidth / 2;

  const startX =
    dependency.type === "SS" || dependency.type === "SF"
      ? predecessorStartX
      : predecessorEndX;
  const endX =
    dependency.type === "SS" || dependency.type === "FS"
      ? successorStartX
      : successorEndX;
  const startY = predecessor.index * rowHeight + rowHeight / 2;
  const endY = successor.index * rowHeight + rowHeight / 2;
  const elbowX = Math.max(startX + 14, endX - 14);

  return `M ${startX} ${startY} H ${elbowX} V ${endY} H ${endX}`;
}

type GanttDragMode = "move" | "resize-start" | "resize-finish";

interface GanttDragState {
  mode: GanttDragMode;
  originX: number;
  initialStartDate: string;
  initialFinishDate: string;
  previewStartDate: string;
  previewFinishDate: string;
}

function TimelineBar({
  task,
  baseline,
  timelineStart,
  cellWidth = CELL_WIDTH,
  showBaseline = true,
  owners,
  selected,
  pseudoCritical = false,
  statusDate: statusDateProp,
  onSelect,
  onScheduleCommit,
}: {
  task: ScheduledTask;
  baseline?: { startDate?: string | null; finishDate?: string | null };
  timelineStart: string;
  cellWidth?: number;
  showBaseline?: boolean;
  owners?: string[];
  selected: boolean;
  pseudoCritical?: boolean;
  statusDate?: string;
  onSelect: () => void;
  onScheduleCommit: (taskId: string, startDate: string, finishDate: string) => void;
}) {
  const [dragState, setDragState] = useState<GanttDragState | null>(null);

  if (!task.scheduledStartDate || !task.scheduledFinishDate) {
    return null;
  }

  const scheduledStartDate = task.scheduledStartDate;
  const scheduledFinishDate = task.scheduledFinishDate;
  const visibleStartDate = dragState?.previewStartDate ?? scheduledStartDate;
  const visibleFinishDate = dragState?.previewFinishDate ?? scheduledFinishDate;
  const startOffset = diffCalendarDays(timelineStart, visibleStartDate);
  const finishOffset = diffCalendarDays(timelineStart, visibleFinishDate);
  const width = Math.max((finishOffset - startOffset + 1) * cellWidth - 6, 14);
  const left = startOffset * cellWidth + 3;
  const canDirectEdit = task.type !== "SUMMARY";

  // Convention FGF (spec François 29/08) : la COULEUR encode l'ÉTAT (reste à faire = vert,
  // réalisé = rouge, PI/PàD = noir) ; la CRITICITÉ s'exprime par l'épaisseur/le style du trait
  // (critique = épais plein, pseudo-critique = épais pointillé).
  const barColor =
    task.type === "SUMMARY"
      ? "#1a4a20"
      : task.status === "DONE"
        ? "#be123c" // réalisé
        : "#3f8f48"; // reste à faire
  const critBorderClass = task.isCritical
    ? "h-7 border-2"
    : pseudoCritical
      ? "h-7 border-2 border-dotted"
      : "h-6 border";
  const critBorderColor =
    task.isCritical || pseudoCritical ? "#0f172a" : "rgba(255,255,255,0.55)";

  // ── Mode suivi B2P (convention FGF) — actif dès qu'un PI existe ──
  // PI noir · réalisé rouge · prévision verte. Jalons en triangle.
  const hasPI = Boolean(showBaseline && baseline?.startDate && baseline?.finishDate);
  const statusDate = statusDateProp ?? todayIso();
  const actualStart = task.actualStartDate ?? null;
  const rawActualEnd = task.actualFinishDate ?? statusDate;
  const actualEnd =
    actualStart && rawActualEnd < actualStart ? actualStart : rawActualEnd;
  const actualLeft = actualStart
    ? diffCalendarDays(timelineStart, actualStart) * cellWidth + 3
    : 0;
  const actualWidth = actualStart
    ? Math.max(
        (diffCalendarDays(timelineStart, actualEnd) -
          diffCalendarDays(timelineStart, actualStart) +
          1) *
          cellWidth -
          6,
        10,
      )
    : 0;
  const forecastBackground =
    hasPI && task.type !== "SUMMARY" ? "#047857" : undefined;

  function getPreviewDates(state: GanttDragState, clientX: number) {
    const deltaDays = Math.round((clientX - state.originX) / cellWidth);
    let startDate = state.initialStartDate;
    let finishDate = state.initialFinishDate;

    if (state.mode === "move" || task.type === "MILESTONE") {
      startDate = addCalendarDays(state.initialStartDate, deltaDays);
      finishDate =
        task.type === "MILESTONE"
          ? startDate
          : addCalendarDays(state.initialFinishDate, deltaDays);
    } else if (state.mode === "resize-start") {
      startDate = addCalendarDays(state.initialStartDate, deltaDays);
      if (compareIsoDates(startDate, finishDate) > 0) {
        startDate = finishDate;
      }
    } else {
      finishDate = addCalendarDays(state.initialFinishDate, deltaDays);
      if (compareIsoDates(finishDate, startDate) < 0) {
        finishDate = startDate;
      }
    }

    return { startDate, finishDate };
  }

  function beginDrag(event: PointerEvent<HTMLDivElement>, mode: GanttDragMode) {
    if (!canDirectEdit) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onSelect();
    const captureTarget =
      event.currentTarget.closest<HTMLDivElement>("[data-gantt-draggable='true']") ??
      event.currentTarget;
    captureTarget.setPointerCapture(event.pointerId);
    setDragState({
      mode,
      originX: event.clientX,
      initialStartDate: scheduledStartDate,
      initialFinishDate: scheduledFinishDate,
      previewStartDate: scheduledStartDate,
      previewFinishDate: scheduledFinishDate,
    });
  }

  function updateDrag(event: PointerEvent<HTMLDivElement>) {
    if (!dragState) {
      return;
    }

    const preview = getPreviewDates(dragState, event.clientX);
    setDragState({ ...dragState, previewStartDate: preview.startDate, previewFinishDate: preview.finishDate });
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>) {
    if (!dragState) {
      return;
    }

    const preview = getPreviewDates(dragState, event.clientX);
    setDragState(null);
    if (
      preview.startDate !== dragState.initialStartDate ||
      preview.finishDate !== dragState.initialFinishDate
    ) {
      onScheduleCommit(task.id, preview.startDate, preview.finishDate);
    }
  }

  return (
    <>
      {showBaseline && baseline?.startDate && baseline.finishDate ? (
        // PI (Planning Initial) — trait NOIR, convention FGF.
        task.type === "MILESTONE" ? (
          <div
            className="absolute z-10"
            style={{
              left:
                diffCalendarDays(timelineStart, baseline.startDate) * cellWidth +
                cellWidth / 4 +
                2,
              top: "18%",
              width: 0,
              height: 0,
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderBottom: "9px solid #111827",
            }}
            title={`PI : ${baseline.startDate}`}
          />
        ) : (
          <div
            className="absolute z-10 rounded-full"
            style={{
              top: "22%",
              height: 4,
              background: "#111827",
              left:
                diffCalendarDays(timelineStart, baseline.startDate) * cellWidth + 4,
              width: Math.max(
                (diffCalendarDays(timelineStart, baseline.finishDate) -
                  diffCalendarDays(timelineStart, baseline.startDate) +
                  1) *
                  cellWidth -
                  8,
                12,
              ),
            }}
            title={`PI : ${baseline.startDate} → ${baseline.finishDate}`}
          />
        )
      ) : null}
      {/* Réalisé — trait ROUGE (terminé : début réel → fin réelle ; en cours : début réel → date du B2P) */}
      {hasPI && actualStart && task.type !== "SUMMARY" ? (
        <div
          className="pointer-events-none absolute z-30 rounded-full"
          style={{
            top: "50%",
            transform: "translateY(-50%)",
            height: 5,
            background: "#be123c",
            boxShadow: "0 0 0 1px rgba(255,255,255,0.55)",
            left: actualLeft,
            width: actualWidth,
          }}
          title={`Réalisé : ${actualStart} → ${task.actualFinishDate ?? `${statusDate} (en cours)`}`}
        />
      ) : null}
      {task.type === "MILESTONE" ? (
        hasPI ? (
          // Jalon en mode suivi B2P : TRIANGLE (durée nulle) — rouge si atteint, vert sinon.
          <div
            className={cn(
              "absolute z-20",
              canDirectEdit && "cursor-grab active:cursor-grabbing",
            )}
            style={{
              left: left + cellWidth / 4,
              top: "52%",
              width: 0,
              height: 0,
              borderLeft: "7px solid transparent",
              borderRight: "7px solid transparent",
              borderBottom: `12px solid ${task.status === "DONE" ? "#be123c" : "#047857"}`,
              filter: selected
                ? "drop-shadow(0 0 4px rgba(244,163,33,0.9))"
                : "drop-shadow(0 1px 2px rgba(0,0,0,0.3))",
            }}
            data-gantt-draggable="true"
            title="Jalon (durée nulle) — glisser pour changer sa date"
            onPointerDown={(event) => beginDrag(event, "move")}
            onPointerMove={updateDrag}
            onPointerUp={finishDrag}
            onPointerCancel={() => setDragState(null)}
          />
        ) : (
          <div
            className={cn(
              "absolute top-1/2 z-20 size-4 -translate-y-1/2 rotate-45 rounded-sm border border-white/70 shadow-sm",
              canDirectEdit && "cursor-grab active:cursor-grabbing",
              selected && "ring-2 ring-amber-300",
            )}
            style={{ left: left + cellWidth / 4, background: barColor, borderColor: critBorderColor }}
            data-gantt-draggable="true"
            title="Glisser le jalon pour changer sa date"
            onPointerDown={(event) => beginDrag(event, "move")}
            onPointerMove={updateDrag}
            onPointerUp={finishDrag}
            onPointerCancel={() => setDragState(null)}
          />
        )
      ) : task.type === "SUMMARY" ? (
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
          style={{ left, width, background: "#1a4a20" }}
        >
          <div className="absolute -left-1 top-1/2 h-3 w-1.5 -translate-y-1/2 rounded-sm" style={{ background: "#1a4a20" }} />
          <div className="absolute -right-1 top-1/2 h-3 w-1.5 -translate-y-1/2 rounded-sm" style={{ background: "#1a4a20" }} />
        </div>
      ) : (
        <div
          className={cn(
            "absolute top-1/2 z-20 -translate-y-1/2 overflow-visible rounded-[6px] shadow-sm",
            // Criticité en TRAIT ÉPAIS plein (critique) ou épais pointillé (pseudo-critique).
            critBorderClass,
            "cursor-grab active:cursor-grabbing",
            selected && "ring-2 ring-amber-300",
          )}
          style={{ left, width, background: forecastBackground ?? barColor, borderColor: critBorderColor }}
          data-gantt-draggable="true"
          title={hasPI ? "Prévision (vert) — glisser pour replanifier" : "Glisser pour déplacer. Attraper les bords pour redimensionner."}
          onPointerDown={(event) => beginDrag(event, "move")}
          onPointerMove={updateDrag}
          onPointerUp={finishDrag}
          onPointerCancel={() => setDragState(null)}
        >
          <div
            className="absolute inset-y-0 left-0 z-30 w-2 cursor-ew-resize bg-white/25"
            title="Redimensionner depuis le début"
            onPointerDown={(event) => beginDrag(event, "resize-start")}
          />
          <div
            className="absolute inset-y-0 right-0 z-30 w-2 cursor-ew-resize bg-white/25"
            title="Redimensionner depuis la fin"
            onPointerDown={(event) => beginDrag(event, "resize-finish")}
          />
          <div className="absolute inset-0 overflow-hidden rounded-[5px]">
            <div
              className="h-full bg-black/20"
              style={{ width: `${task.progressPercent}%` }}
            />
          </div>
          {owners?.length ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-end px-2">
              <span className="truncate text-[10px] font-semibold text-white/85 drop-shadow">
                {owners.slice(0, 2).join(", ")}
              </span>
            </div>
          ) : null}
          {dragState ? (
            <div className="pointer-events-none absolute -top-7 left-1/2 z-40 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-950 px-2 py-1 text-[10px] font-semibold text-white shadow">
              {formatDateLabel(visibleStartDate)} {"->"} {formatDateLabel(visibleFinishDate)}
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   GANTT BOARD — rendu virtualisé (une seule couche de fond, lignes visibles
   seulement). Un planning de 3 000 LT ne produit qu'une cinquantaine de lignes
   DOM ; le fond (week-ends, séparateurs, lignes) est dessiné une seule fois.
   ══════════════════════════════════════════════════════════════════════════ */
const GANTT_OVERSCAN = 12;
const GANTT_HEADER_HEIGHT = 48;

type GanttBoardProps = {
  view: ProjectView;
  tasks: ScheduledTask[];
  selectedTaskId?: string;
  onSelect: (taskId: string) => void;
  onOpenInspector: (taskId: string) => void;
  panelMode: PanelMode;
  rowHeight: number;
  density: (typeof DENSITY_CONFIG)[DensityMode];
  /** Facteur de zoom (1 = projet entier dans la largeur visible). */
  zoom: number;
  timelineStart: string;
  timelineDays: string[];
  scale: "day" | "week" | "month";
  headerGroups: { key: string; label: string; startIndex: number; span: number }[];
  boundaryIndices: Set<number>;
  dependencies: Dependency[];
  todayOffset: number;
  b2pDates: string[];
  currentB2pIndex: number;
  statusDate: string;
  showBaseline: boolean;
  pseudoTaskIds: Set<string>;
  unitLabel: string;
  toUnit: (days: number) => number;
  onScheduleCommit: (taskId: string, startDate: string, finishDate: string) => void;
};

function formatUnitValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

function GanttBoard(props: GanttBoardProps) {
  const {
    view, tasks, selectedTaskId, onSelect, onOpenInspector, panelMode, rowHeight, density,
    zoom, timelineStart, timelineDays, scale, headerGroups, boundaryIndices,
    dependencies, todayOffset, b2pDates, currentB2pIndex, statusDate, showBaseline,
    pseudoTaskIds, unitLabel, toUnit, onScheduleCommit,
  } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 900, width: 1100 });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () =>
      setViewport({ top: el.scrollTop, height: el.clientHeight || 900, width: el.clientWidth || 1100 });
    update();
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, []);

  // Garder la ligne sélectionnée visible (navigation clavier).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !selectedTaskId) return;
    const index = tasks.findIndex((t) => t.id === selectedTaskId);
    if (index < 0) return;
    const top = index * rowHeight;
    const bottom = top + rowHeight;
    const viewTop = el.scrollTop;
    const viewBottom = viewTop + el.clientHeight - GANTT_HEADER_HEIGHT;
    if (top < viewTop) el.scrollTop = top;
    else if (bottom > viewBottom) el.scrollTop = bottom - (el.clientHeight - GANTT_HEADER_HEIGHT);
  }, [selectedTaskId, tasks, rowHeight]);

  const showTimeline = panelMode !== "grid";
  const isNarrow = panelMode === "gantt";
  const leftWidth = panelMode === "grid" ? 0 : isNarrow ? 300 : 500;
  // Échelle adaptative : à zoom 1, tout le projet tient dans la largeur RÉELLEMENT visible.
  const available = Math.max(240, viewport.width - leftWidth - 12);
  const cellWidth = Math.max(1.5, (available / Math.max(1, timelineDays.length)) * zoom);
  const timelineWidth = Math.ceil(timelineDays.length * cellWidth);
  const bodyHeight = tasks.length * rowHeight;
  const firstIndex = Math.max(0, Math.floor(viewport.top / rowHeight) - GANTT_OVERSCAN);
  const lastIndex = Math.min(
    tasks.length - 1,
    Math.ceil((viewport.top + viewport.height) / rowHeight) + GANTT_OVERSCAN,
  );
  const visibleTasks = tasks.slice(firstIndex, lastIndex + 1);

  const positions = new Map<string, { index: number; task: ScheduledTask }>();
  tasks.forEach((task, index) => positions.set(task.id, { index, task }));

  // Owners : un seul passage sur les affectations (pas un filtre par ligne).
  const ownersByTask = new Map<string, string[]>();
  {
    const resourceNames = new Map(view.aggregate.resources.map((r) => [r.id, r.name]));
    for (const a of view.aggregate.assignments) {
      const name = resourceNames.get(a.resourceId);
      if (!name) continue;
      const list = ownersByTask.get(a.taskId) ?? [];
      list.push(name);
      ownersByTask.set(a.taskId, list);
    }
  }

  // Fond unique : week-ends / jours fériés (échelle jour) + séparateurs.
  const offDayRects: number[] = [];
  if (scale === "day") {
    timelineDays.forEach((iso, i) => {
      if (!isWorkingDay(iso, view.aggregate.calendar)) offDayRects.push(i);
    });
  }
  const boundaryList = [...boundaryIndices];

  // En-tête à deux niveaux, libellés seulement s'ils tiennent.
  const monthGroups: { key: string; label: string; startIndex: number; span: number }[] = [];
  timelineDays.forEach((iso, i) => {
    const d = parseIsoDate(iso);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    const last = monthGroups[monthGroups.length - 1];
    if (last && last.key === key) last.span += 1;
    else
      monthGroups.push({
        key,
        label: d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" }),
        startIndex: i,
        span: 1,
      });
  });
  const lowerTier: { key: string; label: string; startIndex: number; span: number; off?: boolean }[] = [];
  if (scale === "day" && cellWidth >= 16) {
    timelineDays.forEach((iso, i) => {
      const d = parseIsoDate(iso);
      lowerTier.push({
        key: iso,
        label: cellWidth >= 30 ? `${WEEKDAY_LABELS[d.getUTCDay()].slice(0, 2)} ${d.getUTCDate()}` : String(d.getUTCDate()),
        startIndex: i,
        span: 1,
        off: !isWorkingDay(iso, view.aggregate.calendar),
      });
    });
  } else if (scale !== "month" && cellWidth * 7 >= 34) {
    const groups = scale === "week" ? headerGroups : [];
    if (groups.length) {
      for (const g of groups) lowerTier.push({ ...g, label: g.label.replace("sem. ", "") });
    } else {
      timelineDays.forEach((iso, i) => {
        const d = parseIsoDate(iso);
        const dow = (d.getUTCDay() + 6) % 7;
        if (i === 0 || dow === 0) {
          lowerTier.push({
            key: iso,
            label: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }),
            startIndex: i,
            span: 1,
          });
        } else {
          lowerTier[lowerTier.length - 1].span += 1;
        }
      });
    }
  }
  const monthLabelFits = (span: number) => span * cellWidth >= 34;

  // Mode « Tableau » : toutes les colonnes ; mode « Tableau + Gantt » : sans la colonne Début
  // (visible sur la barre) pour laisser la place au nom du LT.
  const fullColumns = panelMode === "grid";
  const gridCols = isNarrow
    ? "grid-cols-[52px_minmax(0,1fr)_64px]"
    : fullColumns
      ? "grid-cols-[60px_minmax(0,1fr)_90px_90px_70px_72px]"
      : "grid-cols-[48px_minmax(0,1fr)_80px_52px_60px]";

  function slackClass(slack: number) {
    if (slack < 0) return "text-white bg-[#e2424a] rounded px-1";
    if (slack === 0) return "text-[#b42318]";
    return "text-slate-700";
  }

  return (
    <div
      ref={scrollRef}
      className="relative flex-1 overflow-auto bg-[#f7f6f1]"
      style={{ minHeight: 420, height: "calc(100vh - 290px)" }}
      role="grid"
      aria-rowcount={tasks.length}
    >
      <div style={{ width: showTimeline ? leftWidth + timelineWidth : "100%", position: "relative" }}>
        {/* ── En-tête collant ── */}
        <div className="sticky top-0 z-40 flex" style={{ height: GANTT_HEADER_HEIGHT }}>
          <div
            className={cn(
              "sticky left-0 z-50 grid items-center gap-2 border-b border-r border-border/70 bg-white px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500",
              gridCols,
            )}
            style={{ width: showTimeline ? leftWidth : "100%", height: GANTT_HEADER_HEIGHT }}
          >
            <div>WBS</div>
            <div>Lot de tâches</div>
            {isNarrow ? (
              <div className="text-right">Marge</div>
            ) : (
              <>
                {fullColumns ? <div>Début</div> : null}
                <div>Fin</div>
                <div>Durée</div>
                <div className="text-right">Marge</div>
              </>
            )}
          </div>
          {showTimeline ? (
            <div
              className="relative border-b border-border/70 bg-[#f7f6f1]"
              style={{ width: timelineWidth, height: GANTT_HEADER_HEIGHT }}
            >
              <div className="absolute inset-x-0 top-0 h-6">
                {monthGroups.map((g) => (
                  <div
                    key={g.key}
                    className="absolute top-0 flex h-6 items-center overflow-hidden border-r border-slate-300/70 px-1.5 text-[10.5px] font-bold capitalize text-[#1a4a20]"
                    style={{ left: g.startIndex * cellWidth, width: g.span * cellWidth }}
                    title={g.label}
                  >
                    {monthLabelFits(g.span) ? <span className="truncate">{g.label}</span> : null}
                  </div>
                ))}
              </div>
              <div className="absolute inset-x-0 bottom-0 h-6 border-t border-slate-200/80">
                {lowerTier.map((g) => (
                  <div
                    key={g.key}
                    className="absolute top-0 flex h-6 items-center justify-center overflow-hidden border-r border-slate-200 text-[10px] font-semibold tabular-nums"
                    style={{
                      left: g.startIndex * cellWidth,
                      width: g.span * cellWidth,
                      color: g.off ? "rgba(15,23,42,0.32)" : "rgba(15,23,42,0.6)",
                      background: g.off ? "rgba(26,74,32,0.05)" : undefined,
                    }}
                  >
                    {g.label}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* ── Corps ── */}
        <div className="relative" style={{ height: bodyHeight }}>
          {showTimeline ? (
            <>
              {/* Fond unique (une seule couche, pas une cellule par jour et par LT). */}
              <svg
                className="pointer-events-none absolute top-0 z-0"
                style={{ left: leftWidth }}
                width={timelineWidth}
                height={bodyHeight}
                aria-hidden="true"
              >
                {offDayRects.map((i) => (
                  <rect key={`off-${i}`} x={i * cellWidth} y={0} width={cellWidth} height={bodyHeight} fill="rgba(26,74,32,0.045)" />
                ))}
                {boundaryList.map((i) => (
                  <line key={`b-${i}`} x1={i * cellWidth + 0.5} x2={i * cellWidth + 0.5} y1={0} y2={bodyHeight} stroke="rgba(15,23,42,0.10)" />
                ))}
              </svg>
              {/* Liens de dépendance (seulement ceux qui touchent la fenêtre visible). */}
              <svg
                className="pointer-events-none absolute top-0 z-10"
                style={{ left: leftWidth }}
                width={timelineWidth}
                height={bodyHeight}
                aria-hidden="true"
              >
                {dependencies.map((dependency) => {
                  const a = positions.get(dependency.predecessorTaskId);
                  const b = positions.get(dependency.successorTaskId);
                  if (!a || !b) return null;
                  const lo = Math.min(a.index, b.index);
                  const hi = Math.max(a.index, b.index);
                  if (hi < firstIndex || lo > lastIndex) return null;
                  const path = getDependencyPath(dependency, positions, timelineStart, cellWidth, rowHeight);
                  if (!path) return null;
                  return (
                    <path key={dependency.id} d={path} fill="none" stroke="rgba(15,23,42,0.38)" strokeWidth="1.3" strokeLinecap="round" />
                  );
                })}
              </svg>
              {/* Date d'état / aujourd'hui */}
              {todayOffset >= 0 && todayOffset < timelineDays.length ? (
                <div
                  className="pointer-events-none absolute inset-y-0 z-30"
                  style={{ left: leftWidth + todayOffset * cellWidth + Math.round(cellWidth / 2) }}
                  aria-hidden="true"
                >
                  <div className="h-full w-px" style={{ background: "#f4a321" }} />
                  <span
                    className="sticky top-[52px] ml-1 inline-block rounded px-1 text-[9px] font-black text-white"
                    style={{ background: "#e0902a" }}
                    title={`Date d'état : ${statusDate}`}
                  >
                    DATE D&apos;ÉTAT
                  </span>
                </div>
              ) : null}
              {/* Traits des B2P */}
              {b2pDates.map((date, i) => {
                const offset = diffCalendarDays(timelineStart, date);
                if (offset < 0 || offset >= timelineDays.length) return null;
                const isPast = date < statusDate;
                const isCurrent = i === currentB2pIndex;
                const lineColor = isCurrent ? "#f4a321" : isPast ? "#56a45b" : "rgba(15,23,42,0.30)";
                const chipBg = isCurrent ? "#e0902a" : isPast ? "#3f8f48" : "rgba(15,23,42,0.45)";
                return (
                  <div
                    key={`b2p-${i}-${date}`}
                    className="pointer-events-none absolute inset-y-0 z-20"
                    style={{ left: leftWidth + offset * cellWidth + Math.round(cellWidth / 2) }}
                    aria-hidden="true"
                  >
                    <div
                      className="h-full"
                      style={{
                        width: isCurrent ? 2 : 1,
                        background: isCurrent || isPast ? lineColor : "transparent",
                        borderLeft: isCurrent || isPast ? "none" : `1px dashed ${lineColor}`,
                      }}
                    />
                    <span
                      className="absolute top-0.5 left-1 rounded px-1 text-[9px] font-black text-white"
                      style={{ background: chipBg }}
                      title={`B2P${i}${isCurrent ? " · courant" : isPast ? " · passé" : " · à venir"} — ${date}`}
                    >
                      B2P{i}
                      {isPast ? " ✓" : ""}
                    </span>
                  </div>
                );
              })}
            </>
          ) : null}

          {/* Lignes visibles uniquement */}
          {visibleTasks.map((task, i) => {
            const index = firstIndex + i;
            const selected = selectedTaskId === task.id;
            const owners = ownersByTask.get(task.id) ?? [];
            const slack = task.totalSlackDays ?? 0;
            const slackUnits = toUnit(slack);
            return (
              <div
                key={task.id}
                role="row"
                aria-rowindex={index + 1}
                aria-selected={selected}
                className={cn("absolute left-0 flex border-b border-border/50", selected ? "bg-[#56a45b]/[0.09]" : "hover:bg-slate-100/50")}
                style={{ top: index * rowHeight, height: rowHeight, width: showTimeline ? leftWidth + timelineWidth : "100%" }}
                onClick={() => onSelect(task.id)}
                onDoubleClick={() => onOpenInspector(task.id)}
              >
                <button
                  type="button"
                  className={cn(
                    "sticky left-0 z-30 grid h-full items-center gap-2 border-r border-border/70 px-3 text-left",
                    gridCols,
                    selected ? "bg-[#eef6ee]" : "bg-white",
                  )}
                  style={{ width: showTimeline ? leftWidth : "100%" }}
                  title={`${task.wbsCode} — ${task.name} (double-clic pour éditer)`}
                >
                  <span className="truncate font-mono text-[11px] font-semibold text-slate-500">{task.wbsCode}</span>
                  <span className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: Math.min(task.depth, 6) * 12 }}>
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: task.isCritical ? "#e2424a" : pseudoTaskIds.has(task.id) ? "#f4a321" : task.status === "DONE" ? "#56a45b" : "#94a3b8" }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className={cn("block truncate font-semibold text-slate-900", density.taskText, task.isSummary && "font-black text-[#1a4a20]")}>
                        {task.name}
                      </span>
                      {!isNarrow && rowHeight >= 40 ? (
                        <span className={cn("block truncate text-slate-500", density.subText)}>
                          {owners.length ? owners.join(", ") : formatTaskTypeLabel(task.type)}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  {isNarrow ? null : (
                    <>
                      {fullColumns ? (
                        <span className="font-mono text-[11px] tabular-nums text-slate-700">{formatDateLabel(task.scheduledStartDate)}</span>
                      ) : null}
                      <span className="font-mono text-[11px] tabular-nums text-slate-700">{formatDateLabel(task.scheduledFinishDate)}</span>
                      <span className="font-mono text-[11px] tabular-nums text-slate-700">
                        {formatUnitValue(toUnit(task.durationDays))} {unitLabel}
                      </span>
                    </>
                  )}
                  <span className={cn("justify-self-end font-mono text-[11px] font-bold tabular-nums", slackClass(slack))} title={slack < 0 ? "Marge négative : la date imposée ne peut pas être tenue" : undefined}>
                    {slack > 0 ? "" : slack < 0 ? "−" : ""}
                    {formatUnitValue(Math.abs(slackUnits))} {unitLabel}
                  </span>
                </button>
                {showTimeline ? (
                  <div className="relative h-full" style={{ width: timelineWidth }}>
                    <TimelineBar
                      task={task}
                      baseline={view.baselineVarianceByTaskId[task.id]?.snapshot}
                      timelineStart={timelineStart}
                      cellWidth={cellWidth}
                      showBaseline={showBaseline}
                      owners={owners}
                      selected={selected}
                      pseudoCritical={pseudoTaskIds.has(task.id)}
                      statusDate={statusDate}
                      onSelect={() => onSelect(task.id)}
                      onScheduleCommit={onScheduleCommit}
                    />
                    {task.progressPercent > 0 && task.type !== "SUMMARY" && rowHeight >= 30 ? (
                      <div className="pointer-events-none absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-semibold text-slate-700 shadow-sm">
                        {formatPercent(task.progressPercent)}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type PanelMode = 'all' | 'grid' | 'gantt' | 'inspector';
type PanelModeConfig = { mode: PanelMode; label: string; title: string; icon: string };

export function PlanningWorkspace({ view }: { view: ProjectView }) {
  const router = useRouter();
  const initialSelectedTaskId =
    view.tasks.find((task) => !task.isSummary)?.id ?? view.tasks[0]?.id ?? "";
  const [selectedTaskId, setSelectedTaskId] = useState(initialSelectedTaskId);
  const [query, setQuery] = useState("");
  const [density, setDensity] = useState<DensityMode>("normal");
  const [zoom, setZoom] = useState(1);
  const [showBaseline, setShowBaseline] = useState(true);
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);
  const [keyboardNotice, setKeyboardNotice] = useState("Raccourcis actifs: G P/D/R/B/L/A/S/N, N, Delete, Ctrl+1/2/3, Ctrl+M, Alt+fleches. ? pour aide.");
  const [goPrefix, setGoPrefix] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [selectedPredecessorProjectId, setSelectedPredecessorProjectId] = useState(
    view.aggregate.project.id,
  );
  const deferredQuery = useDeferredValue(query);
  const baseFilteredTasks = getFilteredTasks(view, deferredQuery);
  const filteredTasks = showCriticalOnly
    ? baseFilteredTasks.filter((task) => task.isCritical || task.type === "MILESTONE")
    : baseFilteredTasks;
  const selectedTask =
    filteredTasks.find((task) => task.id === selectedTaskId) ??
    view.tasks.find((task) => task.id === selectedTaskId) ??
    filteredTasks[0] ??
    view.tasks[0];
  const [taskState, taskAction, taskPending] = useActionState(
    saveTaskAction,
    initialFormState,
  );
  const [moveState, moveAction, movePending] = useActionState(
    moveTaskAction,
    initialFormState,
  );
  const [dependencyState, dependencyAction, dependencyPending] = useActionState(
    saveDependencyAction,
    initialFormState,
  );
  const [ganttState, setGanttState] = useState(initialFormState);
  const [ganttPending, setGanttPending] = useState(false);

  // Panel focus mode — controls layout of the 3 panels
  const [panelMode, setPanelMode] = useState<PanelMode>('all');
  // L'inspecteur ne vole plus la place du Gantt : il s'ouvre à la demande
  // (bouton « Éditer le LT » ou double-clic sur une ligne).
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const PANEL_MODES: PanelModeConfig[] = [
    { mode: 'all',       label: 'Tableau + Gantt', title: 'Tableau des LT et Gantt côte à côte', icon: 'M3 3h7v7H3V3zm11 0h7v7h-7V3zm0 11h7v7h-7v-7zM3 14h7v7H3v-7z' },
    { mode: 'grid',      label: 'Tableau',         title: 'Tableau des LT seul (Gantt masqué)',  icon: 'M3 5h18M3 10h18M3 15h18M3 20h18' },
    { mode: 'gantt',     label: 'Gantt',           title: 'Gantt pleine largeur',                icon: 'M3 6h18M3 12h12M3 18h8' },
    { mode: 'inspector', label: 'Éditer le LT',    title: 'Éditer le LT sélectionné : prédécesseurs, ressources, dates, durée…', icon: 'M15 3H3v18h12V3zm6 4h-4m4 4h-4m4 4h-4' },
  ];
  const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const TRANS = `all 0.38s ${EASING}`;

  // Annuler / rétablir RÉELS pour les déplacements Gantt de la session
  // (les éditions de l'inspecteur restent tracées dans l'onglet Activité).
  const undoStackRef = useRef<{ taskId: string; from: [string, string]; to: [string, string] }[]>([]);
  const redoStackRef = useRef<{ taskId: string; from: [string, string]; to: [string, string] }[]>([]);

  function commitGanttSchedule(taskId: string, startDate: string, finishDate: string, record = true) {
    if (record) {
      const current = view.tasks.find((t) => t.id === taskId);
      if (current?.scheduledStartDate && current.scheduledFinishDate) {
        undoStackRef.current.push({
          taskId,
          from: [current.scheduledStartDate, current.scheduledFinishDate],
          to: [startDate, finishDate],
        });
        if (undoStackRef.current.length > 50) undoStackRef.current.shift();
        redoStackRef.current = [];
      }
    }
    const formData = new FormData();
    formData.set("projectId", view.aggregate.project.id);
    formData.set("taskId", taskId);
    formData.set("startDate", startDate);
    formData.set("finishDate", finishDate);

    setGanttPending(true);
    startTransition(() => {
      void rescheduleTaskFromGanttAction(formData)
        .then(setGanttState)
        .finally(() => setGanttPending(false));
    });
  }

  function pushKeyboardNotice(message: string) {
    setKeyboardNotice(message);
  }

  function createTaskFromShortcut(input: {
    parentId?: string | null;
    name?: string;
    type?: ScheduledTask["type"];
  } = {}) {
    const formData = new FormData();
    formData.set("projectId", view.aggregate.project.id);
    if (input.parentId) formData.set("parentId", input.parentId);
    if (input.name) formData.set("name", input.name);
    if (input.type) formData.set("type", input.type);
    startTransition(() => {
      void createTaskAction(formData).then(() => router.refresh());
    });
  }

  function moveSelectedTaskFromShortcut(direction: "UP" | "DOWN" | "INDENT" | "OUTDENT") {
    if (!selectedTask) return;
    const formData = new FormData();
    formData.set("projectId", view.aggregate.project.id);
    formData.set("taskId", selectedTask.id);
    formData.set("direction", direction);
    startTransition(() => {
      void moveTaskAction(initialFormState, formData).then((state) => {
        pushKeyboardNotice(state.message || `Mouvement ${direction} applique.`);
        router.refresh();
      });
    });
  }

  function taskFormDataFromSelection(overrides: Partial<ScheduledTask> = {}) {
    if (!selectedTask) return null;
    const task = { ...selectedTask, ...overrides };
    const formData = new FormData();
    formData.set("projectId", view.aggregate.project.id);
    formData.set("taskId", task.id);
    formData.set("name", task.name);
    formData.set("description", task.description);
    formData.set("notes", task.notes);
    formData.set("parentId", task.parentId ?? "");
    formData.set("sortOrder", String(task.sortOrder));
    formData.set("type", task.type);
    formData.set("status", task.status);
    formData.set("priority", task.priority);
    formData.set("progressPercent", String(task.progressPercent));
    formData.set("durationDays", String(task.type === "MILESTONE" ? 0 : task.durationDays));
    formData.set("schedulingMode", task.schedulingMode);
    formData.set("workFormula", task.workFormula);
    formData.set("effortHours", String(task.type === "MILESTONE" ? 0 : task.effortHours ?? 0));
    formData.set("calendarMode", task.calendarMode);
    formData.set("levelingPriority", String(task.levelingPriority));
    formData.set("constraintType", task.constraintType);
    formData.set("constraintDate", task.constraintDate ?? "");
    formData.set("deadlineDate", task.deadlineDate ?? "");
    formData.set("manualStartDate", task.manualStartDate ?? "");
    formData.set("manualFinishDate", task.manualFinishDate ?? "");
    formData.set("actualStartDate", task.actualStartDate ?? "");
    formData.set("actualFinishDate", task.actualFinishDate ?? "");
    formData.set("actualWorkHours", String(task.actualWorkHours ?? 0));
    formData.set("remainingWorkHours", String(task.type === "MILESTONE" ? 0 : task.remainingWorkHours ?? 0));
    for (const day of task.calendarWorkingDays) {
      formData.append("taskCalendarWorkingDays", String(day));
    }
    formData.set("taskCalendarHoursPerDay", String(task.calendarHoursPerDay ?? ""));
    formData.set("taskCalendarExceptions", serializeCalendarExceptions(task.calendarExceptions));
    return formData;
  }

  function markSelectedAsMilestone() {
    const formData = taskFormDataFromSelection({ type: "MILESTONE", durationDays: 0, effortHours: 0, remainingWorkHours: 0 });
    if (!formData) return;
    startTransition(() => {
      void saveTaskAction(initialFormState, formData).then((state) => {
        pushKeyboardNotice(state.message || "Tâche convertie en jalon.");
        router.refresh();
      });
    });
  }

  const onKeyboardNavigate = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select")) {
      return;
    }

    const key = event.key.toLowerCase();

    if (event.ctrlKey && ["1", "2", "3"].includes(event.key)) {
      event.preventDefault();
      const nextDensity = event.key === "1" ? "compact" : event.key === "2" ? "normal" : "comfortable";
      setDensity(nextDensity);
      pushKeyboardNotice(`Densite ${DENSITY_CONFIG[nextDensity].label} active.`);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && key === "z" && !event.shiftKey) {
      event.preventDefault();
      const last = undoStackRef.current.pop();
      if (!last) {
        pushKeyboardNotice("Rien à annuler : seuls les déplacements Gantt de cette session sont annulables (les autres modifications sont tracées dans l'onglet Activité).");
        return;
      }
      redoStackRef.current.push(last);
      commitGanttSchedule(last.taskId, last.from[0], last.from[1], false);
      pushKeyboardNotice("Déplacement annulé.");
      return;
    }

    if ((event.ctrlKey || event.metaKey) && (key === "y" || (key === "z" && event.shiftKey))) {
      event.preventDefault();
      const next = redoStackRef.current.pop();
      if (!next) {
        pushKeyboardNotice("Rien à rétablir.");
        return;
      }
      undoStackRef.current.push(next);
      commitGanttSchedule(next.taskId, next.to[0], next.to[1], false);
      pushKeyboardNotice("Déplacement rétabli.");
      return;
    }

    if (event.ctrlKey && key === "m") {
      event.preventDefault();
      markSelectedAsMilestone();
      return;
    }

    if (event.ctrlKey && key === "d") {
      event.preventDefault();
      if (selectedTask) {
        createTaskFromShortcut({
          parentId: selectedTask.parentId,
          name: `${selectedTask.name} - copie`,
          type: selectedTask.type,
        });
        pushKeyboardNotice("Duplication créée après la selection.");
      }
      return;
    }

    if (event.ctrlKey && key === "g") {
      event.preventDefault();
      createTaskFromShortcut({
        parentId: selectedTask?.parentId ?? null,
        name: selectedTask ? `Groupe - ${selectedTask.name}` : "Nouveau groupe",
        type: "SUMMARY",
      });
      pushKeyboardNotice("Groupe récapitulatif créé au niveau courant.");
      return;
    }

    if (event.ctrlKey && event.key === "ArrowUp") {
      event.preventDefault();
      moveSelectedTaskFromShortcut("UP");
      return;
    }

    if (event.ctrlKey && event.key === "ArrowDown") {
      event.preventDefault();
      moveSelectedTaskFromShortcut("DOWN");
      return;
    }

    if (event.altKey && event.key === "ArrowRight") {
      event.preventDefault();
      moveSelectedTaskFromShortcut("INDENT");
      return;
    }

    if (event.altKey && event.key === "ArrowLeft") {
      event.preventDefault();
      moveSelectedTaskFromShortcut("OUTDENT");
      return;
    }

    if (key === "g") {
      event.preventDefault();
      setGoPrefix(true);
      pushKeyboardNotice("Navigation: P planning, D dashboard, R ressources, B baselines, L à venir, A analytics, S soutenance, N réseau.");
      return;
    }

    if (key === "?") {
      event.preventDefault();
      setShowKeyboardHelp((current) => !current);
      return;
    }

    if (goPrefix) {
      event.preventDefault();
      setGoPrefix(false);
      const base = `/projects/${view.aggregate.project.id}`;
      if (key === "p") router.push(`${base}/planning`);
      if (key === "d") router.push(`${base}/dashboard`);
      if (key === "r") router.push(`${base}/resources`);
      if (key === "b") router.push(`${base}/baselines`);
      if (key === "l") router.push(`${base}/lookahead`);
      if (key === "a") router.push(`${base}/analytics`);
      if (key === "s") router.push(`${base}/soutenance`);
      if (key === "n") router.push(`${base}/network`);
      return;
    }

    if (key === "+" || event.key === "=") {
      event.preventDefault();
      setZoom((current) => Math.min(current * 1.5, 24));
      return;
    }

    if (key === "-" || event.key === "_") {
      event.preventDefault();
      setZoom((current) => Math.max(current / 1.5, 0.5));
      return;
    }

    if (key === "f") {
      event.preventDefault();
      setZoom(1);
      pushKeyboardNotice("Gantt ajuste pour voir davantage du projet.");
      return;
    }

    if (key === "t") {
      event.preventDefault();
      pushKeyboardNotice(`Aujourd'hui: ${todayIso()}.`);
      return;
    }

    if (key === "b") {
      event.preventDefault();
      setShowBaseline((current) => !current);
      return;
    }

    if (key === "c") {
      event.preventDefault();
      setShowCriticalOnly((current) => !current);
      return;
    }

    if (key === "n") {
      event.preventDefault();
      createTaskFromShortcut({ parentId: selectedTask?.parentId ?? null });
      pushKeyboardNotice("Nouvelle tâche créée au meme niveau.");
      return;
    }

    if (event.key === "Delete" && selectedTask) {
      event.preventDefault();
      if (window.confirm(`Supprimer ${selectedTask.name} ?`)) {
        const formData = new FormData();
        formData.set("projectId", view.aggregate.project.id);
        formData.set("taskId", selectedTask.id);
        startTransition(() => {
          void deleteTaskAction(formData).then(() => router.refresh());
        });
      }
      return;
    }

    if (!filteredTasks.length) {
      return;
    }

    const currentIndex = filteredTasks.findIndex((task) => task.id === selectedTask?.id);

    if (event.key === "ArrowDown") {
      const nextTask = filteredTasks[Math.min(currentIndex + 1, filteredTasks.length - 1)];
      if (nextTask) {
        event.preventDefault();
        setSelectedTaskId(nextTask.id);
      }
    }

    if (event.key === "ArrowUp") {
      const previousTask = filteredTasks[Math.max(currentIndex - 1, 0)];
      if (previousTask) {
        event.preventDefault();
        setSelectedTaskId(previousTask.id);
      }
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", onKeyboardNavigate);
    return () => window.removeEventListener("keydown", onKeyboardNavigate);
  }, []);

  const projectStart = view.schedule.projectStartDate ?? todayIso();
  const projectFinish = view.schedule.projectFinishDate ?? addCalendarDays(projectStart, 20);
  const timelineStart = addCalendarDays(projectStart, -2);
  const timelineFinish = addCalendarDays(projectFinish, 6);
  const timelineDays = getTimelineDays(timelineStart, timelineFinish);
  // Dates des B2P pour le Gantt : celles du projet si saisies, sinon la règle FGF.
  const b2pGanttDates = getProjectB2PDates(view.aggregate.project, view.schedule.projectFinishDate);
  // Repères temporels FGF : B2P courant + ligne « aujourd'hui ».
  const b2pTodayIso = todayIso();
  const currentB2pIndex = (() => {
    const idx = b2pGanttDates.findIndex((d) => d >= b2pTodayIso);
    return idx >= 0 ? idx : b2pGanttDates.length - 1;
  })();
  const todayOffset = diffCalendarDays(timelineStart, b2pTodayIso);
  const densityConfig = DENSITY_CONFIG[density];
  const rowHeight = densityConfig.rowHeight;
  // Échelle de temps selon l'UNITÉ du projet (spec François 29/08) : mois → colonnes
  // mensuelles, semaine → colonnes hebdo, jour → colonnes journalières (L/Ma/Me visibles
  // seulement en jour). Les barres restent positionnées au jour (précision) ; seul l'en-tête
  // et les repères verticaux changent de granularité.
  const timeUnit = view.aggregate.project.timeUnit ?? "jours";
  const scale: "day" | "week" | "month" =
    timeUnit === "mois" ? "month" : timeUnit === "semaines" ? "week" : "day";
  const headerGroups: { key: string; label: string; startIndex: number; span: number }[] = [];
  if (scale !== "day") {
    timelineDays.forEach((iso, i) => {
      const d = parseIsoDate(iso);
      let key: string;
      let label: string;
      if (scale === "month") {
        key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
        label = d.toLocaleDateString("fr-FR", { month: "long", year: "2-digit", timeZone: "UTC" });
      } else {
        const dow = (d.getUTCDay() + 6) % 7; // 0 = lundi
        const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow, 12));
        key = monday.toISOString().slice(0, 10);
        label = "sem. " + monday.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
      }
      const last = headerGroups[headerGroups.length - 1];
      if (last && last.key === key) last.span += 1;
      else headerGroups.push({ key, label, startIndex: i, span: 1 });
    });
  }
  const boundaryIndices = new Set<number>();
  if (scale === "day") {
    timelineDays.forEach((iso, i) => {
      if (parseIsoDate(iso).getUTCDay() === 1) boundaryIndices.add(i);
    });
  } else {
    for (const g of headerGroups) boundaryIndices.add(g.startIndex);
  }
  // Chemin pseudo-critique : calculé par le moteur avec le coefficient du projet
  // (Paramètres → « Coefficient pseudo-critique », 1,3 par défaut).
  const pseudoTaskIds = new Set(view.tasks.filter((t) => t.isPseudoCritical).map((t) => t.id));
  const dependencyProjectOptions = view.dependencyOptions;
  const selectedPredecessorProject =
    dependencyProjectOptions.find(
      (project) => project.projectId === selectedPredecessorProjectId,
    ) ?? dependencyProjectOptions[0];
  const availablePredecessorTasks =
    selectedPredecessorProject?.tasks.filter(
      (task) =>
        !(
          selectedPredecessorProject.projectId === view.aggregate.project.id &&
          task.taskId === selectedTask?.id
        ),
    ) ?? [];
  const predecessorLinks = view.dependencyNetwork.filter(
    (entry) =>
      entry.successor.projectId === view.aggregate.project.id &&
      entry.successor.taskId === selectedTask?.id,
  );
  const successorLinks = view.dependencyNetwork.filter(
    (entry) =>
      entry.predecessor.projectId === view.aggregate.project.id &&
      entry.predecessor.taskId === selectedTask?.id,
  );
  const ganttDependencies = view.dependencyNetwork
    .filter(
      (entry) =>
        entry.predecessor.projectId === view.aggregate.project.id &&
        entry.successor.projectId === view.aggregate.project.id,
    )
    .map((entry) => entry.dependency);
  const selectedTaskIssues = view.schedule.issues.filter(
    (issue) => issue.taskId === selectedTask?.id,
  );
  const selectedTaskAllocationPct =
    selectedTask && !selectedTask.isSummary
      ? getTaskTotalAllocationPct(view.aggregate, selectedTask.id)
      : 0;
  const selectedTaskDailyCapacity =
    selectedTask && !selectedTask.isSummary
      ? getTaskDailyCapacityHours(view.aggregate, selectedTask.id)
      : 0;
  const hasTasks = view.tasks.length > 0;

  return (
    <>
    <div className="flex gap-4" style={{ minHeight: '78vh' }}>
      {/* ── LEFT BLOCK (Sommaire + Gantt) ── */}
      <div
        className="min-w-0 flex flex-col"
        style={{
          transition: TRANS,
          flex: panelMode === 'inspector' ? '0 0 0px' : '1 1 0',
          maxWidth: panelMode === 'inspector' ? 0 : undefined,
          opacity: panelMode === 'inspector' ? 0 : 1,
          pointerEvents: panelMode === 'inspector' ? 'none' : undefined,
          overflow: 'hidden',
        }}
      >
      <Card className="flex flex-col overflow-hidden border-white/60 bg-[#fbfaf6]/85 h-full">
        <CardHeader className="shrink-0 border-b border-border/70 bg-white px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-2 min-w-0">
              <div className="section-label">Planning</div>
              <CardTitle className="text-[15px] font-black text-[#0d1f10]">Lots de tâches et Gantt</CardTitle>
            </div>
            {/* ── Vue ── */}
            <div className="flex items-center gap-0.5 rounded-xl p-1" style={{ background: 'rgba(0,0,0,0.045)', border: '1px solid rgba(0,0,0,0.06)' }}>
              {PANEL_MODES.map(({ mode, label, title, icon }) => (
                <button
                  key={mode}
                  type="button"
                  title={title}
                  aria-pressed={panelMode === mode}
                  onClick={() => setPanelMode(mode)}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-bold transition-all duration-200"
                  style={
                    panelMode === mode
                      ? { background: 'linear-gradient(135deg, #56a45b, #3f8f48)', color: 'white', boxShadow: '0 2px 8px rgba(86,164,91,0.35)' }
                      : { color: 'rgba(0,0,0,0.55)', background: 'transparent' }
                  }
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={icon} />
                  </svg>
                  <span className="hidden lg:inline">{label}</span>
                </button>
              ))}
            </div>
            {/* ── Zoom ── */}
            {panelMode !== 'grid' ? (
              <div className="flex items-center gap-0.5 rounded-xl bg-slate-100 p-1" aria-label="Zoom du Gantt">
                <button type="button" className="rounded-lg px-2 py-1 text-[12px] font-black text-slate-600 hover:bg-white" onClick={() => setZoom((z) => Math.max(0.5, z / 1.5))} title="Dézoomer (−)">−</button>
                <button type="button" className="rounded-lg px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-white" onClick={() => setZoom(1)} title="Projet entier (F)">Ajuster</button>
                <button type="button" className="rounded-lg px-2 py-1 text-[12px] font-black text-slate-600 hover:bg-white" onClick={() => setZoom((z) => Math.min(24, z * 1.5))} title="Zoomer (+)">+</button>
              </div>
            ) : null}
            <div className="flex items-center gap-0.5 rounded-xl bg-slate-100 p-1">
              {(Object.keys(DENSITY_CONFIG) as DensityMode[]).map((mode, index) => (
                <button
                  key={mode}
                  type="button"
                  title={`Densité ${DENSITY_CONFIG[mode].label} (Ctrl+${index + 1})`}
                  onClick={() => setDensity(mode)}
                  className={cn(
                    "rounded-lg px-2 py-1 text-[11px] font-bold",
                    density === mode ? "bg-white text-[#1a4a20] shadow-sm" : "text-slate-500",
                  )}
                >
                  {DENSITY_CONFIG[mode].label}
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-pressed={showBaseline}
              onClick={() => setShowBaseline((current) => !current)}
              className={cn("rounded-xl px-3 py-1.5 text-[11.5px] font-bold", showBaseline ? "bg-[#111827] text-white" : "bg-slate-100 text-slate-600")}
              title="Afficher le Planning Initial (PI) en trait noir"
            >
              PI
            </button>
            <button
              type="button"
              aria-pressed={showCriticalOnly}
              onClick={() => setShowCriticalOnly((current) => !current)}
              className={cn("rounded-xl px-3 py-1.5 text-[11.5px] font-bold", showCriticalOnly ? "bg-[#e2424a] text-white" : "bg-slate-100 text-slate-600")}
              title="N'afficher que le chemin critique et les jalons"
            >
              Chemin critique
            </button>
            <button
              type="button"
              aria-pressed={inspectorOpen}
              onClick={() => setInspectorOpen((v) => !v)}
              className={cn("rounded-xl px-3 py-1.5 text-[11.5px] font-bold", inspectorOpen ? "bg-[#1a4a20] text-white" : "bg-slate-100 text-slate-600")}
              title="Ouvrir / fermer l'inspecteur du LT sélectionné (double-clic sur une ligne)"
            >
              Inspecteur
            </button>
            <div className="flex-1" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filtrer les LT, le WBS, les notes…"
              aria-label="Filtrer les lots de tâches"
              className="h-8 w-56 bg-white text-[12px]"
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <form action={createTaskAction}>
              <input type="hidden" name="projectId" value={view.aggregate.project.id} />
              <input type="hidden" name="parentId" value={selectedTask?.parentId ?? ""} />
              <Button variant="outline" size="sm" type="submit">
                {selectedTask ? "+ LT au même niveau" : "+ LT racine"}
              </Button>
            </form>
            <form action={createTaskAction}>
              <input type="hidden" name="projectId" value={view.aggregate.project.id} />
              <input type="hidden" name="parentId" value={selectedTask?.id ?? ""} />
              <Button size="sm" variant="outline" type="submit" disabled={!selectedTask}>
                + Sous-LT
              </Button>
            </form>
            <form action={createTaskAction}>
              <input type="hidden" name="projectId" value={view.aggregate.project.id} />
              <input type="hidden" name="parentId" value={selectedTask?.parentId ?? ""} />
              <input type="hidden" name="type" value="MILESTONE" />
              <input type="hidden" name="name" value="Nouveau jalon" />
              <Button variant="outline" size="sm" type="submit">
                + Jalon
              </Button>
            </form>
            <form action={captureBaselineAction}>
              <input type="hidden" name="projectId" value={view.aggregate.project.id} />
              <input type="hidden" name="baselineName" value={`PI (Planning Initial) ${new Date().toLocaleDateString("fr-FR")}`} />
              <input type="hidden" name="capturedBy" value={view.aggregate.project.ownerName} />
              <Button
                variant="secondary"
                size="sm"
                type="submit"
                title="Enregistre le planning courant comme nouvelle variante ET la désigne comme PI : trait noir sur le Gantt, suivi B2P en rouge (réalisé) et vert (prévision)."
              >
                Figer le planning (PI)
              </Button>
            </form>
            <div
              role="status"
              aria-live="polite"
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-medium",
                ganttState.status === "error"
                  ? "bg-rose-50 text-rose-700"
                  : ganttState.status === "success"
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-slate-500",
              )}
            >
              {ganttPending
                ? "Application du déplacement…"
                : ganttState.message || "Glissez une barre pour la déplacer, ses bords pour la redimensionner."}
            </div>
            <button
              type="button"
              onClick={() => setShowKeyboardHelp(true)}
              className="ml-auto rounded-full px-2 py-1 text-[11px] font-semibold text-slate-400 hover:text-slate-700"
              title={keyboardNotice}
            >
              Raccourcis clavier (?)
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-0 flex flex-col flex-1 overflow-hidden">
          {view.schedule.issues.length ? (
            <div className="border-b border-amber-200 bg-amber-50/90 px-5 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                Alertes planning
              </div>
              <div className="mt-2 flex flex-col gap-2 text-sm text-amber-900">
                {view.schedule.issues.slice(0, 3).map((issue) => (
                  <div key={`${issue.code}-${issue.taskId ?? 'global'}`}>{issue.message}</div>
                ))}
              </div>
            </div>
          ) : null}
          {/* Légende FGF (spec François 29/08) — pleine largeur, hors des colonnes,
              pour que le nom du LT et sa barre restent sur la même ligne. */}
          {hasTasks ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/70 bg-[#f1eee6] px-4 py-1.5 text-[10.5px] text-slate-600">
              <span className="font-bold uppercase tracking-[0.14em] text-slate-400">Convention FGF</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-[4px] w-6 rounded-full" style={{ background: "#111827" }} />PI / PàD</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-[5px] w-6 rounded-full" style={{ background: "#be123c" }} />Réalisé</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-[5px] w-6 rounded-full" style={{ background: "#3f8f48" }} />Reste à faire</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-[9px] w-6 rounded-[2px] border-2" style={{ borderColor: "#0f172a", background: "#3f8f48" }} />Critique (épais plein)</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-[9px] w-6 rounded-[2px] border-2 border-dotted" style={{ borderColor: "#0f172a", background: "#3f8f48" }} />Pseudo-critique (épais pointillé)</span>
            </div>
          ) : null}
          {hasTasks ? (
            filteredTasks.length === 0 ? (
              <div className="flex min-h-[280px] items-center justify-center px-8 text-center text-sm text-slate-500">
                Aucun lot de tâches ne correspond au filtre. Effacez la recherche pour retrouver toute la décomposition.
              </div>
            ) : (
            <GanttBoard
              view={view}
              tasks={filteredTasks}
              selectedTaskId={selectedTask?.id}
              onSelect={(id) => startTransition(() => setSelectedTaskId(id))}
              onOpenInspector={(id) => {
                setSelectedTaskId(id);
                setInspectorOpen(true);
              }}
              panelMode={panelMode}
              rowHeight={rowHeight}
              density={densityConfig}
              zoom={zoom}
              timelineStart={timelineStart}
              timelineDays={timelineDays}
              scale={scale}
              headerGroups={headerGroups}
              boundaryIndices={boundaryIndices}
              dependencies={ganttDependencies}
              todayOffset={todayOffset}
              b2pDates={b2pGanttDates}
              currentB2pIndex={currentB2pIndex}
              statusDate={b2pTodayIso}
              showBaseline={showBaseline}
              pseudoTaskIds={pseudoTaskIds}
              unitLabel={timeUnitShortLabel(timeUnit)}
              toUnit={(d) => fromWorkingDays(d, timeUnit)}
              onScheduleCommit={commitGanttSchedule}
            />
            )
          ) : (
            <div className="p-6">
              <EmptyState
                eyebrow="Plan vide"
                title="Créer la première ligne de planification"
                description="Commencez par une tâche racine ou un jalon, puis construisez la hiérarchie, la logique, les ressources et les baselines autour d'un vrai réseau de planning."
                ctaAction={
                  <div className="flex flex-wrap gap-3">
                    <form action={createTaskAction}>
                      <input type="hidden" name="projectId" value={view.aggregate.project.id} />
                      <Button type="submit">Ajouter une tâche racine</Button>
                    </form>
                    <form action={createTaskAction}>
                      <input type="hidden" name="projectId" value={view.aggregate.project.id} />
                      <input type="hidden" name="type" value="MILESTONE" />
                      <input type="hidden" name="name" value="Nouveau jalon" />
                      <Button type="submit" variant="outline">
                        Ajouter un jalon
                      </Button>
                    </form>
                  </div>
                }
              />
            </div>
          )}
        </CardContent>
      </Card>
      </div>{/* end LEFT BLOCK */}

      {/* ── RIGHT BLOCK (Inspector + Dependencies) ── */}
      <div
        className="flex-shrink-0 overflow-hidden"
        style={{
          transition: TRANS,
          width: panelMode === 'inspector' ? undefined : inspectorOpen ? 380 : 0,
          flex: panelMode === 'inspector' ? '1 1 0' : undefined,
          opacity: panelMode === 'inspector' || inspectorOpen ? 1 : 0,
          pointerEvents: panelMode === 'inspector' || inspectorOpen ? undefined : 'none',
          minWidth: panelMode === 'inspector' ? 0 : undefined,
        }}
      >
      <div className="space-y-5 h-full overflow-y-auto pr-0.5">
        <Card className="border-white/70 bg-white/95">
          <CardHeader className="border-b border-border/70 pb-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="section-label">Inspecteur</div>
                <CardTitle className="mt-0.5 text-[15px] font-black text-[#0d1f10]">Lot de tâches sélectionné</CardTitle>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInspectorOpen(false);
                  if (panelMode === 'inspector') setPanelMode('all');
                }}
                className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-50"
                aria-label="Fermer l'inspecteur"
              >
                Fermer ✕
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 p-5">
            {selectedTask ? (
              <>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <TaskStatusBadge status={selectedTask.status} />
                    <PriorityBadge priority={selectedTask.priority} />
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {selectedTask.wbsCode}
                    </span>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-slate-950">
                      {selectedTask.name}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {selectedTask.scheduledStartDate && selectedTask.scheduledFinishDate
                        ? `${formatLongDate(selectedTask.scheduledStartDate)} au ${formatLongDate(selectedTask.scheduledFinishDate)}`
                        : "Cette tâche n'est pas encore entierement planifiée."}
                    </div>
                  </div>
                </div>

                <form
                  key={`${selectedTask.id}-outline`}
                  action={moveAction}
                  className="rounded-2xl border border-border/70 bg-slate-50 p-4"
                >
                  <input type="hidden" name="projectId" value={view.aggregate.project.id} />
                  <input type="hidden" name="taskId" value={selectedTask.id} />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Edition du plan
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Deplacez la branche sélectionnée dans la décomposition sans editer manuellement la structure WBS.
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="submit"
                        variant="outline"
                        size="sm"
                        name="direction"
                        value="UP"
                        disabled={movePending}
                      >
                        Monter
                      </Button>
                      <Button
                        type="submit"
                        variant="outline"
                        size="sm"
                        name="direction"
                        value="DOWN"
                        disabled={movePending}
                      >
                        Descendre
                      </Button>
                      <Button
                        type="submit"
                        variant="outline"
                        size="sm"
                        name="direction"
                        value="INDENT"
                        disabled={movePending}
                      >
                        Indenter
                      </Button>
                      <Button
                        type="submit"
                        variant="outline"
                        size="sm"
                        name="direction"
                        value="OUTDENT"
                        disabled={movePending}
                      >
                        Desindenter
                      </Button>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "mt-3 text-sm",
                      moveState.status === "error"
                        ? "text-rose-700"
                        : moveState.status === "success"
                          ? "text-emerald-700"
                          : "text-slate-500",
                    )}
                  >
                    {moveState.message ||
                      "Les mouvements renumerotent immediatement le WBS et preservent la hiérarchie."}
                  </div>
                </form>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-border/70 bg-slate-50 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Fenetre de planning
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-slate-700">
                      <div className="flex items-center justify-between gap-3">
                        <span>Début au plus tôt</span>
                        <span className="font-medium">
                          {formatDateLabel(selectedTask.earliestStartDate)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Fin au plus tôt</span>
                        <span className="font-medium">
                          {formatDateLabel(selectedTask.earliestFinishDate)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Début au plus tard</span>
                        <span className="font-medium">
                          {formatDateLabel(selectedTask.latestStartDate)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Fin au plus tard</span>
                        <span className="font-medium">
                          {formatDateLabel(selectedTask.latestFinishDate)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-slate-50 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Signaux de pilotage
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-slate-700">
                      <div className="flex items-center justify-between gap-3">
                        <span>Mode de planning</span>
                        <span className="font-medium">
                          {getSchedulingModeLabel(selectedTask.schedulingMode)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Formule de charge</span>
                        <span className="font-medium">
                          {getWorkFormulaLabel(selectedTask.workFormula)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Charge planifiée</span>
                        <span className="font-medium">
                          {formatHours(selectedTask.effortHours)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Charge réelle</span>
                        <span className="font-medium">
                          {formatHours(selectedTask.actualWorkHours)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Charge restante</span>
                        <span className="font-medium">
                          {formatHours(selectedTask.remainingWorkHours)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Unités affectees</span>
                        <span className="font-medium">
                          {selectedTask.isSummary
                            ? "Consolidee"
                            : selectedTaskAllocationPct > 0
                              ? formatPercent(selectedTaskAllocationPct)
                              : "Non affecté"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Capacité quotidienne</span>
                        <span className="font-medium">
                          {selectedTask.isSummary
                            ? "Consolidee"
                            : formatHours(selectedTaskDailyCapacity)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Marge totale</span>
                        <span className="font-medium">
                          {selectedTask.totalSlackDays ?? 0}d
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Marge libre</span>
                        <span className="font-medium">
                          {selectedTask.freeSlackDays ?? 0}d
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Contrainte</span>
                        <span className="text-right font-medium">
                          {getConstraintLabel(selectedTask.constraintType)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Début réel</span>
                        <span className="font-medium">
                          {formatDateLabel(selectedTask.actualStartDate)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Fin réelle</span>
                        <span className="font-medium">
                          {formatDateLabel(selectedTask.actualFinishDate)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Échéance</span>
                        <span
                          className={cn(
                            "font-medium",
                            selectedTask.deadlineDate &&
                              selectedTask.scheduledFinishDate &&
                              compareIsoDates(
                                selectedTask.scheduledFinishDate,
                                selectedTask.deadlineDate,
                              ) > 0
                              ? "text-rose-700"
                              : "text-slate-700",
                          )}
                        >
                          {formatDateLabel(selectedTask.deadlineDate)}
                        </span>
                      </div>
                      {/* Coût réel / VP-VA retirés de l'inspecteur (outil de délai — spec François). */}
                    </div>
                  </div>
                </div>

                {selectedTaskIssues.length ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                      Alertes de planning de la tâche
                    </div>
                    <div className="mt-3 space-y-2 text-sm text-amber-900">
                      {selectedTaskIssues.map((issue) => (
                        <div key={`${selectedTask.id}-${issue.code}`}>
                          {issue.message}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {selectedTask.levelingDelayDays > 0 ? (
                  <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-800">
                      Retard de lissage
                    </div>
                    <div className="mt-3 text-sm text-sky-900">
                      Cette tache est retardee de {selectedTask.levelingDelayDays} jour(s) ouvre(s) pour respecter la capacite ressource. Effacez ou relancez le lissage depuis la vue ressources si le staffing change.
                    </div>
                  </div>
                ) : null}

                <form
                  key={selectedTask.id}
                  action={taskAction}
                  className="space-y-4"
                >
                  <input type="hidden" name="projectId" value={view.aggregate.project.id} />
                  <input type="hidden" name="taskId" value={selectedTask.id} />
                  <div className="grid gap-4">
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Nom
                      <Input name="name" defaultValue={selectedTask.name} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Description
                      <Textarea
                        name="description"
                        defaultValue={selectedTask.description}
                        className="min-h-[96px]"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Notes
                      <Textarea
                        name="notes"
                        defaultValue={selectedTask.notes}
                        className="min-h-[88px]"
                      />
                    </label>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Parent
                      <Select name="parentId" defaultValue={selectedTask.parentId ?? ""}>
                        <option value="">Niveau racine</option>
                        {view.tasks
                          .filter((task) => task.id !== selectedTask.id && task.isSummary)
                          .map((task) => (
                            <option key={task.id} value={task.id}>
                              {task.wbsCode} {task.name}
                            </option>
                          ))}
                      </Select>
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Ordre
                      <Input name="sortOrder" type="number" defaultValue={selectedTask.sortOrder} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Type
                      <Select name="type" defaultValue={selectedTask.type}>
                        <option value="TASK">Tâche</option>
                        <option value="SUMMARY">Récapitulatif</option>
                        <option value="MILESTONE">Jalon</option>
                      </Select>
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Statut
                      <Select name="status" defaultValue={selectedTask.status}>
                        <option value="NOT_STARTED">Non demarree</option>
                        <option value="IN_PROGRESS">En cours</option>
                        <option value="BLOCKED">Bloquee</option>
                        <option value="DONE">Terminée</option>
                      </Select>
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Priorite
                      <Select name="priority" defaultValue={selectedTask.priority}>
                        <option value="LOW">Faible</option>
                        <option value="MEDIUM">Normale</option>
                        <option value="HIGH">Élevée</option>
                        <option value="URGENT">Urgente</option>
                      </Select>
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Avancement %
                      <Input
                        name="progressPercent"
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={selectedTask.progressPercent}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Duree (jours)
                      <Input
                        name="durationDays"
                        type="number"
                        min={0}
                        defaultValue={selectedTask.durationDays}
                        readOnly={selectedTask.isSummary}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Mode de planification
                      <Select
                        name="schedulingMode"
                        defaultValue={selectedTask.schedulingMode}
                      >
                        {SCHEDULING_MODE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Formule de charge
                      <Select
                        name="workFormula"
                        defaultValue={selectedTask.workFormula}
                      >
                        {WORK_FORMULA_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Calendrier de tâche
                      <Select
                        name="calendarMode"
                        defaultValue={selectedTask.calendarMode}
                      >
                        <option value="PROJECT">Utiliser le calendrier du projet</option>
                        <option value="CUSTOM">Calendrier de tâche personnalise</option>
                      </Select>
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Charge (heures)
                      <Input
                        name="effortHours"
                        type="number"
                        min={0}
                        step="any"
                        defaultValue={selectedTask.effortHours ?? 0}
                        readOnly={selectedTask.isSummary || selectedTask.type === "MILESTONE"}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Heures de tâche / jour
                      <Input
                        name="taskCalendarHoursPerDay"
                        type="number"
                        min={1}
                        max={24}
                        defaultValue={selectedTask.calendarHoursPerDay ?? ""}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Priorité de lissage
                      <Input
                        name="levelingPriority"
                        type="number"
                        min={0}
                        max={1000}
                        defaultValue={selectedTask.levelingPriority}
                        readOnly={selectedTask.isSummary}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Charge reelle (heures)
                      <Input
                        name="actualWorkHours"
                        type="number"
                        min={0}
                        step="any"
                        defaultValue={selectedTask.actualWorkHours ?? 0}
                        readOnly={selectedTask.isSummary}
                      />
                    </label>
                    <div className="grid gap-2 text-sm font-medium text-slate-700 md:col-span-2">
                      <div>Semaine ouvrée de la tâche</div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {WORKING_DAY_OPTIONS.map((day) => (
                          <label
                            key={day.value}
                            className="flex items-center gap-2 rounded-xl border border-border/70 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                          >
                            <input
                              type="checkbox"
                              name="taskCalendarWorkingDays"
                              value={day.value}
                              defaultChecked={selectedTask.calendarWorkingDays.includes(
                                day.value,
                              )}
                              className="size-4 rounded border-slate-300"
                            />
                            <span>{day.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <label className="grid gap-2 text-sm font-medium text-slate-700 md:col-span-2">
                      Exceptions du calendrier de tâche
                      <Textarea
                        name="taskCalendarExceptions"
                        defaultValue={serializeCalendarExceptions(
                          selectedTask.calendarExceptions,
                        )}
                        className="min-h-[110px] font-mono text-xs"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Charge restante (heures)
                      <Input
                        name="remainingWorkHours"
                        type="number"
                        min={0}
                        step="any"
                        defaultValue={selectedTask.remainingWorkHours ?? 0}
                        readOnly={selectedTask.isSummary}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Constraint
                      <Select
                        name="constraintType"
                        defaultValue={selectedTask.constraintType}
                      >
                        {CONSTRAINT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Date de contrainte
                      <FrenchDateInput name="constraintDate" defaultValue={selectedTask.constraintDate ?? ""} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Date d'echeance
                      <FrenchDateInput name="deadlineDate" defaultValue={selectedTask.deadlineDate ?? ""} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Début manuel
                      <FrenchDateInput name="manualStartDate" defaultValue={selectedTask.manualStartDate ?? ""} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Fin manuelle
                      <FrenchDateInput name="manualFinishDate" defaultValue={selectedTask.manualFinishDate ?? ""} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Début réel
                      <FrenchDateInput name="actualStartDate" defaultValue={selectedTask.actualStartDate ?? ""} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Fin réelle
                      <FrenchDateInput name="actualFinishDate" defaultValue={selectedTask.actualFinishDate ?? ""} />
                    </label>
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">
                    La planification automatique suit les dépendances et les contraintes. La planification manuelle
                    preserve les dates saisies et remonte une alerte en cas de conflit avec le réseau.
                    La duree fixe recalcule la charge a partir des unites ; la charge fixe et les unites fixes
                    preservent la charge planifiée et rederivent la durée depuis la capacité disponible.
                    Les calendriers de tâche, la priorité de lissage, la charge réelle, la charge restante et
                    les dates reelles alimentent le meme modele de planning, de consommation et d'ecarts de baseline.
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div
                      className={cn(
                        "text-sm",
                        taskState.status === "error"
                          ? "text-rose-700"
                          : taskState.status === "success"
                            ? "text-emerald-700"
                            : "text-slate-500",
                      )}
                    >
                      {taskState.message || "Les changements enregistres declenchent un recalcul du planning."}
                    </div>
                    <Button type="submit" disabled={taskPending}>
                      {taskPending ? "Enregistrement..." : "Enregistrer la tâche"}
                    </Button>
                  </div>
                </form>

                <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm">
                  <div className="text-rose-800">
                    Supprimez cette {selectedTask.isSummary ? "branche" : "tache"} ainsi que les affectations, dependances et snapshots de baseline lies.
                  </div>
                  <form action={deleteTaskAction}>
                    <input type="hidden" name="projectId" value={view.aggregate.project.id} />
                    <input type="hidden" name="taskId" value={selectedTask.id} />
                    <Button type="submit" variant="destructive">
                      Supprimer {selectedTask.isSummary ? "la branche" : "la tâche"}
                    </Button>
                  </form>
                </div>

                {!selectedTask.isSummary ? (
                  <form
                    key={`${selectedTask.id}-dependency`}
                    action={dependencyAction}
                    className="space-y-4 border-t border-border/70 pt-5"
                  >
                    <input type="hidden" name="projectId" value={view.aggregate.project.id} />
                    <input
                      type="hidden"
                      name="successorProjectId"
                      value={view.aggregate.project.id}
                    />
                    <input type="hidden" name="successorTaskId" value={selectedTask.id} />
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        Ajouter une logique de précédente
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        Ajoutez une logique a la tache selectionnee depuis ce projet ou n'importe quel plan connecte.
                      </p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-2 text-sm font-medium text-slate-700">
                        Projet précédent
                        <Select
                          name="predecessorProjectId"
                          value={selectedPredecessorProject?.projectId ?? view.aggregate.project.id}
                          onChange={(event) =>
                            setSelectedPredecessorProjectId(event.target.value)
                          }
                        >
                          {dependencyProjectOptions.map((projectOption) => (
                            <option
                              key={projectOption.projectId}
                              value={projectOption.projectId}
                            >
                              {projectOption.code} {projectOption.name}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-slate-700">
                        Tâche précédente
                        <Select name="predecessorTaskId" defaultValue="">
                          <option value="" disabled>
                            Choisir une précédente
                          </option>
                          {availablePredecessorTasks.map((task) => (
                            <option key={task.taskId} value={task.taskId}>
                              {task.wbsCode} {task.name}
                            </option>
                          ))}
                        </Select>
                      </label>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-2 text-sm font-medium text-slate-700">
                        Type de lien
                        <Select name="type" defaultValue="FS">
                          <option value="FS">FD — Fin → Début</option>
                          <option value="SS">DD — Début → Début</option>
                          <option value="FF">FF — Fin → Fin</option>
                          <option value="SF">DF — Début → Fin</option>
                        </Select>
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-slate-700">
                        Retard / avance (jours)
                        <Input name="lagDays" type="number" defaultValue={0} />
                      </label>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div
                        className={cn(
                          "text-sm",
                          dependencyState.status === "error"
                            ? "text-rose-700"
                            : dependencyState.status === "success"
                              ? "text-emerald-700"
                              : "text-slate-500",
                        )}
                      >
                        {dependencyState.message || "Les précédences recalculent le Gantt immediatement."}
                      </div>
                      <Button type="submit" variant="outline" disabled={dependencyPending}>
                        {dependencyPending ? "Enregistrement..." : "Ajouter la précédente"}
                      </Button>
                    </div>
                  </form>
                ) : null}
                {!selectedTask.isSummary ? (
                  <LtResourceEditor
                    projectId={view.aggregate.project.id}
                    taskId={selectedTask.id}
                    resources={view.aggregate.resources}
                    assignments={view.aggregate.assignments}
                  />
                ) : null}
              </>
            ) : (
              <div className="text-sm text-slate-600">
                Selectionnez une tache dans la grille pour l'inspecter et la modifier.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-white/70 bg-white/95">
          <CardHeader className="border-b border-border/70 pb-4">
            <CardTitle className="text-lg">Contexte de dépendance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 p-5">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Precedentes
              </div>
              <div className="mt-3 space-y-2">
                {predecessorLinks.length ? (
                  predecessorLinks.map((entry) => {
                    return (
                      <div
                        key={entry.dependency.id}
                        className="rounded-2xl border border-border/60 bg-slate-50 p-3 text-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium text-slate-950">
                              {entry.predecessor.projectCode} {entry.predecessor.projectName}
                            </div>
                            <div className="mt-1 text-slate-700">
                              {(entry.predecessor.wbsCode ?? "LT")} {entry.predecessor.taskName}
                            </div>
                            <div className="mt-1 text-slate-600">
                              {entry.dependency.type === "FS" ? "FD" : entry.dependency.type === "SS" ? "DD" : entry.dependency.type === "SF" ? "DF" : entry.dependency.type}{" "}
                              {entry.dependency.lagDays >= 0
                                ? `+${entry.dependency.lagDays}`
                                : entry.dependency.lagDays}
                              d
                              {entry.externalToProject ? " · Externe" : ""}
                            </div>
                          </div>
                          <form action={deleteDependencyAction}>
                            <input type="hidden" name="projectId" value={view.aggregate.project.id} />
                            <input type="hidden" name="dependencyId" value={entry.dependency.id} />
                            <Button type="submit" variant="ghost" size="sm" className="text-rose-700">
                              Retirer
                            </Button>
                          </form>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-sm text-slate-500">
                    Aucune logique de precedence n'est encore definie.
                  </div>
                )}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Successeurs
              </div>
              <div className="mt-3 space-y-2">
                {successorLinks.length ? (
                  successorLinks.map((entry) => {
                    return (
                      <div
                        key={entry.dependency.id}
                        className="rounded-2xl border border-border/60 bg-slate-50 p-3 text-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium text-slate-950">
                              {entry.successor.projectCode} {entry.successor.projectName}
                            </div>
                            <div className="mt-1 text-slate-700">
                              {(entry.successor.wbsCode ?? "LT")} {entry.successor.taskName}
                            </div>
                            <div className="mt-1 text-slate-600">
                              {entry.dependency.type === "FS" ? "FD" : entry.dependency.type === "SS" ? "DD" : entry.dependency.type === "SF" ? "DF" : entry.dependency.type}{" "}
                              {entry.dependency.lagDays >= 0
                                ? `+${entry.dependency.lagDays}`
                                : entry.dependency.lagDays}
                              d
                              {entry.externalToProject ? " · Externe" : ""}
                            </div>
                          </div>
                          <form action={deleteDependencyAction}>
                            <input type="hidden" name="projectId" value={view.aggregate.project.id} />
                            <input type="hidden" name="dependencyId" value={entry.dependency.id} />
                            <Button type="submit" variant="ghost" size="sm" className="text-rose-700">
                              Retirer
                            </Button>
                          </form>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-sm text-slate-500">
                    Cette tâche ne pilote actuellement aucun travail en aval.
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-border/70 pt-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Liens de vue
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/projects/${view.aggregate.project.id}/dashboard`}
                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                >
                  Tableau de bord
                </Link>
                <Link
                  href={`/projects/${view.aggregate.project.id}/resources`}
                  className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Ressources
                </Link>
                <Link
                  href={`/projects/${view.aggregate.project.id}/baselines`}
                  className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Baselines
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>{/* end RIGHT BLOCK */}
    </div>

    {/* Keyboard help modal */}
    {showKeyboardHelp && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
        onClick={() => setShowKeyboardHelp(false)}
      >
        <div
          className="relative w-full max-w-2xl rounded-2xl border border-white/60 bg-white/95 p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 hover:bg-slate-200"
            onClick={() => setShowKeyboardHelp(false)}
          >
            Fermer
          </button>
          <div className="mb-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Aide</div>
            <h2 className="mt-1 text-xl font-black text-[#1a4a20]">Raccourcis clavier</h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {[
              {
                category: "Navigation rapide (G + ...)",
                shortcuts: [
                  ["G P", "Planning / Gantt"],
                  ["G D", "Tableau de bord"],
                  ["G R", "Ressources"],
                  ["G B", "Baselines"],
                  ["G L", "À venir 4 semaines"],
                  ["G A", "Analytics (ES, Monte Carlo)"],
                  ["G S", "Rapport soutenance"],
                  ["G N", "Réseau PERT"],
                ],
              },
              {
                category: "Planification",
                shortcuts: [
                  ["N", "Nouvelle tâche au meme niveau"],
                  ["Ctrl+M", "Convertir en jalon"],
                  ["Ctrl+D", "Dupliquer la tâche"],
                  ["Ctrl+G", "Créer un groupe récapitulatif"],
                  ["Alt + Gauche", "Diminuer le niveau WBS"],
                  ["Alt + Droite", "Augmenter le niveau WBS"],
                  ["Ctrl + Haut/Bas", "Déplacer la tâche"],
                  ["Delete", "Supprimer la tâche sélectionnée"],
                ],
              },
              {
                category: "Affichage",
                shortcuts: [
                  ["Ctrl+1", "Densite compacte"],
                  ["Ctrl+2", "Densite normale"],
                  ["Ctrl+3", "Densite confort"],
                  ["+  /  -", "Zoomer / dezoomer le Gantt"],
                  ["F", "Ajuster le zoom (fit)"],
                  ["T", "Afficher la date du jour"],
                  ["B", "Afficher/masquer la baseline"],
                  ["C", "Filtrer chemin critique uniquement"],
                ],
              },
              {
                category: "Divers",
                shortcuts: [
                  ["? ", "Afficher/masquer cette aide"],
                  ["Ctrl+Z", "Annuler le dernier déplacement Gantt"],
                  ["Ctrl+Y", "Rétablir le déplacement annulé"],
                  ["Haut / Bas", "Naviguer entre les tâches"],
                  ["Echap", "Fermer les panneaux"],
                ],
              },
            ].map(({ category, shortcuts }) => (
              <div key={category}>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{category}</div>
                <div className="space-y-1">
                  {shortcuts.map(([keys, desc]) => (
                    <div key={keys} className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-mono rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">{keys}</span>
                      <span className="text-slate-500">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
