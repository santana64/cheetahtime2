import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { persistenceError, validationError } from "@/lib/planning/errors";

const globalForPrisma = globalThis as typeof globalThis & {
  __cheetahPrisma?: PrismaClient;
};
const persistenceModes = ["auto", "prisma", "local"] as const;
export type PersistenceMode = (typeof persistenceModes)[number];

function getConnectionString() {
  const connectionString = process.env["DATABASE_URL"]?.trim();

  if (!connectionString) {
    throw persistenceError(
      "DATABASE_URL must be set to use Prisma-backed persistence in Cheetah Time.",
    );
  }

  return connectionString;
}

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: getConnectionString() });
  return new PrismaClient({ adapter });
}

export function getConfiguredPersistenceMode(): PersistenceMode {
  const rawMode =
    process.env["CHEETAH_TIME_PERSISTENCE"]?.trim().toLowerCase() ?? "auto";

  if (
    persistenceModes.includes(rawMode as PersistenceMode)
  ) {
    return rawMode as PersistenceMode;
  }

  throw validationError(
    "CHEETAH_TIME_PERSISTENCE must be one of: auto, prisma, local.",
  );
}

export function isDatabaseUrlConfigured() {
  return Boolean(process.env["DATABASE_URL"]?.trim());
}

export function getResolvedPersistenceMode() {
  const configuredMode = getConfiguredPersistenceMode();

  if (configuredMode === "local") {
    return "local" as const;
  }

  if (configuredMode === "prisma") {
    if (!isDatabaseUrlConfigured()) {
      throw persistenceError(
        "CHEETAH_TIME_PERSISTENCE=prisma requires DATABASE_URL to be configured.",
      );
    }

    return "prisma" as const;
  }

  return isDatabaseUrlConfigured() ? ("prisma" as const) : ("local" as const);
}

export function isPrismaPersistenceConfigured() {
  return getResolvedPersistenceMode() === "prisma";
}

export function getPrismaClient() {
  if (!isPrismaPersistenceConfigured()) {
    throw persistenceError(
      "Prisma persistence was requested, but the resolved persistence mode is not Prisma.",
    );
  }

  if (process.env.NODE_ENV === "production") {
    return createPrismaClient();
  }

  if (!globalForPrisma.__cheetahPrisma) {
    globalForPrisma.__cheetahPrisma = createPrismaClient();
  }

  return globalForPrisma.__cheetahPrisma;
}
