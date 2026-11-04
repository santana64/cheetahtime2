import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BrandMark } from "@/components/app/brand-mark";
import { LoginForm } from "@/features/auth/login-form";
import { getCurrentSession } from "@/services/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connexion — Cheetah Time",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getCurrentSession();
  const { next } = await searchParams;
  const nextPath = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/projects";

  if (session) {
    redirect(nextPath);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #1a4a20 0%, #0e2714 60%, #0d1f10 100%)" }}
    >
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex justify-center">
          <BrandMark href="/" />
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <h1 className="mb-1 text-xl font-black text-white">Accéder à Cheetah Time</h1>
          <p className="mb-5 text-sm text-white/50">
            Connectez-vous pour accéder à votre espace de planification.
          </p>
          <LoginForm nextPath={nextPath} />
        </div>

        <p className="text-center text-[11px] text-white/30">
          CheetahSoft · Cheetah Time
        </p>
      </div>
    </div>
  );
}
