"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 180_000; // 3 min — app locale mono-poste (perf) ; refresh immédiat au retour d'onglet

/**
 * Silently refreshes the page every POLL_INTERVAL_MS milliseconds so
 * multiple collaborators always see a reasonably up-to-date view.
 * Pauses when the tab is hidden to avoid unnecessary requests.
 */
export function LiveRefresh({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function refresh() {
      if (document.visibilityState === "hidden") return;
      router.refresh();
      setLastRefresh(new Date());
    }

    intervalRef.current = setInterval(refresh, POLL_INTERVAL_MS);

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        // Refresh immediately when user comes back to tab
        refresh();
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [router, projectId]);

  // Invisible — no UI noise
  return (
    <span
      className="sr-only"
      aria-live="polite"
      aria-atomic="true"
    >
      {`Données synchronisées à ${lastRefresh.toLocaleTimeString("fr-FR")}`}
    </span>
  );
}
