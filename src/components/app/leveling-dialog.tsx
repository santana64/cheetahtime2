"use client";

import { useRef, type ReactNode } from "react";

/**
 * Bouton « Avant / après nivellement » : ouvre le comparatif dans une fenêtre
 * par-dessus le planning (au lieu de devoir descendre en bas de page).
 * <dialog> natif : Échap, la croix ou un clic hors de la fenêtre la ferment.
 */
export function LevelingDialog({ shiftedCount, children }: { shiftedCount: number; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="toolbar-btn toolbar-btn-primary" onClick={() => ref.current?.showModal()}>
        Avant / après nivellement
        {shiftedCount > 0 ? (
          <span className="ml-1.5 rounded-full bg-[#f4a321] px-1.5 text-[10px] font-black text-white">{shiftedCount}</span>
        ) : null}
      </button>
      <dialog
        ref={ref}
        aria-label="Planning avant et après nivellement"
        className="m-auto w-[min(1400px,96vw)] max-h-[92vh] overflow-hidden rounded-2xl border-0 bg-[#f6f4ee] p-0 shadow-2xl backdrop:bg-slate-900/45"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <div className="flex items-center justify-between border-b border-black/[0.06] bg-white px-5 py-3">
          <span className="text-[13px] font-bold text-[#1a4a20]">Planning avant / après nivellement</span>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-lg text-slate-500 hover:bg-slate-100"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
        <div className="max-h-[calc(92vh-56px)] overflow-y-auto p-4">{children}</div>
      </dialog>
    </>
  );
}
