import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = new URL('../', import.meta.url);
const readJson = path => JSON.parse(readFileSync(new URL(path, frontend), 'utf8'));
const manifest = readJson('package.json');
const { packages } = readJson('package-lock.json');
const dependencies = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
const resolve = createRequire(import.meta.url).resolve;

function needsInstall(name) {
  const module = `node_modules/${name}`;
  try {
    if (readJson(`${module}/package.json`).version !== packages[module]?.version) return true;
    if (!name.startsWith('@types/')) resolve(name);
    return false;
  } catch (error) {
    if (['ENOENT', 'MODULE_NOT_FOUND'].includes(error.code) || error instanceof SyntaxError) return true;
    throw error;
  }
}

const missing = dependencies.filter(needsInstall);
if (missing.length) {
  console.log(`Atualizando dependências do frontend (${missing.join(', ')})…`);
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('Execute npm run dev para preparar o frontend.');
  const install = spawnSync(process.execPath, [npm, 'ci', '--include=dev'], {
    cwd: fileURLToPath(frontend),
    stdio: 'inherit',
  });
  if (install.error) throw install.error;
  if (install.status !== 0) process.exit(install.status ?? 1);
}
