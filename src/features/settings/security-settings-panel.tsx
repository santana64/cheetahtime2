"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/features/projects/form-state";
import {
  disableMfaAction,
  enableMfaAction,
  generateMfaSecretAction,
} from "@/features/settings/actions";
import { cn } from "@/lib/utils";

export function SecuritySettingsPanel({
  email,
  mfaEnabled,
  role,
  permissions,
}: {
  email: string;
  mfaEnabled: boolean;
  role: string;
  permissions: string[];
}) {
  const [generated, setGenerated] = useState(initialFormState);
  const [enableState, enableAction, enablePending] = useActionState(enableMfaAction, initialFormState);
  const [disableState, disableAction, disablePending] = useActionState(disableMfaAction, initialFormState);

  async function generateSecret() {
    setGenerated(await generateMfaSecretAction());
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-[#1a4a20]">Securite et acces</CardTitle>
        <p className="text-xs text-slate-500">
          Authentification MFA TOTP, verrouillage apres echecs et base RBAC pour la beta fermee.
        </p>
      </CardHeader>
      <CardContent className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <div className="font-semibold text-slate-800">{email}</div>
            <div className="mt-1 text-xs text-slate-500">
              Role workspace: <strong>{role}</strong> - MFA: <strong>{mfaEnabled ? "active" : "inactive"}</strong>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {(permissions.length ? permissions : ["permissions par role"]).map((permission) => (
                <span key={permission} className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-500">
                  {permission}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
            Le secret MFA n'est affiche qu'au moment de generation. Ajoutez-le dans une application TOTP,
            puis validez avec un code a 6 chiffres avant activation.
          </div>

          <Button type="button" variant="outline" onClick={generateSecret}>
            Generer un secret MFA
          </Button>
          {generated.message ? (
            <pre
              className={cn(
                "whitespace-pre-wrap break-all rounded-xl p-3 text-xs",
                generated.status === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-800",
              )}
            >
              {generated.message}
            </pre>
          ) : null}
        </div>

        <div className="space-y-4">
          <form action={enableAction} className="space-y-3 rounded-xl border border-slate-200 bg-white/80 p-4">
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
              Secret MFA base32
              <Input name="mfaSecret" className="h-9 font-mono" placeholder="JBSWY3DPEHPK3PXP..." />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
              Code TOTP
              <Input name="mfaCode" inputMode="numeric" maxLength={6} className="h-9" />
            </label>
            <p className={enableState.status === "error" ? "text-xs text-rose-600" : "text-xs text-slate-500"}>
              {enableState.message || "Active le MFA apres verification du code courant."}
            </p>
            <Button type="submit" disabled={enablePending} size="sm">
              {enablePending ? "Activation..." : "Activer MFA"}
            </Button>
          </form>

          <form action={disableAction} className="space-y-3 rounded-xl border border-slate-200 bg-white/80 p-4">
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
              Code TOTP courant
              <Input name="mfaCode" inputMode="numeric" maxLength={6} className="h-9" />
            </label>
            <p className={disableState.status === "error" ? "text-xs text-rose-600" : "text-xs text-slate-500"}>
              {disableState.message || "Requis pour desactiver le MFA lorsqu'il est actif."}
            </p>
            <Button type="submit" disabled={disablePending} variant="outline" size="sm">
              {disablePending ? "Desactivation..." : "Desactiver MFA"}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
