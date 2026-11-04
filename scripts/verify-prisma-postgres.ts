import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { Client } from "pg";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function getNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function getBinPath(fileName: string) {
  return path.join(
    process.cwd(),
    "node_modules",
    "@embedded-postgres",
    "windows-x64",
    "native",
    "bin",
    fileName,
  );
}

function getFreePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to allocate a TCP port for PostgreSQL verification."));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

function runCommand(
  command: string,
  args: string[],
  label: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  return new Promise<void>((resolve, reject) => {
    const commandLower = command.toLowerCase();
    const executable =
      process.platform === "win32" && commandLower.endsWith(".cmd")
        ? process.env.ComSpec ?? "cmd.exe"
        : command;
    const finalArgs =
      process.platform === "win32" && commandLower.endsWith(".cmd")
        ? ["/d", "/s", "/c", command, ...args]
        : args;

    const child = spawn(executable, finalArgs, {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          [
            `${label} failed with exit code ${code ?? "unknown"}.`,
            stdout.trim() ? `stdout:\n${stdout.trim()}` : "",
            stderr.trim() ? `stderr:\n${stderr.trim()}` : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
        ),
      );
    });
  });
}

function startPostgres(
  postgresPath: string,
  dataDir: string,
  port: number,
  env: NodeJS.ProcessEnv,
) {
  return new Promise<ReturnType<typeof spawn>>((resolve, reject) => {
    const child = spawn(
      postgresPath,
      ["-D", dataDir, "-p", String(port)],
      {
        cwd: process.cwd(),
        env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      const message = chunk.toString();
      stderr += message;
      if (message.includes("database system is ready to accept connections")) {
        resolve(child);
      }
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      reject(
        new Error(
          [
            `postgres exited before becoming ready (code: ${code ?? "unknown"}).`,
            stderr.trim(),
          ]
            .filter(Boolean)
            .join("\n\n"),
        ),
      );
    });
  });
}

async function stopPostgres(
  pgCtlPath: string,
  dataDir: string,
  env: NodeJS.ProcessEnv,
) {
  await runCommand(
    pgCtlPath,
    ["-D", dataDir, "-m", "fast", "stop"],
    "pg_ctl stop",
    env,
  ).catch(async () => {
    await runCommand(
      process.platform === "win32" ? "taskkill" : "kill",
      process.platform === "win32" ? ["/f", "/t", "/im", "postgres.exe"] : [],
      "PostgreSQL process termination",
      env,
    ).catch(() => undefined);
  });
}

async function main() {
  assert(
    process.platform === "win32",
    "This PostgreSQL verification harness is currently implemented for Windows only.",
  );

  const initdbPath = getBinPath("initdb.exe");
  const postgresPath = getBinPath("postgres.exe");
  const pgCtlPath = getBinPath("pg_ctl.exe");
  await access(initdbPath);
  await access(postgresPath);
  await access(pgCtlPath);

  const port = await getFreePort();
  const verificationRoot = path.join(
    process.cwd(),
    ".interop",
    "postgres-runtime-proof",
    randomUUID().slice(0, 8),
  );
  const dataDir = path.join(verificationRoot, "data");
  const passwordFile = path.join(tmpdir(), `cheetah-time-pg-${randomUUID().slice(0, 8)}.txt`);
  const databaseName = "cheetahtimeverify";
  const user = "postgres";
  const password = "postgres";
  const databaseUrl = `postgresql://${user}:${password}@127.0.0.1:${port}/${databaseName}`;
  const env = {
    ...process.env,
    LC_MESSAGES: "C",
    DATABASE_URL: databaseUrl,
    CHEETAH_TIME_PERSISTENCE: "prisma",
  };

  let postgresProcess: ReturnType<typeof spawn> | null = null;

  try {
    await mkdir(dataDir, { recursive: true });
    await writeFile(passwordFile, `${password}\n`, "utf8");

    await runCommand(
      initdbPath,
      [
        `--pgdata=${dataDir}`,
        "--auth=password",
        `--username=${user}`,
        `--pwfile=${passwordFile}`,
        "--locale=C",
      ],
      "initdb",
      env,
    );

    postgresProcess = await startPostgres(postgresPath, dataDir, port, env);

    const adminClient = new Client({
      host: "127.0.0.1",
      port,
      user,
      password,
      database: "postgres",
    });

    try {
      await adminClient.connect();
      await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    } finally {
      await adminClient.end();
    }

    await runCommand(getNpmCommand(), ["run", "prisma:migrate:deploy"], "Prisma migrate deploy", env);
    await runCommand(getNpmCommand(), ["run", "verify:backend"], "Backend verification", env);

    const client = new Client({
      host: "127.0.0.1",
      port,
      user,
      password,
      database: databaseName,
    });

    try {
      await client.connect();
      const workspaceState = await client.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM "WorkspaceState"',
      );
      const projects = await client.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM "Project"',
      );
      const baselines = await client.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM "Baseline"',
      );
      const tasks = await client.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM "Task"',
      );

      const workspaceCount = Number(workspaceState.rows[0]?.count ?? 0);
      const projectCount = Number(projects.rows[0]?.count ?? 0);
      const baselineCount = Number(baselines.rows[0]?.count ?? 0);
      const taskCount = Number(tasks.rows[0]?.count ?? 0);

      assert(workspaceCount >= 1, "Expected a persisted workspace state in Prisma verification.");
      assert(projectCount >= 1, "Expected persisted projects in Prisma verification.");
      assert(baselineCount >= 1, "Expected persisted baselines in Prisma verification.");
      assert(taskCount >= 1, "Expected persisted tasks in Prisma verification.");

      console.log(
        JSON.stringify(
          {
            ok: true,
            persistence: "PostgreSQL via Prisma",
            databaseUrl,
            checks: {
              workspaceStateCount: workspaceCount,
              projectCount,
              baselineCount,
              taskCount,
            },
          },
          null,
          2,
        ),
      );
    } finally {
      await client.end();
    }
  } finally {
    if (postgresProcess) {
      await stopPostgres(pgCtlPath, dataDir, env).catch(() => undefined);
    }
    await rm(passwordFile, { force: true }).catch(() => undefined);
    await rm(verificationRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
