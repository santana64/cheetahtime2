import { randomUUID } from "node:crypto";
import { readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

function runBridge(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("python", ["scripts/project-file-bridge.py", ...args], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";

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
          stderr.trim() ||
            `Project file bridge failed with exit code ${code ?? "unknown"}.`,
        ),
      );
    });
  });
}

const nativeMppExportSupport = false;

export function isMppFileName(fileName: string) {
  return path.extname(fileName).toLowerCase() === ".mpp";
}

export function supportsNativeMppExport() {
  return nativeMppExportSupport;
}

export async function convertProjectFileToMspdiXml(
  fileName: string,
  content: Buffer,
) {
  if (!isMppFileName(fileName)) {
    return content.toString("utf8");
  }

  const workDir = path.join(tmpdir(), `cheetah-time-mpp-${randomUUID().slice(0, 8)}`);
  await mkdir(workDir, { recursive: true });
  const inputPath = path.join(workDir, fileName);
  const outputPath = path.join(
    workDir,
    `${path.basename(fileName, path.extname(fileName))}.xml`,
  );

  try {
    await writeFile(inputPath, content);
    await runBridge(["mpp-to-mspdi", inputPath, outputPath]);
    return await readFile(outputPath, "utf8");
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function convertMspdiXmlToMpp(
  fileNameStem: string,
  xml: string,
) {
  if (!supportsNativeMppExport()) {
    throw new Error(
      "Native MPP export is not available through the current open-source interop bridge. Use MSPDI XML for round-trip export.",
    );
  }

  const workDir = path.join(tmpdir(), `cheetah-time-mspdi-${randomUUID().slice(0, 8)}`);
  await mkdir(workDir, { recursive: true });
  const inputPath = path.join(workDir, `${fileNameStem}.xml`);
  const outputPath = path.join(workDir, `${fileNameStem}.mpp`);

  try {
    await writeFile(inputPath, xml, "utf8");
    await runBridge(["mspdi-to-mpp", inputPath, outputPath]);
    return await readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
