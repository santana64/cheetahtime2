import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Desktop (Electron) packaging: emit a self-contained .next/standalone server.
  // Gated behind CHEETAH_DESKTOP so the normal Vercel/production config is untouched.
  output: process.env.CHEETAH_DESKTOP === "1" ? "standalone" : undefined,
  // Exclude large non-runtime files from the NFT (Node File Tracing) deployment bundle.
  // Without this, Turbopack traces the entire project root into every function bundle,
  // making the deployment artifact huge and causing "Deploying outputs" to hang.
  outputFileTracingExcludes: {
    "*": [
      // Desktop build output — must never be traced back into the standalone
      // bundle (otherwise each rebuild bakes the previous installer into it).
      "./dist-desktop/**/*",
      "./electron/**/*",
      "./build/**/*",
      // Prospection scripts with large JSON/CSV data files
      "./scripts/**/*",
      // Local demo JSON store — only used in dev, never on Vercel (Prisma is used)
      "./data/**/*",
      // Prisma native query engine binaries — not needed with @prisma/adapter-pg
      "./node_modules/.prisma/client/libquery_engine*",
      "./node_modules/@prisma/engines/**/*",
      "./node_modules/prisma/libquery_engine*",
      // Heavy build-only binaries (NOT @swc/helpers — needed by Next.js runtime)
      "./node_modules/esbuild/bin/**/*",
      "./node_modules/esbuild/install.js",
    ],
  },
};

export default nextConfig;
