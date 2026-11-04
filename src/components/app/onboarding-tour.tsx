"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "cheetah_tour_done";

const STEPS = [
  {
    emoji: "🐆",
    title: "Bienvenue dans Cheetah Time",
    desc: "Le logiciel de planification de projet B2B le plus rapide du marché. Ce tour de 60 secondes te montre l'essentiel.",
    cta: "C'est parti →",
    color: "#56a45b",
    hint: null,
  },
  {
    emoji: "📋",
    title: "Le Portefeuille",
    desc: "C'est ta page d'accueil. Tu vois tous tes projets d'un coup — statut, santé, avancement. Clique sur un projet pour l'ouvrir.",
    cta: "Suivant →",
    color: "#56a45b",
    hint: "Onglet « Portefeuille » dans la nav",
    action: { label: "Voir le portefeuille", href: "/projects" },
  },
  {
    emoji: "📅",
    title: "Le Gantt interactif",
    desc: "Dans chaque projet → onglet « Planning ». Glisse les tâches, crée des dépendances (FS, SS, FF, SF), visualise le chemin critique en rouge.",
    cta: "Suivant →",
    color: "#f4a321",
    hint: "Onglet « Planning » dans un projet",
  },
  {
    emoji: "📊",
    title: "Le Dashboard EVM",
    desc: "Onglet « Dashboard » → indicateurs Earned Value en temps réel : CPI, SPI, EAC, VAC. Vert = dans les clous, rouge = alerte.",
    cta: "Suivant →",
    color: "#56a45b",
    hint: "Onglet « Dashboard » dans un projet",
  },
  {
    emoji: "👥",
    title: "Les Ressources",
    desc: "Onglet « Ressources » → affecte des personnes aux tâches, visualise la charge, détecte les surcharges. Le nivellement auto réorganise les tâches.",
    cta: "Suivant →",
    color: "#f4a321",
    hint: "Onglet « Ressources » dans un projet",
  },
  {
    emoji: "🚨",
    title: "Les Alertes intelligentes",
    desc: "11 types d'alertes automatiques : retard prévu, dérive budget, ressource surchargée, tâche sans assigné... Tout dans « Alertes » dans la nav.",
    cta: "Suivant →",
    color: "#e84040",
    hint: "Onglet « Alertes » dans la nav",
    action: { label: "Voir les alertes", href: "/alerts" },
  },
  {
    emoji: "📤",
    title: "Exports & Rapports",
    desc: "Export PDF, Excel, CSV, SVG Gantt, JSON depuis chaque projet. Les rapports consolidés sont dans « Rapports » dans la nav.",
    cta: "Suivant →",
    color: "#56a45b",
    hint: "Boutons ↓ en bas du header projet",
  },
  {
    emoji: "🤖",
    title: "L'Assistant IA",
    desc: "Bouton flottant en bas à droite de chaque projet. Pose-lui des questions : « Quels risques sur ce projet ? », « Qu'est-ce qui bloque le chemin critique ? »",
    cta: "Suivant →",
    color: "#8b5cf6",
    hint: "Bouton violet flottant en bas à droite",
  },
  {
    emoji: "⌨️",
    title: "Raccourcis clavier",
    desc: "Appuie sur « ? » dans le planning pour voir tous les raccourcis. G+L = Gantt, G+A = Analytics, G+S = Soutenance... Navigation ultra-rapide.",
    cta: "Suivant →",
    color: "#0ea5e9",
    hint: "Touche « ? » dans la vue Planning",
  },
  {
    emoji: "🏁",
    title: "Tu es prêt !",
    desc: "Explore les projets démo, puis crée le tien avec « Nouveau projet » : structure des LT, liens, ressources et B2P.",
    cta: "Lancer l'app 🚀",
    color: "#56a45b",
    hint: null,
    action: { label: "Créer un projet", href: "/projects/new" },
    last: true,
  },
];

export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [animating, setAnimating] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem(STORAGE_KEY)) {
      const t = setTimeout(() => setOpen(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  }

  function next() {
    if (animating) return;
    const current = STEPS[step];
    if (current.last) { dismiss(); return; }
    setAnimating(true);
    setTimeout(() => {
      setStep((s) => s + 1);
      setAnimating(false);
    }, 200);
  }

  function goTo(i: number) {
    if (animating) return;
    setAnimating(true);
    setTimeout(() => { setStep(i); setAnimating(false); }, 150);
  }

  if (!open) return null;

  const current = STEPS[step];
  const progress = ((step) / (STEPS.length - 1)) * 100;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl"
        style={{
          background: "linear-gradient(135deg, #1a4a20 0%, #0e2714 60%, #0d1f10 100%)",
          border: "1px solid rgba(86,164,91,0.25)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.60), inset 0 1px 0 rgba(86,164,91,0.18)",
        }}
      >
        {/* Progress bar */}
        <div className="h-[3px] w-full" style={{ background: "rgba(255,255,255,0.08)" }}>
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${progress}%`,
              background: `linear-gradient(90deg, #56a45b, ${current.color})`,
            }}
          />
        </div>

        {/* Speed lines bg */}
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage: "repeating-linear-gradient(-62deg, transparent, transparent 38px, rgba(255,255,255,0.015) 38px, rgba(255,255,255,0.015) 39px)",
          }}
        />

        <div className="relative p-7">
          {/* Step counter + skip */}
          <div className="mb-5 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.20em]" style={{ color: "rgba(255,255,255,0.35)" }}>
              {step + 1} / {STEPS.length}
            </span>
            <button
              onClick={dismiss}
              className="text-[11px] font-semibold transition-opacity hover:opacity-100"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              Passer ×
            </button>
          </div>

          {/* Content */}
          <div
            className="transition-all duration-200"
            style={{ opacity: animating ? 0 : 1, transform: animating ? "translateY(8px)" : "translateY(0)" }}
          >
            {/* Emoji */}
            <div
              className="mb-4 flex size-14 items-center justify-center rounded-2xl text-3xl"
              style={{
                background: `${current.color}22`,
                border: `1px solid ${current.color}44`,
              }}
            >
              {current.emoji}
            </div>

            {/* Title */}
            <h2 className="mb-2 text-xl font-black tracking-tight text-white">
              {current.title}
            </h2>

            {/* Description */}
            <p className="mb-4 text-sm leading-6" style={{ color: "rgba(255,255,255,0.65)" }}>
              {current.desc}
            </p>

            {/* Hint chip */}
            {current.hint && (
              <div
                className="mb-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1"
                style={{
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                <span className="text-[10px]">📍</span>
                <span className="text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.50)" }}>
                  {current.hint}
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={next}
                className="rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95"
                style={{
                  background: `linear-gradient(135deg, ${current.color}, ${current.color}cc)`,
                  boxShadow: `0 4px 16px ${current.color}44`,
                }}
              >
                {current.cta}
              </button>
              {current.action && (
                <button
                  onClick={() => { router.push(current.action!.href); dismiss(); }}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold transition-all hover:opacity-80"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "rgba(255,255,255,0.70)",
                  }}
                >
                  {current.action.label}
                </button>
              )}
            </div>
          </div>

          {/* Dot navigation */}
          <div className="mt-6 flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className="rounded-full transition-all"
                style={{
                  width: i === step ? "20px" : "6px",
                  height: "6px",
                  background: i === step ? current.color : "rgba(255,255,255,0.20)",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
