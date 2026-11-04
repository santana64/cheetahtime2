"use client";

import { useActionState, useEffect, useRef } from "react";

import { addTaskCommentAction, deleteTaskCommentAction } from "@/features/projects/actions";
import { initialFormState, type FormState } from "@/features/projects/form-state";

interface TaskComment {
  id: string;
  projectId: string;
  taskId: string;
  authorName: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

function hashColor(name: string): string {
  const palette = [
    "#56a45b",
    "#f4a321",
    "#1a4a20",
    "#2e7d5e",
    "#b45309",
    "#6b7280",
    "#7c3aed",
    "#be185d",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length];
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const ts = new Date(iso).getTime();
  const diff = Math.floor((now - ts) / 1000);

  if (diff < 60) return "a l instant";
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return `il y a ${m} min`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return `il y a ${h} h`;
  }

  const d = new Date(iso);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  if (d >= todayStart) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `aujourd hui ${hh}:${mm}`;
  }

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  if (d >= yesterdayStart) return "hier";

  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function CommentBubble({
  comment,
}: {
  comment: TaskComment;
}) {
  const bg = hashColor(comment.authorName);
  const ini = initials(comment.authorName);
  const time = relativeTime(comment.createdAt);

  return (
    <div
      className="group relative flex gap-2"
      style={{ alignItems: "flex-start" }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 28,
          height: 28,
          minWidth: 28,
          borderRadius: "50%",
          background: bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.02em",
          marginTop: 2,
        }}
      >
        {ini}
      </div>

      {/* Bubble */}
      <div
        style={{
          flex: 1,
          background: "#f8f8f8",
          border: "1px solid #e5e5e5",
          borderRadius: 10,
          padding: "7px 10px",
          position: "relative",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: "#1a4a20" }}>
            {comment.authorName}
          </span>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>{time}</span>
        </div>

        {/* Content */}
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: "#374151",
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
          }}
        >
          {comment.content}
        </p>

        {/* Delete button */}
        <form action={deleteTaskCommentAction} style={{ position: "absolute", top: 6, right: 6 }}>
          <input type="hidden" name="commentId" value={comment.id} />
          <input type="hidden" name="taskId" value={comment.taskId} />
          <input type="hidden" name="projectId" value={comment.projectId} />
          <button
            type="submit"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "0 2px",
              fontSize: 14,
              color: "#9ca3af",
              lineHeight: 1,
            }}
            title="Supprimer"
          >
            &times;
          </button>
        </form>
      </div>
    </div>
  );
}

export function TaskComments({
  projectId,
  taskId,
  comments,
}: {
  projectId: string;
  taskId: string;
  comments: TaskComment[];
}) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    addTaskCommentAction,
    initialFormState,
  );

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state.status === "success" && textareaRef.current) {
      textareaRef.current.value = "";
    }
  }, [state]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Comment list */}
      <div
        style={{
          maxHeight: 300,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          paddingRight: 4,
        }}
      >
        {comments.length === 0 ? (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: "#9ca3af",
              textAlign: "center",
              padding: "24px 0",
            }}
          >
            Pas encore de commentaires. Soyez le premier !
          </p>
        ) : (
          comments.map((c) => <CommentBubble key={c.id} comment={c} />)
        )}
      </div>

      {/* Error / success message */}
      {state.status === "error" && state.message && (
        <p style={{ margin: 0, fontSize: 12, color: "#dc2626" }}>{state.message}</p>
      )}

      {/* Add comment form */}
      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="taskId" value={taskId} />
        <input type="hidden" name="authorName" value="Moi" />

        <textarea
          ref={textareaRef}
          name="content"
          rows={2}
          placeholder="Ajouter un commentaire..."
          required
          style={{
            width: "100%",
            resize: "vertical",
            borderRadius: 8,
            border: "1px solid #e5e5e5",
            padding: "8px 10px",
            fontSize: 13,
            color: "#374151",
            outline: "none",
            fontFamily: "inherit",
            lineHeight: 1.5,
            boxSizing: "border-box",
          }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="submit"
            disabled={isPending}
            style={{
              background: isPending ? "#9ca3af" : "#56a45b",
              color: "white",
              border: "none",
              borderRadius: 7,
              padding: "6px 18px",
              fontSize: 13,
              fontWeight: 600,
              cursor: isPending ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {isPending ? "Envoi..." : "Envoyer"}
          </button>
        </div>
      </form>
    </div>
  );
}
