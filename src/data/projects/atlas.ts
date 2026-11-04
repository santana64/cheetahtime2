import type { Assignment, Dependency, ProjectAggregate, Resource, Task } from "@/types/planning";

import {
  assignmentFactory,
  createCalendar,
  createProject,
  dependencyFactory,
  resourceFactory,
  taskFactory,
} from "@/data/projects/factories";

export function createAtlasProject(): ProjectAggregate {
  const projectId = "atlas-productization-program";
  const task = taskFactory(projectId);
  const dependency = dependencyFactory(projectId);
  const resource = resourceFactory(projectId);
  const assignment = assignmentFactory(projectId);

  const project = createProject({
    id: projectId,
    slug: projectId,
    code: "AMG-0601",
    name: "Aménagement Voie Verte — Vallée du Cher",
    clientName: "Communauté de Communes du Cher",
    description:
      "Création d'une voie verte : cadrage de l'opération, conception de l'aménagement (tracé, VRD, dossier réglementaire) et démarrage des travaux par tranche.",
    portfolio: "Infrastructure & VRD",
    ownerName: "Camille Duret",
    sponsorName: "Vincent Hallé",
    status: "PLANNING",
    health: "ON_TRACK",
    targetStartDate: "2026-06-01",
    targetFinishDate: "2026-07-03",
    budgetAmount: 420000,
    updatedAt: "2026-06-02T08:10:00.000Z",
  });

  const tasks: Task[] = [
    task({ id: "at-1", name: "Cadrage de l'opération", sortOrder: 10, type: "SUMMARY", durationDays: 0 }),
    task({
      id: "at-1-1",
      parentId: "at-1",
      name: "Lancement de l'opération",
      sortOrder: 11,
      type: "MILESTONE",
      durationDays: 0,
      constraintType: "START_NO_EARLIER_THAN",
      constraintDate: "2026-06-01",
      priority: "HIGH",
    }),
    task({
      id: "at-1-2",
      parentId: "at-1",
      name: "Étude de faisabilité & relevés",
      sortOrder: 12,
      type: "TASK",
      durationDays: 4,
      priority: "HIGH",
      description: "Relevés topographiques, contraintes de site et dépendances inter-lots.",
    }),
    task({
      id: "at-1-3",
      parentId: "at-1",
      name: "Validation de la faisabilité",
      sortOrder: 13,
      type: "MILESTONE",
      durationDays: 0,
      priority: "HIGH",
    }),
    task({ id: "at-2", name: "Conception de l'aménagement", sortOrder: 20, type: "SUMMARY", durationDays: 0 }),
    task({
      id: "at-2-1",
      parentId: "at-2",
      name: "Tracé & profils en travers",
      sortOrder: 21,
      type: "TASK",
      durationDays: 5,
      priority: "HIGH",
    }),
    task({
      id: "at-2-2",
      parentId: "at-2",
      name: "Chiffrage & estimation",
      sortOrder: 22,
      type: "TASK",
      durationDays: 4,
    }),
    task({
      id: "at-2-3",
      parentId: "at-2",
      name: "Dossier réglementaire (loi sur l'eau)",
      sortOrder: 23,
      type: "TASK",
      durationDays: 4,
    }),
    task({ id: "at-3", name: "Démarrage des travaux", sortOrder: 30, type: "SUMMARY", durationDays: 0 }),
    task({
      id: "at-3-1",
      parentId: "at-3",
      name: "Terrassement (tranche 1)",
      sortOrder: 31,
      type: "TASK",
      durationDays: 5,
      priority: "HIGH",
    }),
    task({
      id: "at-3-2",
      parentId: "at-3",
      name: "Réception tranche 1",
      sortOrder: 32,
      type: "MILESTONE",
      durationDays: 0,
    }),
  ];

  const dependencies: Dependency[] = [
    dependency("at-d1", "at-1-1", "at-1-2", "FS"),
    dependency("at-d2", "at-1-2", "at-1-3", "FS"),
    dependency("at-d3", "at-1-3", "at-2-1", "FS"),
    dependency("at-d4", "at-2-1", "at-2-2", "SS", 1),
    dependency("at-d5", "at-2-1", "at-2-3", "FS"),
    dependency("at-d6", "at-2-3", "at-3-1", "FF"),
    dependency("at-d7", "at-2-2", "at-3-1", "FS"),
    dependency("at-d8", "at-3-1", "at-3-2", "FS"),
  ];

  const resources: Resource[] = [
    resource({ id: "at-r1", name: "Camille Duret", role: "Directrice de projet", color: "#0f766e" }),
    resource({ id: "at-r2", name: "Éva Bernard", role: "Ingénieure VRD", color: "#1d4ed8" }),
    resource({ id: "at-r3", name: "Marc Ridel", role: "Conducteur de travaux", color: "#9333ea" }),
    resource({ id: "at-r4", name: "Hélène Zola", role: "Économiste de la construction", color: "#b45309" }),
  ];

  const assignments: Assignment[] = [
    assignment("at-a1", "at-1-1", "at-r1", 40),
    assignment("at-a2", "at-1-2", "at-r2", 50),
    assignment("at-a3", "at-1-2", "at-r1", 25),
    assignment("at-a4", "at-2-1", "at-r2", 60),
    assignment("at-a5", "at-2-2", "at-r4", 60),
    assignment("at-a6", "at-2-3", "at-r3", 80),
    assignment("at-a7", "at-3-1", "at-r1", 30),
    assignment("at-a8", "at-3-1", "at-r3", 50),
  ];

  return {
    project,
    calendar: createCalendar(projectId, "Europe/Paris"),
    tasks,
    dependencies,
    resources,
    assignments,
    baselines: [],
    timesheetEntries: [],
    actualCostEntries: [],
  };
}
