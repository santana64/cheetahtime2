import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getPrismaClient, getResolvedPersistenceMode } from "@/lib/prisma";

export const SESSION_COOKIE_NAME = "cheetah_time_session";
export const DEFAULT_WORKSPACE_ID = "workspace-cheetah-time";
export const DEFAULT_WORKSPACE_SLUG = "cheetah-time";
export const DEFAULT_USER_ID = "user-cheetah-time-admin";
export const DEFAULT_BOOTSTRAP_EMAIL = "admin@cheetahtime.local";
// Development-only fallback. Production refuses to start without explicit secrets.
const DEV_ONLY_BOOTSTRAP_PASSWORD = "dev-only-change-me";
const MIN_SECRET_LENGTH = 12;

export type WorkspaceRole = "OWNER" | "ADMIN" | "PLANNER" | "VIEWER";

export interface AuthSession {
  id: string;
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  email: string;
  name: string;
  workspaceName: string;
  expiresAt: string;
}

interface IdentityWorkspace {
  id: string;
  slug: string;
  name: string;
  defaultCurrencyCode: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

interface IdentitySettings {
  workspaceId: string;
  defaultCurrencyCode: string;
  timezone: string;
  fiscalYearStartMonth: number;
  emailNotifications: boolean;
  inAppNotifications: boolean;
  slackNotifications: boolean;
  slackWebhookUrl?: string | null;
  teamsWebhookUrl?: string | null;
  jiraBaseUrl?: string | null;
  attachmentPolicy: string;
  updatedAt: string;
}

interface IdentityUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  status: "ACTIVE" | "INVITED" | "DISABLED";
  defaultWorkspaceId: string;
  mfaEnabled: boolean;
  mfaSecretEncrypted?: string | null;
  failedLoginCount: number;
  lockedUntil?: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
}

interface IdentityMembership {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  permissions: string[];
  createdAt: string;
}

interface IdentitySession {
  id: string;
  userId: string;
  workspaceId: string;
  tokenHash: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt?: string | null;
}

interface IdentityStore {
  version: number;
  workspaces: IdentityWorkspace[];
  settings: IdentitySettings[];
  users: IdentityUser[];
  memberships: IdentityMembership[];
  sessions: IdentitySession[];
}

function nowIso() {
  return new Date().toISOString();
}

