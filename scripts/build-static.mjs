#!/usr/bin/env node

/**
 * Static export build script for GitHub Pages.
 *
 * Temporarily moves API routes out of the Next.js app directory
 * before building, then restores them. This allows `output: "export"`
 * to work without requiring a running server.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const API_DIR = join(ROOT, "src", "app", "api");
const API_TEMP = join(ROOT, ".api-backup");

console.log("Preparing static build...");

// Step 1: Copy API routes to backup, then delete original
if (existsSync(API_DIR)) {
  console.log("  Backing up API routes...");
  if (existsSync(API_TEMP)) {
    rmSync(API_TEMP, { recursive: true, force: true });
  }
  cpSync(API_DIR, API_TEMP, { recursive: true });
  rmSync(API_DIR, { recursive: true, force: true });
  console.log("  API routes backed up");
}

// Step 2: Run the Next.js build with output: "export"
let buildFailed = false;
try {
  console.log("  Running next build...");
  execSync("npx next build", { stdio: "inherit", cwd: ROOT });
  console.log("  Build complete");
} catch (err) {
  buildFailed = true;
  console.error("  Build failed:", err.message);
} finally {
  // Step 3: Restore API routes (always, even if build fails)
  if (existsSync(API_TEMP)) {
    console.log("  Restoring API routes...");
    cpSync(API_TEMP, API_DIR, { recursive: true });
    rmSync(API_TEMP, { recursive: true, force: true });
    console.log("  API routes restored");
  }
}

if (buildFailed) {
  process.exit(1);
}

console.log("Static export ready in ./out/");
console.log("Deploy ./out/ to GitHub Pages or any static host.");
