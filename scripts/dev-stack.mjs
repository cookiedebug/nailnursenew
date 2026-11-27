import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const webDirectory = join(root, "web");
const python = process.env.PYTHON || "python";
const services = [
  {
    name: "Flask API",
    command: python,
    args: ["-m", "flask", "--app", "app", "run", "--no-reload", "--port", "5000"],
    cwd: join(root, "backend"),
    env: process.env,
  },
  {
    name: "Next.js",
    command: process.execPath,
    args: [join(webDirectory, "node_modules", "next", "dist", "bin", "next"), "dev"],
    cwd: webDirectory,
    env: { ...process.env, NEXT_DIST_DIR: ".next-dev" },
  },
];

const children = [];
let stopping = false;

function stopAll(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}

for (const service of services) {
  const child = spawn(service.command, service.args, {
    cwd: service.cwd,
    env: service.env,
    stdio: "inherit",
  });
  children.push(child);
  child.on("error", (error) => {
    console.error(`${service.name} could not start: ${error.message}`);
    stopAll(1);
  });
  child.on("exit", (code, signal) => {
    if (!stopping) {
      console.error(`${service.name} stopped unexpectedly (${signal ?? code}).`);
      stopAll(code ?? 1);
    }
  });
}

process.on("SIGINT", () => stopAll());
process.on("SIGTERM", () => stopAll());
