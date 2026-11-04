import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { getPrismaClient, getResolvedPersistenceMode } from "@/lib/prisma";
import {
  duplicateProject,
  exportProjectData,
  markProjectAsTemplateDerived,
} from "@/services/projects";

export interface ProjectTemplateSummary {
  id: string;
  workspaceId: string;
  sourceProjectId?: string | null;
  name: string;
  description: string;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

const localTemplates = new Map<string, ProjectTemplateSummary[]>();

export async function listProjectTemplates(workspaceId: string): Promise<ProjectTemplateSummary[]> {
  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    const rows = await db.projectTemplate.findMany({
      where: { workspaceId },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspaceId,
      sourceProjectId: row.sourceProjectId,
      name: row.name,
      description: row.description,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  return localTemplates.get(workspaceId) ?? [];
}

export async function saveProjectAsTemplate(input: {
  workspaceId: string;
  projectId: string;
  name: string;
  description?: string;
  createdByUserId?: string | null;
}) {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Nom du modele requis.");
  }

  const payload = await exportProjectData(input.projectId);
  const timestamp = new Date().toISOString();

  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    const row = await db.projectTemplate.create({
      data: {
        workspaceId: input.workspaceId,
        sourceProjectId: input.projectId,
        name,
        description: input.description ?? "",
        snapshotJson: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue,
        createdByUserId: input.createdByUserId ?? null,
      },
    });
    return row.id;
  }

  const template: ProjectTemplateSummary = {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    sourceProjectId: input.projectId,
    name,
    description: input.description ?? "",
    createdByUserId: input.createdByUserId ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  localTemplates.set(input.workspaceId, [template, ...(localTemplates.get(input.workspaceId) ?? [])]);
  return template.id;
}

export async function createProjectFromTemplate(input: {
  workspaceId: string;
  templateId: string;
  name?: string | null;
  actorName: string;
}) {
  const templates = await listProjectTemplates(input.workspaceId);
  const template = templates.find((entry) => entry.id === input.templateId);
  if (!template?.sourceProjectId) {
    throw new Error("Modele introuvable ou sans projet source.");
  }

  const projectId = await duplicateProject({
    projectId: template.sourceProjectId,
    name: input.name?.trim() || `${template.name} - Nouveau projet`,
    duplicatedBy: input.actorName,
  });
  await markProjectAsTemplateDerived(projectId, template.sourceProjectId);
  return projectId;
}
