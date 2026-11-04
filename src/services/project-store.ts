import {
  getConfiguredPersistenceMode,
  getResolvedPersistenceMode,
} from "@/lib/prisma";
import type { AppDataStore } from "@/types/planning";

// NOTE: local-store and prisma-store are loaded with dynamic imports so that
// Turbopack only bundles the active store. Static imports of local-store would
// pull process.cwd() into every route bundle, causing the NFT tracer to include
// the entire project directory in the Vercel deployment artifact.

export interface PersistenceInfo {
  mode: "local" | "prisma";
  label: string;
  description: string;
}

export function getPersistenceInfo(): PersistenceInfo {
  const configuredMode = getConfiguredPersistenceMode();
  const resolvedMode = getResolvedPersistenceMode();

  if (resolvedMode === "prisma") {
    return {
      mode: "prisma",
      label: "PostgreSQL via Prisma",
      description: `Project data is persisted through Prisma into PostgreSQL (configured mode: ${configuredMode}).`,
    };
  }

  return {
    mode: "local",
    label: "Local runtime store",
    description:
      configuredMode === "local"
        ? "Project data is explicitly running in the versioned local JSON runtime store."
        : "Project data is using the versioned local JSON runtime store because DATABASE_URL is not configured.",
  };
}

export async function readStore(): Promise<AppDataStore> {
  if (getResolvedPersistenceMode() === "prisma") {
    const { readStore: prismaRead } = await import("@/services/prisma-store");
    return prismaRead();
  }
  const { readStore: localRead } = await import("@/services/local-store");
  return localRead();
}

export async function mutateStore(
  mutate: (draft: AppDataStore) => void | Promise<void>,
): Promise<AppDataStore> {
  if (getResolvedPersistenceMode() === "prisma") {
    const { mutateStore: prismaMutate } = await import("@/services/prisma-store");
    return prismaMutate(mutate);
  }
  const { mutateStore: localMutate } = await import("@/services/local-store");
  return localMutate(mutate);
}
