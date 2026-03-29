import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const procs = [
  spawn(npm, ["run", "dev:renderer"], { stdio: "inherit" }),
  spawn(npm, ["run", "dev:main"], { stdio: "inherit" }),
  spawn(npm, ["run", "dev:electron"], { stdio: "inherit" })
];

const stop = () => {
  for (const p of procs) {
    try { p.kill(); } catch {}
  }
};

for (const p of procs) {
  p.on("exit", (code) => { if (code && code !== 0) stop(); });
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
