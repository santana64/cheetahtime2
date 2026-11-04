"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function ProjectImportPanel() {
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
          Importez un vrai fichier de planification dans Cheetah Time. Les allers-retours MSPDI XML
          sont supportes de bout en bout, l'import `.xer` ouvre les plannings Primavera P6, et l'import natif `.mpp` est gere via le bridge MPXJ.
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
                    payload.error || "Impossible d'importer le fichier de planification selectionne.",
                  );
                }

                if (payload.warnings?.length) {
                  setWarnings(payload.warnings);
                }

                window.location.href = `/projects/${payload.projectId}/dashboard`;
              } catch (error) {
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "Impossible d'importer le fichier de planification selectionne.",
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
            Importe par
            <Input name="importedBy" defaultValue="Import PMO" />
          </label>
          <div className="flex items-end">
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? "Import en cours..." : "Importer"}
            </Button>
          </div>
        </form>

        <div className="grid gap-2 text-xs text-slate-500 md:grid-cols-3">
          <div>Formats acceptes : MSPDI XML, Primavera P6 `.xer`, import natif `.mpp`.</div>
          <div>Meilleur format d'aller-retour : MSPDI XML avec extensions Cheetah Time.</div>
          <div>L'export natif `.mpp` n'est pas disponible dans le bridge open source actuel.</div>
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
