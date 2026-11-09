"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function ProjectImportPanel() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  return (
    <Card className="border-white/70 bg-white/95 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Importer un fichier projet</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-slate-600">
          Importez un planning existant : fichier MS Project (.mpp ou XML), Primavera P6 (.xer).
          L&apos;export vers MS Project se fait au format XML (MSPDI), que MS Project ouvre directement.
        </div>

        <form
          className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_220px_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const formData = new FormData(form);

            startTransition(async () => {
              setMessage(null);
              setWarnings([]);

              try {
                const response = await fetch("/api/projects/import", {
                  method: "POST",
                  body: formData,
                });
                const payload = (await response.json()) as {
                  error?: string;
                  projectId?: string;
                  warnings?: string[];
                };

                if (!response.ok || !payload.projectId) {
                  throw new Error(
                    payload.error || "Impossible d'importer le fichier de planification sélectionné.",
                  );
                }

                if (payload.warnings?.length) {
                  setWarnings(payload.warnings);
                }

                router.push(`/projects/${payload.projectId}/dashboard`);
              } catch (error) {
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "Impossible d'importer le fichier de planification sélectionné.",
                );
              }
            });
          }}
        >
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Fichier projet
            <Input
              name="file"
              type="file"
              accept=".xml,.mpp,.xer,application/xml,text/xml,text/plain,application/octet-stream"
              required
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Importé par
            <Input name="importedBy" defaultValue="Import PMO" />
          </label>
          <div className="flex items-end">
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? "Import en cours..." : "Importer"}
            </Button>
          </div>
        </form>

        <div className="grid gap-2 text-xs text-slate-500 md:grid-cols-3">
          <div>Formats acceptés : MS Project (.mpp, .xml), Primavera P6 (.xer).</div>
          <div>Meilleur aller-retour : MS Project XML (MSPDI), avec les extensions Cheetah Time.</div>
          <div>Export MS Project : fichier .xml (MSPDI). Un .mpp natif n&apos;est pas produit : ouvrez le .xml dans MS Project puis « Enregistrer sous » .mpp.</div>
        </div>

        {message ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {message}
          </div>
        ) : null}

        {warnings.length ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {warnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
