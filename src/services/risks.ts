import { randomUUID } from "node:crypto";
import type {
  RiskCategory,
  RiskLevel,
  RiskStatus,
} from "@/generated/prisma/enums";
import { getResolvedPersistenceMode } from "@/lib/prisma";
import { getPrismaClient } from "@/lib/prisma";

export type { RiskCategory, RiskLevel, RiskStatus } from "@/generated/prisma/enums";

export interface RiskItem {
  id: string;
  projectId: string;
  code: string;
  title: string;
  description: string;
  category: RiskCategory;
  probability: RiskLevel;
  impact: RiskLevel;
  status: RiskStatus;
  ownerName: string;
  mitigation: string;
  contingency: string;
  identifiedDate: string;
  targetDate: string | null;
  closedDate: string | null;
  createdAt: string;
  updatedAt: string;
}

// In-memory fallback for local dev mode
const localRisks = new Map<string, RiskItem[]>();

function getLocalRisks(projectId: string): RiskItem[] {
  return localRisks.get(projectId) ?? [];
}

function isoDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

export async function listRisks(projectId: string): Promise<RiskItem[]> {
  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    const rows = await db.riskItem.findMany({
      where: { projectId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
    return rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      code: r.code,
      title: r.title,
      description: r.description,
      category: r.category as RiskCategory,
      probability: r.probability as RiskLevel,
      impact: r.impact as RiskLevel,
      status: r.status as RiskStatus,
      ownerName: r.ownerName,
      mitigation: r.mitigation,
      contingency: r.contingency,
      identifiedDate: isoDate(r.identifiedDate) ?? new Date().toISOString().slice(0, 10),
      targetDate: isoDate(r.targetDate),
      closedDate: isoDate(r.closedDate),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }
  return getLocalRisks(projectId);
}

export interface CreateRiskInput {
  projectId: string;
  title: string;
  description?: string;
  category?: RiskCategory;
  probability?: RiskLevel;
  impact?: RiskLevel;
  ownerName?: string;
  mitigation?: string;
  contingency?: string;
  identifiedDate?: string;
  targetDate?: string;
}

export async function createRisk(input: CreateRiskInput): Promise<RiskItem> {
  const existing = await listRisks(input.projectId);
  const code = `R-${String(existing.length + 1).padStart(3, "0")}`;
  const now = new Date().toISOString().slice(0, 10);

  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    const r = await db.riskItem.create({
      data: {
        projectId: input.projectId,
        code,
        title: input.title,
        description: input.description ?? "",
        category: input.category ?? "TECHNICAL",
        probability: input.probability ?? "MEDIUM",
        impact: input.impact ?? "MEDIUM",
        status: "OPEN",
        ownerName: input.ownerName ?? "",
        mitigation: input.mitigation ?? "",
        contingency: input.contingency ?? "",
        identifiedDate: new Date(input.identifiedDate ?? now),
        targetDate: input.targetDate ? new Date(input.targetDate) : null,
      },
    });
    return {
      id: r.id,
      projectId: r.projectId,
      code: r.code,
      title: r.title,
      description: r.description,
      category: r.category as RiskCategory,
      probability: r.probability as RiskLevel,
      impact: r.impact as RiskLevel,
      status: r.status as RiskStatus,
      ownerName: r.ownerName,
      mitigation: r.mitigation,
      contingency: r.contingency,
      identifiedDate: isoDate(r.identifiedDate) ?? now,
      targetDate: isoDate(r.targetDate),
      closedDate: null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  const risk: RiskItem = {
    id: randomUUID(),
    projectId: input.projectId,
    code,
    title: input.title,
    description: input.description ?? "",
    category: input.category ?? "TECHNICAL",
    probability: input.probability ?? "MEDIUM",
    impact: input.impact ?? "MEDIUM",
    status: "OPEN",
    ownerName: input.ownerName ?? "",
    mitigation: input.mitigation ?? "",
    contingency: input.contingency ?? "",
    identifiedDate: input.identifiedDate ?? now,
    targetDate: input.targetDate ?? null,
    closedDate: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  localRisks.set(input.projectId, [...getLocalRisks(input.projectId), risk]);
  return risk;
}

export interface UpdateRiskInput {
  id: string;
  projectId: string;
  title?: string;
  description?: string;
  category?: RiskCategory;
  probability?: RiskLevel;
  impact?: RiskLevel;
  status?: RiskStatus;
  ownerName?: string;
  mitigation?: string;
  contingency?: string;
  targetDate?: string | null;
  closedDate?: string | null;
}

export async function updateRisk(input: UpdateRiskInput): Promise<RiskItem> {
  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    const r = await db.riskItem.update({
      where: { id: input.id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.category !== undefined && { category: input.category }),
        ...(input.probability !== undefined && { probability: input.probability }),
        ...(input.impact !== undefined && { impact: input.impact }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.ownerName !== undefined && { ownerName: input.ownerName }),
        ...(input.mitigation !== undefined && { mitigation: input.mitigation }),
        ...(input.contingency !== undefined && { contingency: input.contingency }),
        ...(input.targetDate !== undefined && { targetDate: input.targetDate ? new Date(input.targetDate) : null }),
        ...(input.closedDate !== undefined && { closedDate: input.closedDate ? new Date(input.closedDate) : null }),
      },
    });
    return {
      id: r.id, projectId: r.projectId, code: r.code, title: r.title,
      description: r.description, category: r.category as RiskCategory,
      probability: r.probability as RiskLevel, impact: r.impact as RiskLevel,
      status: r.status as RiskStatus, ownerName: r.ownerName,
      mitigation: r.mitigation, contingency: r.contingency,
      identifiedDate: isoDate(r.identifiedDate) ?? "",
      targetDate: isoDate(r.targetDate), closedDate: isoDate(r.closedDate),
      createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
    };
  }
  const risks = getLocalRisks(input.projectId);
  const idx = risks.findIndex((r) => r.id === input.id);
  if (idx === -1) throw new Error("Risk not found");
  const updated = { ...risks[idx], ...input, updatedAt: new Date().toISOString() } as RiskItem;
  risks[idx] = updated;
  localRisks.set(input.projectId, risks);
  return updated;
}

export async function deleteRisk(id: string, projectId: string): Promise<void> {
  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    await db.riskItem.delete({ where: { id } });
    return;
  }
  localRisks.set(projectId, getLocalRisks(projectId).filter((r) => r.id !== id));
}