function getBootstrapEmail() {
  return process.env["CHEETAH_TIME_BOOTSTRAP_EMAIL"]?.trim().toLowerCase() || DEFAULT_BOOTSTRAP_EMAIL;
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function getBootstrapPassword() {
  const configured = process.env["CHEETAH_TIME_BOOTSTRAP_PASSWORD"]?.trim();
  if (configured && configured.length >= MIN_SECRET_LENGTH) {
    return configured;
  }
  if (isProduction()) {
    throw new Error(
      `CHEETAH_TIME_BOOTSTRAP_PASSWORD must be set (min ${MIN_SECRET_LENGTH} characters) in production.`,
    );
  }
  return configured || DEV_ONLY_BOOTSTRAP_PASSWORD;
}

function getAuthSecret() {
  const configured = process.env["CHEETAH_TIME_AUTH_SECRET"]?.trim();
  if (configured && configured.length >= 32) {
    return configured;
  }
  if (isProduction()) {
    throw new Error("CHEETAH_TIME_AUTH_SECRET must be set (min 32 characters) in production.");
  }
  return configured || "dev-only-auth-secret-not-for-production";
}

function getBootstrapName() {
  return process.env["CHEETAH_TIME_BOOTSTRAP_NAME"]?.trim() || "Administrateur Cheetah Time";
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const key = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:v1:${salt}:${key}`;
}

function verifyPassword(password: string, storedHash: string) {
  const [algorithm, version, salt, expectedHex] = storedHash.split(":");
  if (algorithm !== "scrypt" || version !== "v1" || !salt || !expectedHex) {
    return false;
  }

  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function encodeBase32(buffer: Buffer) {
  let bits = "";
  let output = "";
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, "0");
    while (bits.length >= 5) {
      output += base32Alphabet[Number.parseInt(bits.slice(0, 5), 2)];
      bits = bits.slice(5);
    }
  }
  if (bits.length) {
    output += base32Alphabet[Number.parseInt(bits.padEnd(5, "0"), 2)];
  }
  return output;
}

function decodeBase32(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  const bytes: number[] = [];
  for (const char of normalized) {
    const index = base32Alphabet.indexOf(char);
    if (index === -1) {
      continue;
    }
    bits += index.toString(2).padStart(5, "0");
    while (bits.length >= 8) {
      bytes.push(Number.parseInt(bits.slice(0, 8), 2));
      bits = bits.slice(8);
    }
  }
  return Buffer.from(bytes);
}

function getAuthEncryptionKey() {
  return createHash("sha256")
    .update(getAuthSecret())
    .digest();
}

function encryptMfaSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getAuthEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `aesgcm:v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

function decryptMfaSecret(encryptedSecret?: string | null) {
  if (!encryptedSecret) {
    return null;
  }
  const [algorithm, version, ivRaw, tagRaw, encryptedRaw] = encryptedSecret.split(":");
  if (algorithm !== "aesgcm" || version !== "v1" || !ivRaw || !tagRaw || !encryptedRaw) {
    return encryptedSecret;
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getAuthEncryptionKey(),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function generateTotp(secret: string, step = Math.floor(Date.now() / 30_000)) {
  const key = decodeBase32(secret);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    (((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff)) %
    1_000_000;
  return code.toString().padStart(6, "0");
}

function verifyTotp(secret: string, code?: string | null) {
  const normalized = code?.replace(/\s+/g, "") ?? "";
  if (!/^\d{6}$/.test(normalized)) {
    return false;
  }
  const currentStep = Math.floor(Date.now() / 30_000);
  return [-1, 0, 1].some((offset) => generateTotp(secret, currentStep + offset) === normalized);
}

export function generateMfaSecret() {
  return encodeBase32(randomBytes(20));
}

export function buildMfaOtpAuthUrl(email: string, secret: string) {
  const label = encodeURIComponent(`Cheetah Time:${email}`);
  const issuer = encodeURIComponent("Cheetah Time");
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

function getSessionExpiry() {
  const days = Number(process.env["CHEETAH_TIME_SESSION_DAYS"] ?? 7);
  const safeDays = Number.isFinite(days) && days > 0 ? Math.min(days, 30) : 7;
  return new Date(Date.now() + safeDays * 24 * 60 * 60 * 1000);
}

function getIdentityStorePath() {
  // VERCEL=1 is set at build time — Turbopack dead-code-eliminates
  // the path.join(process.cwd()) branches, preventing NFT from
  // tracing the whole project into the deployment bundle.
  if (process.env.VERCEL === "1" || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return "/tmp/cheetah-time.identity.json";
  }

  const configured = process.env["CHEETAH_TIME_IDENTITY_STORE_PATH"]?.trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.join(/*turbopackIgnore: true*/ process.cwd(), "data", path.basename(configured));
  }

  return path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "cheetah-time.identity.json");
}

function cloneStore(store: IdentityStore): IdentityStore {
  return structuredClone(store);
}

function createDefaultStore(): IdentityStore {
  const timestamp = nowIso();
  return {
    version: 1,
    workspaces: [
      {
        id: DEFAULT_WORKSPACE_ID,
        slug: DEFAULT_WORKSPACE_SLUG,
        name: "Cheetah Time",
        defaultCurrencyCode: "EUR",
        timezone: "Europe/Paris",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    settings: [
      {
        workspaceId: DEFAULT_WORKSPACE_ID,
        defaultCurrencyCode: "EUR",
        timezone: "Europe/Paris",
        fiscalYearStartMonth: 1,
        emailNotifications: false,
        inAppNotifications: true,
        slackNotifications: false,
        slackWebhookUrl: null,
        teamsWebhookUrl: null,
        jiraBaseUrl: null,
        attachmentPolicy: "link-or-reference",
        updatedAt: timestamp,
      },
    ],
    users: [
      {
        id: DEFAULT_USER_ID,
        email: getBootstrapEmail(),
        name: getBootstrapName(),
        passwordHash: hashPassword(getBootstrapPassword()),
        status: "ACTIVE",
        defaultWorkspaceId: DEFAULT_WORKSPACE_ID,
        mfaEnabled: false,
        mfaSecretEncrypted: null,
        failedLoginCount: 0,
        lockedUntil: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastLoginAt: null,
      },
    ],
    memberships: [
      {
        workspaceId: DEFAULT_WORKSPACE_ID,
        userId: DEFAULT_USER_ID,
        role: "OWNER",
        permissions: ["*"],
        createdAt: timestamp,
      },
    ],
    sessions: [],
  };
}

function normalizeStore(raw?: Partial<IdentityStore> | null): IdentityStore {
  const fallback = createDefaultStore();
  const timestamp = nowIso();
  const workspaces = raw?.workspaces?.length ? raw.workspaces : fallback.workspaces;
  const users = raw?.users?.length ? raw.users : fallback.users;
  const memberships = raw?.memberships?.length ? raw.memberships : fallback.memberships;
  const settings = raw?.settings?.length ? raw.settings : fallback.settings;
  return {
    version: 1,
    workspaces,
    users: users.map((entry) => ({
      ...entry,
      mfaEnabled: entry.mfaEnabled ?? false,
      mfaSecretEncrypted: entry.mfaSecretEncrypted ?? null,
      failedLoginCount: entry.failedLoginCount ?? 0,
      lockedUntil: entry.lockedUntil ?? null,
    })),
    memberships: memberships.map((entry) => ({
      ...entry,
      permissions: entry.permissions ?? (entry.role === "OWNER" ? ["*"] : []),
    })),
    settings: settings.map((entry) => ({
      ...fallback.settings[0],
      ...entry,
      workspaceId: entry.workspaceId ?? DEFAULT_WORKSPACE_ID,
      updatedAt: entry.updatedAt ?? timestamp,
    })),
    sessions: (raw?.sessions ?? []).filter((session) => !session.revokedAt && new Date(session.expiresAt).getTime() > Date.now()),
  };
}

async function readIdentityStore() {
  const storePath = getIdentityStorePath();
  await mkdir(/*turbopackIgnore: true*/ path.dirname(storePath), { recursive: true });

  let raw: string;
  try {
    raw = await readFile(/*turbopackIgnore: true*/ storePath, "utf8");
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
    if (code !== "ENOENT") throw error;
    // Premier lancement uniquement : aucun fichier d'identité → comptes par défaut.
    const store = createDefaultStore();
    await writeIdentityStore(store);
    return store;
  }

  try {
    return normalizeStore(JSON.parse(raw) as IdentityStore);
  } catch {
    // Fichier illisible : ne JAMAIS l'écraser par le store par défaut (cela
    // effaçait comptes et sessions). On tente la copie de secours, et on met
    // le fichier abîmé de côté pour diagnostic.
    try {
      const backup = await readFile(/*turbopackIgnore: true*/ `${storePath}.bak`, "utf8");
      const recovered = normalizeStore(JSON.parse(backup) as IdentityStore);
      await rename(/*turbopackIgnore: true*/ storePath, `${storePath}.corrupt-${Date.now()}`).catch(() => {});
      await writeIdentityStore(recovered);
      return recovered;
    } catch {
      throw new Error(
        "Le fichier des comptes (cheetah-time.identity.json) est illisible et aucune copie de secours n'est valide. Il n'a pas été modifié : restaurez-le avant de vous reconnecter.",
      );
    }
  }
}

async function writeIdentityStore(store: IdentityStore) {
  const storePath = getIdentityStorePath();
  await mkdir(/*turbopackIgnore: true*/ path.dirname(storePath), { recursive: true });
  const normalized = normalizeStore(store);
  // Copie de secours de la dernière version saine avant remplacement.
  await copyFile(/*turbopackIgnore: true*/ storePath, `${storePath}.bak`).catch(() => {});
  const tempPath = `${storePath}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(/*turbopackIgnore: true*/ tempPath, JSON.stringify(normalized, null, 2), "utf8");
  try {
    await rename(/*turbopackIgnore: true*/ tempPath, storePath);
  } catch {
    await writeFile(/*turbopackIgnore: true*/ storePath, JSON.stringify(normalized, null, 2), "utf8");
    await rm(/*turbopackIgnore: true*/ tempPath, { force: true });
  }
}

async function mutateIdentityStore(mutate: (draft: IdentityStore) => void | Promise<void>) {
  const draft = cloneStore(await readIdentityStore());
  await mutate(draft);
  await writeIdentityStore(draft);
  return draft;
}

async function ensurePrismaIdentitySeeded() {
  const db = getPrismaClient();
  const timestamp = new Date();

  await db.workspace.upsert({
    where: { id: DEFAULT_WORKSPACE_ID },
    create: {
      id: DEFAULT_WORKSPACE_ID,
      slug: DEFAULT_WORKSPACE_SLUG,
      name: "Cheetah Time",
      defaultCurrencyCode: "EUR",
      timezone: "Europe/Paris",
    },
    update: {},
  });

  await db.workspaceSettings.upsert({
    where: { workspaceId: DEFAULT_WORKSPACE_ID },
    create: {
      id: "workspace-cheetah-time-settings",
      workspaceId: DEFAULT_WORKSPACE_ID,
      defaultCurrencyCode: "EUR",
      timezone: "Europe/Paris",
      fiscalYearStartMonth: 1,
      emailNotifications: false,
      inAppNotifications: true,
      slackNotifications: false,
      attachmentPolicy: "link-or-reference",
    },
    update: {},
  });

  const existingUser = await db.user.findUnique({ where: { email: getBootstrapEmail() } });
  const user =
    existingUser ??
    (await db.user.create({
      data: {
        id: DEFAULT_USER_ID,
        email: getBootstrapEmail(),
        name: getBootstrapName(),
        passwordHash: hashPassword(getBootstrapPassword()),
        status: "ACTIVE",
        defaultWorkspaceId: DEFAULT_WORKSPACE_ID,
        mfaEnabled: false,
        failedLoginCount: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    }));

  await db.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: DEFAULT_WORKSPACE_ID,
        userId: user.id,
      },
    },
    create: {
      workspaceId: DEFAULT_WORKSPACE_ID,
      userId: user.id,
      role: "OWNER",
      permissions: ["*"],
    },
    update: {
      role: "OWNER",
      permissions: ["*"],
    },
  });
}

export async function ensureIdentitySeeded() {
  if (getResolvedPersistenceMode() === "prisma") {
    await ensurePrismaIdentitySeeded();
    return;
  }

  await readIdentityStore();
}

function getLockoutUntil(failedLoginCount: number) {
  return failedLoginCount >= 4 ? new Date(Date.now() + 15 * 60 * 1000) : null;
}

export async function signInWithPassword(
  email: string,
  password: string,
  mfaCode?: string | null,
): Promise<{ token: string; session: AuthSession }> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) {
    throw new Error("Adresse e-mail et mot de passe requis.");
  }

  await ensureIdentitySeeded();
  const expiresAt = getSessionExpiry();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);

  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        memberships: {
          include: { workspace: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (
      user?.lockedUntil &&
      user.lockedUntil.getTime() > Date.now()
    ) {
      throw new Error("Compte temporairement verrouille apres trop d'echecs de connexion.");
    }

    if (!user || user.status !== "ACTIVE" || !verifyPassword(password, user.passwordHash)) {
      if (user) {
        const failedLoginCount = user.failedLoginCount + 1;
        await db.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount,
            lockedUntil: getLockoutUntil(failedLoginCount),
          },
        });
      }
      throw new Error("Identifiants invalides.");
    }

    if (user.mfaEnabled) {
      const secret = decryptMfaSecret(user.mfaSecretEncrypted);
      if (!secret || !verifyTotp(secret, mfaCode)) {
        const failedLoginCount = user.failedLoginCount + 1;
        await db.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount,
            lockedUntil: getLockoutUntil(failedLoginCount),
          },
        });
        throw new Error("Code MFA invalide.");
      }
    }

    const membership = user.memberships.find((entry) => entry.workspaceId === user.defaultWorkspaceId) ?? user.memberships[0];
    if (!membership) {
      throw new Error("Aucun espace de travail n'est associe a cet utilisateur.");
    }

    const sessionRow = await db.session.create({
      data: {
        userId: user.id,
        workspaceId: membership.workspaceId,
        tokenHash,
        expiresAt,
      },
    });

    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    });

    return {
      token,
      session: {
        id: sessionRow.id,
        userId: user.id,
        workspaceId: membership.workspaceId,
        role: membership.role,
        email: user.email,
        name: user.name,
        workspaceName: membership.workspace.name,
        expiresAt: expiresAt.toISOString(),
      },
    };
  }

  let createdSession: AuthSession | null = null;
  await mutateIdentityStore((draft) => {
    const user = draft.users.find((entry) => entry.email === normalizedEmail);
    if (user?.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      throw new Error("Compte temporairement verrouille apres trop d'echecs de connexion.");
    }
    if (!user || user.status !== "ACTIVE" || !verifyPassword(password, user.passwordHash)) {
      if (user) {
        user.failedLoginCount += 1;
        const lockedUntil = getLockoutUntil(user.failedLoginCount);
        user.lockedUntil = lockedUntil?.toISOString() ?? null;
      }
      throw new Error("Identifiants invalides.");
    }

    if (user.mfaEnabled) {
      const secret = decryptMfaSecret(user.mfaSecretEncrypted);
      if (!secret || !verifyTotp(secret, mfaCode)) {
        user.failedLoginCount += 1;
        const lockedUntil = getLockoutUntil(user.failedLoginCount);
        user.lockedUntil = lockedUntil?.toISOString() ?? null;
        throw new Error("Code MFA invalide.");
      }
    }

    const membership =
      draft.memberships.find((entry) => entry.workspaceId === user.defaultWorkspaceId && entry.userId === user.id) ??
      draft.memberships.find((entry) => entry.userId === user.id);
    if (!membership) {
      throw new Error("Aucun espace de travail n'est associe a cet utilisateur.");
    }

    const workspace = draft.workspaces.find((entry) => entry.id === membership.workspaceId);
    if (!workspace) {
      throw new Error("Espace de travail introuvable.");
    }

    const session: IdentitySession = {
      id: randomBytes(12).toString("hex"),
      userId: user.id,
      workspaceId: membership.workspaceId,
      tokenHash,
      createdAt: nowIso(),
      lastSeenAt: nowIso(),
      expiresAt: expiresAt.toISOString(),
      revokedAt: null,
    };
    draft.sessions.push(session);
    user.lastLoginAt = nowIso();
    user.failedLoginCount = 0;
    user.lockedUntil = null;
    user.updatedAt = nowIso();
    createdSession = {
      id: session.id,
      userId: user.id,
      workspaceId: membership.workspaceId,
      role: membership.role,
      email: user.email,
      name: user.name,
      workspaceName: workspace.name,
      expiresAt: session.expiresAt,
    };
  });

  if (!createdSession) {
    throw new Error("Session non creee.");
  }

  return { token, session: createdSession };
}

export async function getSessionByToken(token?: string | null): Promise<AuthSession | null> {
  if (!token) {
    return null;
  }

  const tokenHash = hashToken(token);
  await ensureIdentitySeeded();

  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    const session = await db.session.findUnique({
      where: { tokenHash },
      include: {
        user: true,
        workspace: true,
      },
    });

    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now() || session.user.status !== "ACTIVE") {
      return null;
    }

    const membership = await db.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: session.workspaceId,
          userId: session.userId,
        },
      },
    });

    if (!membership) {
      return null;
    }

    await db.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });

    return {
      id: session.id,
      userId: session.userId,
      workspaceId: session.workspaceId,
      role: membership.role,
      email: session.user.email,
      name: session.user.name,
      workspaceName: session.workspace.name,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  const store = await readIdentityStore();
  const session = store.sessions.find((entry) => entry.tokenHash === tokenHash);
  if (!session || session.revokedAt || new Date(session.expiresAt).getTime() <= Date.now()) {
    return null;
  }

  const user = store.users.find((entry) => entry.id === session.userId && entry.status === "ACTIVE");
  const workspace = store.workspaces.find((entry) => entry.id === session.workspaceId);
  const membership = store.memberships.find((entry) => entry.workspaceId === session.workspaceId && entry.userId === session.userId);
  if (!user || !workspace || !membership) {
    return null;
  }

  await mutateIdentityStore((draft) => {
    const row = draft.sessions.find((entry) => entry.id === session.id);
    if (row) {
      row.lastSeenAt = nowIso();
    }
  });

  return {
    id: session.id,
    userId: user.id,
    workspaceId: workspace.id,
    role: membership.role,
    email: user.email,
    name: user.name,
    workspaceName: workspace.name,
    expiresAt: session.expiresAt,
  };
}

export async function destroySession(token?: string | null) {
  if (!token) {
    return;
  }

  const tokenHash = hashToken(token);

  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    await db.session.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return;
  }

  await mutateIdentityStore((draft) => {
    for (const session of draft.sessions) {
      if (session.tokenHash === tokenHash) {
        session.revokedAt = nowIso();
      }
    }
  });
}

export async function destroyCurrentSession() {
  const cookieStore = await cookies();
  await destroySession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

export async function getUserSecurityState(userId: string) {
  await ensureIdentitySeeded();

  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        mfaEnabled: true,
        failedLoginCount: true,
        lockedUntil: true,
        memberships: {
          select: {
            workspaceId: true,
            role: true,
            permissions: true,
          },
        },
      },
    });
    if (!user) {
      throw new Error("Utilisateur introuvable.");
    }
    return {
      email: user.email,
      mfaEnabled: user.mfaEnabled,
      failedLoginCount: user.failedLoginCount,
      lockedUntil: user.lockedUntil?.toISOString() ?? null,
      memberships: user.memberships,
    };
  }

  const store = await readIdentityStore();
  const user = store.users.find((entry) => entry.id === userId);
  if (!user) {
    throw new Error("Utilisateur introuvable.");
  }
  return {
    email: user.email,
    mfaEnabled: user.mfaEnabled,
    failedLoginCount: user.failedLoginCount,
    lockedUntil: user.lockedUntil ?? null,
    memberships: store.memberships
      .filter((entry) => entry.userId === userId)
      .map((entry) => ({
        workspaceId: entry.workspaceId,
        role: entry.role,
        permissions: entry.permissions,
      })),
  };
}

export async function enableUserMfa(input: {
  userId: string;
  secret: string;
  code: string;
}) {
  const secret = input.secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
  if (decodeBase32(secret).length < 10) {
    throw new Error("Secret MFA invalide.");
  }
  if (!verifyTotp(secret, input.code)) {
    throw new Error("Le code MFA ne correspond pas au secret fourni.");
  }
  const encryptedSecret = encryptMfaSecret(secret);

  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    await db.user.update({
      where: { id: input.userId },
      data: {
        mfaEnabled: true,
        mfaSecretEncrypted: encryptedSecret,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    return;
  }

  await mutateIdentityStore((draft) => {
    const user = draft.users.find((entry) => entry.id === input.userId);
    if (!user) {
      throw new Error("Utilisateur introuvable.");
    }
    user.mfaEnabled = true;
    user.mfaSecretEncrypted = encryptedSecret;
    user.failedLoginCount = 0;
    user.lockedUntil = null;
    user.updatedAt = nowIso();
  });
}

export async function disableUserMfa(input: {
  userId: string;
  code?: string | null;
}) {
  if (getResolvedPersistenceMode() === "prisma") {
    const db = getPrismaClient();
    const user = await db.user.findUnique({ where: { id: input.userId } });
    if (!user) {
      throw new Error("Utilisateur introuvable.");
    }
    const secret = decryptMfaSecret(user.mfaSecretEncrypted);
    if (user.mfaEnabled && secret && !verifyTotp(secret, input.code)) {
      throw new Error("Code MFA requis pour desactiver le MFA.");
    }
    await db.user.update({
      where: { id: input.userId },
      data: { mfaEnabled: false, mfaSecretEncrypted: null },
    });
    return;
  }

  await mutateIdentityStore((draft) => {
    const user = draft.users.find((entry) => entry.id === input.userId);
    if (!user) {
      throw new Error("Utilisateur introuvable.");
    }
    const secret = decryptMfaSecret(user.mfaSecretEncrypted);
    if (user.mfaEnabled && secret && !verifyTotp(secret, input.code)) {
      throw new Error("Code MFA requis pour desactiver le MFA.");
    }
    user.mfaEnabled = false;
    user.mfaSecretEncrypted = null;
    user.updatedAt = nowIso();
  });
}

export function roleCan(role: WorkspaceRole, permission: string) {
  if (role === "OWNER") {
    return true;
  }
  const matrix: Record<WorkspaceRole, string[]> = {
    OWNER: ["*"],
    ADMIN: ["project:*", "settings:read", "settings:update", "reports:*"],
    PLANNER: ["project:read", "project:update", "reports:read"],
    VIEWER: ["project:read", "reports:read"],
  };
  const [scope] = permission.split(":");
  return matrix[role].some(
    (granted) => granted === "*" || granted === permission || granted === `${scope}:*`,
  );
}

export async function requirePermission(permission: string) {
  const session = await requireCurrentSession();
  if (!roleCan(session.role, permission)) {
    throw new Error("Droits insuffisants pour cette operation.");
  }
  return session;
}

// Desktop (Electron) mode is single-user: no login screen. The Electron main
// process generates a random token per launch, passes it to the embedded
// server via CHEETAH_DESKTOP_TOKEN and sets it as an HTTP-only cookie on its
// own window. Any other local client (browser tab, other process, DNS
// rebinding) lacks the cookie and is rejected.
export const DESKTOP_TOKEN_COOKIE_NAME = "cheetah_desktop_token";

const DESKTOP_SESSION: AuthSession = {
  id: "desktop-session",
  userId: DEFAULT_USER_ID,
  workspaceId: DEFAULT_WORKSPACE_ID,
  role: "OWNER",
  email: "local@cheetahtime.local",
  name: "Utilisateur local",
  workspaceName: "Cheetah Time",
  expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
};

export function isDesktopMode() {
  return Boolean(process.env["CHEETAH_DESKTOP_TOKEN"]);
}

function isValidDesktopToken(candidate?: string | null) {
  const expected = process.env["CHEETAH_DESKTOP_TOKEN"];
  if (!expected || !candidate) {
    return false;
  }
  const expectedHash = createHash("sha256").update(expected).digest();
  const candidateHash = createHash("sha256").update(candidate).digest();
  return timingSafeEqual(expectedHash, candidateHash);
}

export class AuthError extends Error {
  readonly status: 401 | 403;

  constructor(message: string, status: 401 | 403) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/** Resolves a session from raw cookie values (usable from proxy.ts, which has no next/headers). */
export async function resolveSessionFromCookies(
  readCookie: (name: string) => string | undefined,
): Promise<AuthSession | null> {
  if (isDesktopMode()) {
    return isValidDesktopToken(readCookie(DESKTOP_TOKEN_COOKIE_NAME)) ? DESKTOP_SESSION : null;
  }

  return getSessionByToken(readCookie(SESSION_COOKIE_NAME));
}

export async function getCurrentSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  return resolveSessionFromCookies((name) => cookieStore.get(name)?.value);
}

/** For pages and server actions: redirects to /login when there is no session. */
export async function requireCurrentSession(): Promise<AuthSession> {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

/** For route handlers: throws AuthError (401/403) instead of redirecting. */
export async function requireApiPermission(permission: string): Promise<AuthSession> {
  const session = await getCurrentSession();
  if (!session) {
    throw new AuthError("Authentification requise.", 401);
  }
  if (!roleCan(session.role, permission)) {
    throw new AuthError("Droits insuffisants pour cette operation.", 403);
  }
  return session;
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
