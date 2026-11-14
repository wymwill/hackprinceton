/**
 * `npm run dev`: the Bet Series app on http://localhost:3000.
 * Starts Next (the API, on PORT or 3000) and Vite (the screens, on 5173);
 * Next forwards every page to Vite, so open the Next address.
 * Pass --lan to let phones on the same network reach it.
 */
import { spawn } from "node:child_process";

const lan = process.argv.includes("--lan");
const port = process.env.PORT ?? "3000";
const host = lan ? "0.0.0.0" : "127.0.0.1";

const run = (name, cmd, args, opts = {}) => {
  const child = spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32", ...opts });
  child.on("exit", (code) => {
    console.log(`\n${name} stopped${code ? ` (exit ${code})` : ""}. Stopping the other one.`);
    stopAll(code ?? 0);
  });
  return child;
};

const children = [
  run("Vite", "npm", ["run", "dev"], { cwd: "frontend" }),
  run("Next", "npx", ["next", "dev", "-H", host, "-p", port]),
];

let stopping = false;
function stopAll(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (c.exitCode === null) c.kill("SIGTERM");
  setTimeout(() => process.exit(code), 300);
}
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

console.log(`\nAlea: open http://localhost:${port}\n`);
