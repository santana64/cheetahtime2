"use client";

import { useActionState, useState } from "react";

import {
  addTaskAttachmentAction,
  addTaskCommentAction,
  deleteTaskAttachmentAction,
  deleteTaskCommentAction,
} from "@/features/projects/actions";
import { initialFormState } from "@/features/projects/form-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { TaskAttachment } from "@/types/planning";
import type { TaskComment } from "@/services/comments";
import type { ScheduledTask } from "@/types/planning";

export function TaskCollaborationPanel({
  projectId,
  tasks,
  comments,
  attachments,
}: {
  projectId: string;
  tasks: ScheduledTask[];
  comments: TaskComment[];
  attachments: TaskAttachment[];
}) {
  const taskOptions = tasks.filter((task) => !task.isSummary);
  const [selectedTaskId, setSelectedTaskId] = useState(taskOptions[0]?.id ?? "");
  const selectedTask = taskOptions.find((task) => task.id === selectedTaskId) ?? taskOptions[0] ?? null;
  const [commentState, commentAction, commentPending] = useActionState(addTaskCommentAction, initialFormState);
  const [attachmentState, attachmentAction, attachmentPending] = useActionState(addTaskAttachmentAction, initialFormState);

  const selectedComments = comments.filter((comment) => comment.taskId === selectedTask?.id);
  const selectedAttachments = attachments.filter((attachment) => attachment.taskId === selectedTask?.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-[#1a4a20]">Collaboration tache</CardTitle>
        <p className="text-xs text-slate-500">
          Commentaires, @mentions par e-mail, pieces jointes binaires et references documentaires sur une tache executable.
        </p>
      </CardHeader>
      <CardContent className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
            Tache
            <Select value={selectedTaskId} onChange={(event) => setSelectedTaskId(event.target.value)} className="h-9">
              {taskOptions.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.wbsCode} - {task.name}
                </option>
              ))}
            </Select>
          </label>

          {selectedTask ? (
            <>
              <form action={commentAction} className="space-y-3 rounded-xl border border-slate-200 bg-white/80 p-4">
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="taskId" value={selectedTask.id} />
                <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
                  Commentaire
                  <Textarea
                    name="content"
                    required
                    className="min-h-24"
                    placeholder="Ex. @admin@cheetahtime.local merci de valider cette dependance."
                  />
                </label>
                <div className="flex items-center justify-between gap-3">
                  <p className={commentState.status === "error" ? "text-xs text-rose-600" : "text-xs text-slate-400"}>
                    {commentState.message || "Les mentions @email creent une notification in-app."}
                  </p>
                  <Button type="submit" disabled={commentPending} size="sm">
                    Commenter
                  </Button>
                </div>
              </form>

              <form action={attachmentAction} encType="multipart/form-data" className="space-y-3 rounded-xl border border-slate-200 bg-white/80 p-4">
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="taskId" value={selectedTask.id} />
                <input type="hidden" name="kind" value="LINK" />
                <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
                  Nom
                  <Input name="fileName" className="h-9" placeholder="Compte rendu / plan / decision" />
                </label>
                <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
                  Fichier binaire
                  <Input name="file" type="file" className="h-9 bg-white" />
                </label>
                <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
                  URL ou reference fichier
                  <Input name="url" className="h-9" placeholder="https://... ou reference documentaire" />
                </label>
                <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
                  Description
                  <Input name="description" className="h-9" />
                </label>
                <div className="flex items-center justify-between gap-3">
                  <p className={attachmentState.status === "error" ? "text-xs text-rose-600" : "text-xs text-slate-400"}>
                    {attachmentState.message || "Ajoutez un fichier binaire, ou seulement une URL/reference documentaire."}
                  </p>
                  <Button type="submit" disabled={attachmentPending} size="sm">
                    Joindre
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 p-6 text-sm text-slate-500">
              Ajoutez une tache executable pour ouvrir la collaboration.
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-800">Commentaires</h3>
            {selectedComments.length ? selectedComments.map((comment) => (
              <div key={comment.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold text-slate-700">{comment.authorName}</div>
                  <div className="text-[11px] text-slate-400">{new Date(comment.createdAt).toLocaleString("fr-FR")}</div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-slate-700">{comment.content}</p>
                <form action={deleteTaskCommentAction} className="mt-2 text-right">
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="taskId" value={comment.taskId} />
                  <input type="hidden" name="commentId" value={comment.id} />
                  <Button type="submit" variant="outline" size="sm">Supprimer</Button>
                </form>
              </div>
            )) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 p-6 text-sm text-slate-500">
                Aucun commentaire sur cette tache.
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-800">Pieces jointes</h3>
            {selectedAttachments.length ? selectedAttachments.map((attachment) => (
              <div key={attachment.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <a href={attachment.url ?? "#"} className="text-sm font-bold text-[#1a4a20] underline-offset-2 hover:underline">
                  {attachment.fileName}
                </a>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {attachment.kind === "BINARY"
                    ? `${attachment.mimeType ?? "fichier"} - ${attachment.sizeBytes ?? 0} octets - sha256 ${attachment.checksumSha256?.slice(0, 12) ?? "n/a"}`
                    : attachment.description || attachment.url}
                </p>
                <form action={deleteTaskAttachmentAction} className="mt-2 text-right">
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="taskId" value={attachment.taskId} />
                  <input type="hidden" name="attachmentId" value={attachment.id} />
                  <Button type="submit" variant="outline" size="sm">Supprimer</Button>
                </form>
              </div>
            )) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 p-6 text-sm text-slate-500">
                Aucune piece jointe sur cette tache.
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
