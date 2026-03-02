/**
 * postinstall: run prisma generate only when NOT on Vercel.
 * On Vercel, the build command already runs "prisma generate && next build",
 * so we skip here to avoid running it twice and speed up "Installing dependencies".
 */
if (process.env.VERCEL === '1') {
  process.exit(0);
}

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const cwd = path.join(__dirname, '..');
const prismaCli = path.join(cwd, 'node_modules', 'prisma', 'build', 'index.js');
const binDir = path.join(cwd, 'node_modules', '.bin');
const pathSep = process.platform === 'win32' ? ';' : ':';
const env = { ...process.env, PATH: [binDir, process.env.PATH].join(pathSep) };

let result;
if (fs.existsSync(prismaCli)) {
  result = spawnSync(process.execPath, [prismaCli, 'generate'], {
    stdio: 'inherit',
    cwd,
    env,
  });
} else {
  result = spawnSync('npx', ['prisma', 'generate'], {
    stdio: 'inherit',
    cwd,
  });
}

const code = result.signal ? 1 : (result.status ?? 1);
process.exit(code);
