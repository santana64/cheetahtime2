"use client";

import { Button } from "@/components/ui/button";

export default function ProjectRouteError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div className="rounded-xl border border-rose-200/60 bg-rose-50/30 p-8">
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-rose-600">
        Erreur du projet
      </div>
      <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
        L&apos;affichage du projet a echoue.
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        {error.message || "Une erreur inattendue a interrompu le chargement de ce projet."}
      </p>
      <Button variant="outline" size="sm" className="mt-5" onClick={() => unstable_retry()}>
        Reessayer
      </Button>
    </div>
  );
}
