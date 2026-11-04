"use client";

import { useActionState } from "react";

import {
  deleteActualCostEntryAction,
  saveActualCostEntryAction,
} from "@/features/projects/actions";
import { initialFormState } from "@/features/projects/form-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDateLabel } from "@/lib/format/formatters";
import { actualCostCategories, type ProjectView } from "@/types/planning";

export function ActualCostLedgerPanel({ view }: { view: ProjectView }) {
  const [state, saveAction, pending] = useActionState(
    saveActualCostEntryAction,
    initialFormState,
  );
  const taskOptions = view.tasks.filter((task) => !task.isSummary);
  const resourceMap = new Map(
    view.aggregate.resources.map((resource) => [resource.id, resource.name]),
  );
  const taskMap = new Map(taskOptions.map((task) => [task.id, `${task.wbsCode} ${task.name}`]));
  const ledgerEntries = [...view.aggregate.actualCostEntries].sort(
    (left, right) =>
      right.entryDate.localeCompare(left.entryDate) ||
      right.createdAt.localeCompare(left.createdAt),
  );

  return (
    <Card className="border-white/70 bg-white/95">
      <CardHeader>
        <CardTitle className="text-xl">Actual Cost Ledger</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border/70 bg-slate-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Ledger entries
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">
              {view.metrics.actualCostEntryCount}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Timesheet labor and manual non-labor cost postings.
            </div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-slate-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Labor actual
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">
              {formatCurrency(
                view.metrics.totalLaborActualCost,
                view.aggregate.project.currencyCode,
              )}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Auto-posted from timesheets and labor ledger lines.
            </div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-slate-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Non-labor actual
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">
              {formatCurrency(
                view.metrics.totalNonLaborActualCost,
                view.aggregate.project.currencyCode,
              )}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Travel, materials, subcontract and overhead postings.
            </div>
          </div>
        </div>

        <form action={saveAction} className="grid gap-4 rounded-2xl border border-border/70 bg-slate-50 p-4">
          <input type="hidden" name="projectId" value={view.aggregate.project.id} />

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Entry date
              <Input
                type="date"
                name="entryDate"
                defaultValue={view.schedule.projectStartDate ?? view.aggregate.project.targetStartDate}
              />
            </label>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Category
              <select
                name="category"
                defaultValue="OTHER"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {actualCostCategories.map((category) => (
                  <option key={category} value={category}>
                    {category.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Task
              <select
                name="taskId"
                defaultValue=""
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Project-level posting</option>
                {taskOptions.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.wbsCode} {task.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Resource
              <select
                name="resourceId"
                defaultValue=""
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">No resource link</option>
                {view.aggregate.resources.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Vendor
              <Input name="vendorName" placeholder="Vendor or supplier" />
            </label>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Reference
              <Input name="referenceCode" placeholder="PO / invoice / journal ref" />
            </label>
          </div>

          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Description
            <Input name="description" placeholder="What does this posting represent?" />
          </label>

          <div className="grid gap-4 md:grid-cols-4">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Quantity
              <Input name="quantity" type="number" min="0" step="0.01" />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Unit cost
              <Input name="unitCost" type="number" min="0" step="0.01" />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Amount override
              <Input name="amount" type="number" min="0" step="0.01" />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Currency
              <Input
                name="currencyCode"
                defaultValue={view.aggregate.project.currencyCode}
                maxLength={3}
              />
            </label>
          </div>

          <div className="flex items-center justify-between gap-3">
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
                "Manual postings complement timesheet-driven labor actuals and flow directly into EV and cost variance metrics."}
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Post Actual Cost"}
            </Button>
          </div>
        </form>

        <div className="space-y-3">
          {ledgerEntries.length ? (
            ledgerEntries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-2xl border border-border/70 bg-slate-50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-950">
                        {entry.category.replace(/_/g, " ")}
                      </span>
                      <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                        {entry.source}
                      </span>
                    </div>
                    <div className="text-sm text-slate-600">
                      {entry.description || entry.vendorName || "Actual cost posting"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {formatDateLabel(entry.entryDate)} ·{" "}
                      {taskMap.get(entry.taskId ?? "") ?? "Project-level"} ·{" "}
                      {resourceMap.get(entry.resourceId ?? "") ?? "No resource"}
                    </div>
                    {entry.referenceCode || entry.vendorName ? (
                      <div className="text-xs text-slate-500">
                        {[entry.vendorName, entry.referenceCode].filter(Boolean).join(" · ")}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="text-sm font-semibold text-slate-950">
                      {formatCurrency(entry.amount, entry.currencyCode)}
                    </div>
                    {entry.source === "TIMESHEET" ? (
                      <div className="text-xs text-slate-500">
                        Delete the linked timesheet to remove this labor cost.
                      </div>
                    ) : (
                      <form action={deleteActualCostEntryAction}>
                        <input type="hidden" name="projectId" value={view.aggregate.project.id} />
                        <input type="hidden" name="entryId" value={entry.id} />
                        <Button type="submit" variant="outline" size="sm">
                          Delete
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-border/70 bg-slate-50 p-4 text-sm text-slate-500">
              No actual cost ledger postings yet. Timesheets will auto-create labor cost
              lines, and you can post non-labor actuals manually here.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
