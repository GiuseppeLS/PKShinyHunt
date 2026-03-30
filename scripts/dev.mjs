import { spawn } from "node:child_process";

const isWin = process.platform === "win32";

function run(scriptName) {
  if (isWin) {
    // Windows-safe: via cmd.exe
    return spawn("cmd.exe", ["/d", "/s", "/c", `npm run ${scriptName}`], {
      stdio: "inherit",
      env: process.env
    });
  }

  return spawn("npm", ["run", scriptName], {
    stdio: "inherit",
    env: process.env
  });
}

const children = [
  run("dev:renderer"),
  run("dev:main"),
  run("dev:electron")
];

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try { child.kill(); } catch {}
  }
  setTimeout(() => process.exit(code), 200);
}

for (const child of children) {
  child.on("exit", (code) => {
    if (code && code !== 0) shutdown(code);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));