"use client";

import { useActionState } from "react";

import { updateProjectCalendarAction } from "@/features/projects/actions";
import { initialFormState } from "@/features/projects/form-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectView } from "@/types/planning";

const WORKING_DAY_OPTIONS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

export function ProjectCalendarForm({ view }: { view: ProjectView }) {
  const [state, action, pending] = useActionState(
    updateProjectCalendarAction,
    initialFormState,
  );
  const calendar = view.aggregate.calendar;
  const exceptionsValue = [...calendar.exceptions]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map(
      (exception) =>
        `${exception.date} | ${exception.label} | ${
          exception.isWorkingDay ? "working" : "off"
        }`,
    )
    .join("\n");

  return (
    <Card className="border-white/70 bg-white/95">
      <CardHeader>
        <CardTitle className="text-xl">Project Calendar</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <input type="hidden" name="projectId" value={view.aggregate.project.id} />

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Calendar name
              <Input name="calendarName" defaultValue={calendar.name} required />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Timezone
              <Input name="timezone" defaultValue={calendar.timezone} required />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700 md:col-span-2">
              Hours per day
              <Input
                name="hoursPerDay"
                type="number"
                min={1}
                max={24}
                defaultValue={calendar.hoursPerDay}
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Leveling strategy
              <Select
                name="levelingStrategy"
                defaultValue={view.aggregate.project.levelingStrategy}
              >
                <option value="PRIORITY_THEN_SLACK">Priority then slack</option>
                <option value="SLACK_THEN_PRIORITY">Slack then priority</option>
                <option value="MIN_DELAY">Minimize delay</option>
              </Select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Max leveling delay (days)
              <Input
                name="levelingMaxDelayDays"
                type="number"
                min={0}
                max={3650}
                defaultValue={view.aggregate.project.levelingMaxDelayDays}
                required
              />
            </label>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium text-slate-700">Working week</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {WORKING_DAY_OPTIONS.map((day) => (
                <label
                  key={day.value}
                  className="flex items-center gap-2 rounded-xl border border-border/70 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                >
                  <input
                    type="checkbox"
                    name="workingDays"
                    value={day.value}
                    defaultChecked={calendar.workingDays.includes(day.value)}
                    className="size-4 rounded border-slate-300"
                  />
                  <span>{day.label}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Calendar exceptions
            <Textarea
              name="exceptions"
              defaultValue={exceptionsValue}
              className="min-h-[140px] font-mono text-xs"
            />
            <span className="text-xs font-normal leading-5 text-slate-500">
              One line per exception: <code>YYYY-MM-DD | Label | off</code> or{" "}
              <code>YYYY-MM-DD | Label | working</code>.
            </span>
          </label>

          <div className="flex items-center justify-between gap-4 border-t border-border/70 pt-5">
            <div
              className={
                state.status === "error"
                  ? "text-sm text-rose-700"
                  : state.status === "success"
                    ? "text-sm text-emerald-700"
                    : "text-sm text-slate-500"
              }
            >
              {state.message ||
                "Working days and exceptions immediately reshape schedule dates, critical path, and variance."}
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save Calendar"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
