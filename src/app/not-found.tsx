import Link from "next/link";
import { BrandMark } from "@/components/app/brand-mark";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div
      className="relative min-h-screen speed-bg overflow-hidden"
      style={{
        background:
          "radial-gradient(900px 480px at 8% 0%, rgba(86,164,91,0.13), transparent 55%), " +
          "radial-gradient(900px 480px at 92% 0%, rgba(244,163,33,0.10), transparent 55%), " +
          "linear-gradient(180deg, #f4f0e6 0%, #f5f2ea 100%)",
      }}
    >
      {/* Header sombre */}
      <header
        className="relative flex items-center overflow-hidden px-8 py-4"
        style={{
          background: "linear-gradient(135deg, #1a4a20 0%, #0e2714 50%, #0d1f10 100%)",
          borderBottom: "1px solid rgba(86,164,91,0.15)",
        }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(-62deg, transparent, transparent 40px, rgba(255,255,255,0.018) 40px, rgba(255,255,255,0.018) 41px)",
          }}
          aria-hidden="true"
        />
        <BrandMark href="/projects" />
      </header>

      {/* Contenu 404 */}
      <div className="mx-auto flex max-w-3xl flex-col items-start justify-center gap-6 px-8 py-24 animate-velocity-enter">
        {/* Numéro */}
        <div
          className="text-[120px] font-black leading-none animate-count-pop"
          style={{
            background: "linear-gradient(135deg, #56a45b, #f4a321)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            letterSpacing: "-0.04em",
          }}
        >
          404
        </div>

        {/* Sep */}
        <div className="flex items-center gap-2">
          <div className="h-[2px] w-8 rounded-full" style={{ background: "#56a45b" }} />
          <div className="h-[2px] w-4 rounded-full" style={{ background: "#f4a321" }} />
          <div className="h-[2px] w-2 rounded-full" style={{ background: "rgba(0,0,0,0.15)" }} />
        </div>

        <div className="space-y-3 animate-blur-reveal delay-100">
          <div className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: "#56a45b" }}>
            Introuvable
          </div>
          <h1 className="text-[36px] font-black tracking-tight text-slate-950" style={{ letterSpacing: "-0.025em" }}>
            Cet espace de planification n&apos;existe pas.
          </h1>
          <p className="max-w-xl text-[15px] leading-relaxed text-slate-500">
            Le projet a peut-être été supprimé, renommé ou l&apos;URL est incorrecte.
          </p>
        </div>

        <Button asChild className="animate-rosette-bloom delay-200" style={{
          background: "linear-gradient(135deg, #56a45b, #3f8f48)",
          boxShadow: "0 4px 20px rgba(86,164,91,0.38)",
          color: "white",
          border: "1px solid rgba(255,255,255,0.15)",
        }}>
          <Link href="/projects">Revenir au portefeuille</Link>
        </Button>

        {/* Brand footer */}
        <div className="mt-8 flex items-center gap-3 opacity-40">
          <div className="h-px w-10 rounded-full" style={{ background: "#56a45b" }} />
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            CheetahSoft · Planification
          </span>
          <div className="h-px w-10 rounded-full" style={{ background: "#f4a321" }} />
        </div>
      </div>
    </div>
  );
}
