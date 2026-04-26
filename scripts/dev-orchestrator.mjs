import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const frontendDir = path.join(repoRoot, "frontend");
const skipPeerBoot = process.env.STUDY_HUB_SKIP_PEER_BOOT === "1";

const mode = process.argv[2];

if (!mode || !["frontend", "backend"].includes(mode)) {
  console.error("Use: node scripts/dev-orchestrator.mjs <frontend|backend>");
  process.exit(1);
}

function isPortOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(700);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

function spawnBackground(command, args, options) {
  const outFd = fs.openSync(options.stdoutPath, "a");
  const errFd = fs.openSync(options.stderrPath, "a");

  const child = spawn(command, args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env,
      STUDY_HUB_SKIP_PEER_BOOT: "1",
    },
    detached: true,
    stdio: ["ignore", outFd, errFd],
    windowsHide: true,
  });

  child.unref();
}

async function ensurePeerRunning(targetMode) {
  if (skipPeerBoot) {
    return;
  }

  if (targetMode === "frontend") {
    const backendUp = await isPortOpen(8000);
    if (!backendUp) {
      spawnBackground(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(repoRoot, "scripts", "dev-backend.ps1")],
        {
          cwd: repoRoot,
          stdoutPath: path.join(repoRoot, ".dev-backend.out.log"),
          stderrPath: path.join(repoRoot, ".dev-backend.err.log"),
        },
      );
    }
    return;
  }

  const frontendUp = await isPortOpen(5173);
  if (!frontendUp) {
    spawnBackground(
      "npm.cmd",
      ["run", "vite:dev", "--", "--host", "127.0.0.1", "--port", "5173", "--strictPort"],
      {
        cwd: frontendDir,
        stdoutPath: path.join(repoRoot, ".dev-frontend.out.log"),
        stderrPath: path.join(repoRoot, ".dev-frontend.err.log"),
      },
    );
  }
}

async function main() {
  await ensurePeerRunning(mode);

  const child =
    mode === "frontend"
      ? spawn("npm.cmd", ["run", "vite:dev", "--", "--host", "127.0.0.1", "--port", "5173", "--strictPort"], {
          cwd: frontendDir,
          env: {
            ...process.env,
            STUDY_HUB_SKIP_PEER_BOOT: "1",
          },
          stdio: "inherit",
          windowsHide: false,
        })
      : spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(repoRoot, "scripts", "dev-backend.ps1")], {
          cwd: repoRoot,
          env: {
            ...process.env,
            STUDY_HUB_SKIP_PEER_BOOT: "1",
          },
          stdio: "inherit",
          windowsHide: false,
        });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
