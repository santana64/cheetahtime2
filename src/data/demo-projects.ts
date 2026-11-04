import type { AppDataStore } from "@/types/planning";

import { createAtlasProject } from "@/data/projects/atlas";
import { createMeridianProject } from "@/data/projects/meridian";
import { createNorthstarProject } from "@/data/projects/northstar";

export const initialDataStore: AppDataStore = {
  version: 3,
  metadata: {
    seededFrom: "cheetah-time-demo-portfolio-v3",
    initializedAt: "2026-04-15T09:00:00.000Z",
    lastUpdatedAt: "2026-04-15T09:00:00.000Z",
  },
  projects: [
    createNorthstarProject(),
    createMeridianProject(),
    createAtlasProject(),
  ],
};
