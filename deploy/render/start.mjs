// Render (free plan): the API and the web app run in one service, so they sleep and wake together instead of
// the web app answering 502 while a separately sleeping API starts. The web app (Render's public port) proxies
// /api to the API on 127.0.0.1. If either process stops, the other is stopped too and Render restarts the service.
import { spawn } from "node:child_process";

const API_PORT = process.env.API_PORT || "4000";
const procs = [
  ["api", "/app/api", { PORT: API_PORT }],
  ["web", "/app/web", { PORT: process.env.PORT || "3000", HOSTNAME: "0.0.0.0" }],
].map(([name, cwd, env]) => {
  const p = spawn(process.execPath, ["server.js"], { cwd, stdio: "inherit", env: { ...process.env, ...env } });
  p.on("exit", (code, signal) => {
    console.error(`[start] ${name} stopped (${signal ?? code}); stopping the service.`);
    stopAll();
    process.exit(code || 1);
  });
  return p;
});

function stopAll() {
  for (const p of procs) if (p.exitCode === null && !p.killed) p.kill("SIGTERM");
}
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { stopAll(); setTimeout(() => process.exit(0), 5000).unref(); });
