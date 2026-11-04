"use client";

import { BrandMark } from "@/components/app/brand-mark";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-[linear-gradient(180deg,#f7f5ee_0%,#eef2f1_100%)]">
        <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center gap-6 px-6">
          <BrandMark />
          <div className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Erreur critique
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950">
              Cheetah Time a rencontre une erreur inattendue.
            </h1>
            <p className="max-w-2xl text-sm leading-7 text-slate-600">
              {error.message || "Une erreur inattendue s'est produite pendant le rendu de l'application."}
            </p>
          </div>
          <Button onClick={() => unstable_retry()}>Reessayer</Button>
        </div>
      </body>
    </html>
  );
}
