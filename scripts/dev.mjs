import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const requiredPackages = ['react', 'react-dom', 'vite', '@vitejs/plugin-react', 'electron', 'wait-on', 'cross-env', 'typescript', 'pngjs'];
const missing = requiredPackages.filter((pkg) => {
  try {
    require.resolve(pkg);
    return false;
  } catch {
    return true;
  }
});

if (missing.length > 0) {
  console.error('[dev-runner] Missing required dev dependencies:', missing.join(', '));
  console.error('[dev-runner] Run: npm install --include=dev');
  process.exit(1);
}

function run(name, script) {
  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/s', '/c', `npm run ${script}`], {
        stdio: 'inherit',
        env: process.env,
      })
    : spawn('npm', ['run', script], {
        stdio: 'inherit',
        env: process.env,
      });

  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`[dev-runner] ${name} exited with code ${code}`);
      shutdown(code);
    }
  });

  return child;
}

const hasMainTsConfig = fs.existsSync('tsconfig.main.json');
const children = [run('renderer', 'dev:renderer')];

if (hasMainTsConfig) {
  children.push(run('main', 'dev:main'));
  children.push(run('electron', 'dev:electron'));
} else {
  if (!fs.existsSync('electron/main.cjs')) {
    console.error('[dev-runner] Missing electron/main.cjs for legacy startup.');
    process.exit(1);
  }
  console.warn('[dev-runner] tsconfig.main.json not found. Using legacy electron startup.');
  children.push(run('electron', 'dev:electron:legacy'));
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      try { child.kill(); } catch {}
    }
  }
  setTimeout(() => process.exit(code), 200);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));