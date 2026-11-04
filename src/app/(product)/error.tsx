"use client";

import { Button } from "@/components/ui/button";

export default function ProductError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div className="rounded-xl border border-rose-200/60 bg-rose-50/30 p-8">
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-rose-600">
        Erreur d'espace de travail
      </div>
      <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
        L'interface produit n'a pas pu terminer son chargement.
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {error.message || "Un incident inattendu a interrompu la route en cours."}
      </p>
      <Button variant="outline" size="sm" className="mt-5" onClick={() => unstable_retry()}>
        Reessayer
      </Button>
    </div>
  );
}
