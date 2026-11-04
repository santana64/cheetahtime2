"use server";

import { redirect } from "next/navigation";

import { type FormState } from "@/features/projects/form-state";
import { getErrorMessage } from "@/lib/planning/errors";
import {
  clearSessionCookie,
  destroyCurrentSession,
  setSessionCookie,
  signInWithPassword,
} from "@/services/auth";

function required(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Champ requis manquant : ${key}`);
  }
  return value.trim();
}

export async function loginAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  let nextPath = "/projects";

  try {
    const rawNext = formData.get("next");
    if (typeof rawNext === "string" && rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\")) {
      nextPath = rawNext;
    }

    const { token } = await signInWithPassword(
      required(formData, "email"),
      required(formData, "password"),
      typeof formData.get("mfaCode") === "string"
        ? (formData.get("mfaCode") as string)
        : null,
    );

    await setSessionCookie(token);
  } catch (error) {
    return {
      status: "error",
      message: getErrorMessage(error, "Connexion impossible."),
    };
  }

  redirect(nextPath);
}

export async function logoutAction() {
  await destroyCurrentSession();
  await clearSessionCookie();
  redirect("/login");
}
