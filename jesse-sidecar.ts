import type { PluginOption } from "vite";
import { spawn, type ChildProcess } from "child_process";
import path from "path";

const JESSE_VENV_PYTHON = path.resolve(
  __dirname,
  "../trading-stack/jesse/venv/Scripts/python.exe",
);
const JESSE_PROJECT_ROOT = path.resolve(__dirname, "../trading-stack/jesse-project");
const JESSE_LAUNCHER = path.resolve(JESSE_PROJECT_ROOT, "launch.py");
const JESSE_PORT = 9000;

let jesseProcess: ChildProcess | null = null;

function waitForHealth(maxAttempts = 30): Promise<boolean> {
  return new Promise((resolve) => {
    let attempts = 0;
    const check = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${JESSE_PORT}/`);
        if (res.ok) {
          resolve(true);
          return;
        }
      } catch {
        // not ready yet
      }
      attempts++;
      if (attempts >= maxAttempts) {
        resolve(false);
        return;
      }
      setTimeout(check, 1000);
    };
    check();
  });
}

export function jesseSidecar(): PluginOption {
  return {
    name: "jesse-sidecar",
    apply: "serve",
    configureServer(server) {
      // Don't start if already running
      fetch(`http://127.0.0.1:${JESSE_PORT}/`)
        .then(() => {
          console.log(`[jesse-sidecar] Jesse server already running on port ${JESSE_PORT}`);
        })
        .catch(() => {
          console.log(`[jesse-sidecar] Starting Jesse server...`);
          jesseProcess = spawn(
            JESSE_VENV_PYTHON,
            [JESSE_LAUNCHER, "run", "--skip-agent-rules"],
            {
              cwd: JESSE_PROJECT_ROOT,
              stdio: ["ignore", "pipe", "pipe"],
              env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONUTF8: "1" },
            },
          );

          jesseProcess.stdout?.on("data", (data: Buffer) => {
            const line = data.toString().trim();
            if (line) console.log(`[jesse] ${line}`);
          });

          jesseProcess.stderr?.on("data", (data: Buffer) => {
            const line = data.toString().trim();
            if (line) console.error(`[jesse:err] ${line}`);
          });

          jesseProcess.on("exit", (code) => {
            console.log(`[jesse-sidecar] Jesse server exited with code ${code}`);
            jesseProcess = null;
          });

          waitForHealth().then((ok) => {
            if (ok) {
              console.log(`[jesse-sidecar] Jesse server ready on port ${JESSE_PORT}`);
            } else {
              console.error(
                `[jesse-sidecar] Jesse server failed to start within 30s`,
              );
            }
          });
        });

      server.httpServer?.on("close", () => {
        if (jesseProcess) {
          console.log(`[jesse-sidecar] Shutting down Jesse server...`);
          jesseProcess.kill("SIGTERM");
          jesseProcess = null;
        }
      });
    },
  };
}