/*
 * Copyright (C) 2025 TomTom Navigation B.V.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Build Binary MCPB Package
 *
 * Creates a self-contained tomtom-mcp.mcpb with a bundled Node.js runtime.
 * This guarantees ABI compatibility for native modules (skia-canvas) regardless
 * of what Node.js version the host provides (e.g., Claude Desktop's Electron).
 *
 * Structure inside the .mcpb (tar.gz):
 *   manifest.json
 *   images/
 *   bin/
 *     tomtom-mcp          (Unix launcher)
 *     tomtom-mcp.cmd      (Windows launcher)
 *     runtime/node[.exe]  (Bundled Node.js binary)
 *     app/
 *       index.cjs.js      (Rollup CJS bundle)
 *       package.json      (minimal, type: commonjs)
 *       apps/             (MCP UI apps)
 *       node_modules/     (production dependencies)
 *
 * Usage:
 *   node scripts/build-mcpb.cjs
 *   npm run build:mcpb
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");
const { execSync } = require("child_process");

// ─── Configuration ────────────────────────────────────────────────────────────

const NODE_VERSION = "24.13.1"; // LTS Krypton — ABI 137
const PLATFORM = process.platform;
const ARCH = process.arch;

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DIST_DIR = path.join(PROJECT_ROOT, "dist");
const NODE_MODULES = path.join(PROJECT_ROOT, "node_modules");
const OUTPUT_MCPB = path.join(PROJECT_ROOT, "tomtom-mcp.mcpb");
const TEMP_DIR = path.join(os.tmpdir(), `tomtom-mcpb-${Date.now()}`);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (url) => {
      https
        .get(url, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            return follow(res.headers.location);
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          }
          const file = fs.createWriteStream(dest);
          res.pipe(file);
          file.on("finish", () => file.close(resolve));
        })
        .on("error", reject);
    };
    follow(url);
  });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isSymbolicLink()) {
      try {
        fs.symlinkSync(fs.readlinkSync(srcPath), destPath);
      } catch {
        fs.copyFileSync(srcPath, destPath);
      }
    } else if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      fs.chmodSync(destPath, fs.statSync(srcPath).mode);
    }
  }
}

function getNodeUrl() {
  const plat = PLATFORM === "win32" ? "win" : PLATFORM;
  const arch = ARCH === "arm64" ? "arm64" : "x64";
  const ext = PLATFORM === "win32" ? "zip" : "tar.gz";
  return `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${plat}-${arch}.${ext}`;
}

function extractNode(archive, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  if (PLATFORM === "win32") {
    execSync(
      `powershell -command "Expand-Archive -Path '${archive}' -DestinationPath '${destDir}'"`,
      { stdio: "pipe" }
    );
  } else {
    execSync(`tar -xzf "${archive}" -C "${destDir}"`, { stdio: "pipe" });
  }
  const extracted = fs.readdirSync(destDir).find((f) => f.startsWith("node-"));
  if (!extracted) throw new Error("Failed to find Node.js in extracted archive");

  const binPath =
    PLATFORM === "win32"
      ? path.join(destDir, extracted, "node.exe")
      : path.join(destDir, extracted, "bin", "node");
  const npmPath =
    PLATFORM === "win32"
      ? path.join(destDir, extracted, "node_modules", "npm", "bin", "npm-cli.js")
      : path.join(
          destDir,
          extracted,
          "lib",
          "node_modules",
          "npm",
          "bin",
          "npm-cli.js"
        );

  return { nodeBinary: binPath, npmCli: npmPath };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  console.log(
    `\nBuilding tomtom-mcp.mcpb (${PLATFORM}-${ARCH}, Node ${NODE_VERSION})...\n`
  );

  // Prerequisites
  if (!fs.existsSync(path.join(DIST_DIR, "index.cjs.js"))) {
    console.error('Error: dist/index.cjs.js not found. Run "npm run build" first.');
    process.exit(1);
  }

  try {
    // ── 1. Create temp structure ────────────────────────────────────────────
    const binDir = path.join(TEMP_DIR, "bin");
    const runtimeDir = path.join(binDir, "runtime");
    const appDir = path.join(binDir, "app");
    const dlDir = path.join(TEMP_DIR, "_dl");
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.mkdirSync(appDir, { recursive: true });
    fs.mkdirSync(dlDir, { recursive: true });

    // ── 2. Download & extract Node.js ───────────────────────────────────────
    const nodeUrl = getNodeUrl();
    const ext = PLATFORM === "win32" ? "zip" : "tar.gz";
    const archive = path.join(dlDir, `node.${ext}`);

    console.log(`  ↓ Downloading Node.js ${NODE_VERSION} (${PLATFORM}-${ARCH})...`);
    await download(nodeUrl, archive);

    const { nodeBinary, npmCli } = extractNode(archive, dlDir);
    const nodeDest = path.join(
      runtimeDir,
      PLATFORM === "win32" ? "node.exe" : "node"
    );
    fs.copyFileSync(nodeBinary, nodeDest);
    if (PLATFORM !== "win32") fs.chmodSync(nodeDest, 0o755);

    // Verify ABI
    const abi = execSync(`"${nodeDest}" -e "process.stdout.write(process.versions.modules)"`)
      .toString()
      .trim();
    console.log(`  ✓ Node.js ${NODE_VERSION} (ABI ${abi})`);

    // ── 3. Copy application files ───────────────────────────────────────────
    fs.copyFileSync(
      path.join(DIST_DIR, "index.cjs.js"),
      path.join(appDir, "index.cjs.js")
    );
    if (fs.existsSync(path.join(DIST_DIR, "index.cjs.js.map"))) {
      fs.copyFileSync(
        path.join(DIST_DIR, "index.cjs.js.map"),
        path.join(appDir, "index.cjs.js.map")
      );
    }

    // Minimal package.json for CJS resolution
    const pkg = JSON.parse(
      fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf8")
    );
    fs.writeFileSync(
      path.join(appDir, "package.json"),
      JSON.stringify(
        {
          name: pkg.name,
          version: pkg.version,
          main: "index.cjs.js",
          type: "commonjs",
        },
        null,
        2
      )
    );
    console.log("  ✓ Application bundle");

    // ── 4. Copy MCP Apps ────────────────────────────────────────────────────
    const appsDir = path.join(DIST_DIR, "apps");
    if (fs.existsSync(appsDir)) {
      copyDir(appsDir, path.join(appDir, "apps"));
      const count = execSync(`find "${path.join(appDir, "apps")}" -name "app.html" | wc -l`)
        .toString()
        .trim();
      console.log(`  ✓ MCP Apps (${count} apps)`);
    }

    // ── 5. Copy node_modules ────────────────────────────────────────────────
    console.log("  ⟳ Copying node_modules...");
    copyDir(NODE_MODULES, path.join(appDir, "node_modules"));
    console.log("  ✓ Dependencies");

    // ── 6. Rebuild skia-canvas for bundled Node ABI ─────────────────────────
    const skiaDir = path.join(appDir, "node_modules", "skia-canvas");
    if (fs.existsSync(skiaDir) && fs.existsSync(npmCli)) {
      console.log(`  ⟳ Rebuilding skia-canvas for ABI ${abi}...`);
      try {
        const rebuildEnv = {
          ...process.env,
          PATH: path.dirname(nodeDest) + path.delimiter + process.env.PATH,
        };
        execSync(
          `"${nodeDest}" "${npmCli}" rebuild skia-canvas --prefix "${appDir}"`,
          { stdio: "inherit", timeout: 300000, env: rebuildEnv }
        );
        console.log(`  ✓ skia-canvas rebuilt for ABI ${abi}`);
      } catch (err) {
        console.warn("  ⚠ skia-canvas rebuild failed:", err.message);
        console.warn("    Dynamic maps may not work. Other features are unaffected.");
      }
    }

    // ── 7. Create launchers ─────────────────────────────────────────────────
    // Unix launcher
    const unixLauncher = path.join(binDir, "tomtom-mcp");
    fs.writeFileSync(
      unixLauncher,
      [
        "#!/bin/bash",
        'SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"',
        'export NODE_PATH="$SCRIPT_DIR/app/node_modules"',
        'exec "$SCRIPT_DIR/runtime/node" "$SCRIPT_DIR/app/index.cjs.js" "$@"',
        "",
      ].join("\n")
    );
    fs.chmodSync(unixLauncher, 0o755);

    // Windows launcher
    fs.writeFileSync(
      path.join(binDir, "tomtom-mcp.cmd"),
      [
        "@echo off",
        "setlocal",
        'set "SCRIPT_DIR=%~dp0"',
        'set "NODE_PATH=%SCRIPT_DIR%app\\node_modules"',
        '"%SCRIPT_DIR%runtime\\node.exe" "%SCRIPT_DIR%app\\index.cjs.js" %*',
        "",
      ].join("\r\n")
    );
    console.log("  ✓ Launchers");

    // ── 8. Create manifest ──────────────────────────────────────────────────
    const manifest = JSON.parse(
      fs.readFileSync(path.join(PROJECT_ROOT, "manifest.json"), "utf8")
    );
    const launcherPath =
      PLATFORM === "win32" ? "bin/tomtom-mcp.cmd" : "bin/tomtom-mcp";

    manifest.server.type = "binary";
    manifest.server.entry_point = launcherPath;
    manifest.server.mcp_config.command = "${__dirname}/" + launcherPath;
    manifest.server.mcp_config.args = [];
    // Remove runtimes constraint since we bundle our own
    if (manifest.compatibility) {
      delete manifest.compatibility.runtimes;
    }

    fs.writeFileSync(
      path.join(TEMP_DIR, "manifest.json"),
      JSON.stringify(manifest, null, 2)
    );
    console.log("  ✓ Manifest (type: binary)");

    // ── 9. Copy images ──────────────────────────────────────────────────────
    const imagesDir = path.join(PROJECT_ROOT, "images");
    if (fs.existsSync(imagesDir)) {
      copyDir(imagesDir, path.join(TEMP_DIR, "images"));
    }

    // ── 10. Clean up download dir before archiving ──────────────────────────
    fs.rmSync(dlDir, { recursive: true });

    // ── 11. Create .mcpb archive (zip — required by Claude Desktop) ─────
    if (fs.existsSync(OUTPUT_MCPB)) fs.unlinkSync(OUTPUT_MCPB);

    console.log("  ⟳ Creating archive (zip)...");
    const archiver = require("archiver");
    const zipOut = fs.createWriteStream(OUTPUT_MCPB);
    const zip = archiver("zip", { zlib: { level: 6 } });

    await new Promise((resolve, reject) => {
      zipOut.on("close", resolve);
      zip.on("error", reject);
      zip.pipe(zipOut);
      zip.directory(TEMP_DIR, false);
      zip.finalize();
    });

    const size = fs.statSync(OUTPUT_MCPB).size;
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(
      `\n  ✓ tomtom-mcp.mcpb (${formatSize(size)}) — ${PLATFORM}-${ARCH}, Node ${NODE_VERSION}, ABI ${abi}`
    );
    console.log(`    Built in ${elapsed}s\n`);
  } finally {
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true });
    }
  }
}

main().catch((err) => {
  console.error("\nBuild failed:", err.message);
  process.exit(1);
});
