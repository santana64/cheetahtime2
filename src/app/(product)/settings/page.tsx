import type { Metadata } from "next";

import { SecuritySettingsPanel } from "@/features/settings/security-settings-panel";
import { WorkspaceSettingsForm } from "@/features/settings/workspace-settings-form";
import { getWorkspaceSettings } from "@/services/settings";
import { getUserSecurityState, isDesktopMode, requireCurrentSession } from "@/services/auth";

export const metadata: Metadata = {
  title: "Paramètres",
  description: "Paramètres de l'espace de travail, notifications et intégrations Cheetah Time.",
};

export default async function SettingsPage() {
  const session = await requireCurrentSession();
  const settings = await getWorkspaceSettings(session.workspaceId);
  // Desktop mode is single-user without accounts: there is no identity store to read.
  const security = isDesktopMode() ? null : await getUserSecurityState(session.userId);
  const currentMembership =
    security?.memberships.find((membership) => membership.workspaceId === session.workspaceId) ??
    security?.memberships[0];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/70 bg-white/80 p-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
          Administration
        </div>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-[#1a4a20]">
          Paramètres Cheetah Time
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Configuration de l'espace de travail, des canaux de notification, des intégrations et des valeurs par défaut utilisées par les projets.
        </p>
      </div>

      <WorkspaceSettingsForm settings={settings} />
      <SecuritySettingsPanel
        email={security?.email ?? session.email}
        mfaEnabled={security?.mfaEnabled ?? false}
        role={currentMembership?.role ?? session.role}
        permissions={currentMembership?.permissions ?? []}
      />

      {/* White-label / Marque blanche */}
      <div className="rounded-2xl border border-white/70 bg-white/80 p-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Marque blanche</div>
        <h2 className="mt-1 text-lg font-black text-[#1a4a20]">Personnalisation CheetahSoft</h2>
        <p className="mt-1 text-sm text-slate-500">
          Configurez le nom de votre organisation, les couleurs de marque et les mentions légales affichées aux utilisateurs de votre espace.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {[
            { label: "Nom de l'organisation", placeholder: settings.workspaceName ?? "Mon Entreprise", env: "CHEETAH_WHITE_LABEL_NAME" },
            { label: "URL du logo (SVG/PNG)", placeholder: "https://example.com/logo.svg", env: "CHEETAH_WHITE_LABEL_LOGO_URL" },
            { label: "Couleur principale (hex)", placeholder: "#1a4a20", env: "CHEETAH_WHITE_LABEL_COLOR" },
            { label: "Domaine personnalisé", placeholder: "planning.mon-entreprise.fr", env: "CHEETAH_WHITE_LABEL_DOMAIN" },
          ].map(({ label, placeholder, env }) => (
            <div key={label}>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
              <input
                type="text"
                placeholder={placeholder}
                readOnly
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400 cursor-not-allowed"
              />
              <p className="mt-0.5 text-[10px] text-slate-400">Variable d&apos;env : <code className="font-mono">{env}</code></p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
          <strong>Configuration via variables d&apos;environnement.</strong>{" "}
          Définissez ces variables dans votre fichier <code>.env</code> ou sur votre plateforme de déploiement (Vercel, Railway…).
          La personnalisation est appliquée au redémarrage du serveur.
        </div>
      </div>
    </div>
  );
}
