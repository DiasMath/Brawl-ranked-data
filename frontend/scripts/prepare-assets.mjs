import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = join(root, 'assets');
const manifest = JSON.parse(await readFile(join(assets, 'manifest.json'), 'utf8'));
const pieces = await Promise.all(manifest.parts.map(file => readFile(join(assets, file), 'utf8')));
const compressed = Buffer.from(pieces.join(''), 'base64');
if (createHash('sha256').update(compressed).digest('hex') !== manifest.sha256) {
  throw new Error('Arquivos de recursos incompletos ou corrompidos.');
}
const files = JSON.parse(gunzipSync(compressed).toString('utf8'));
if (files.length !== manifest.files) throw new Error('Contagem de recursos incompatível.');
await Promise.all(files.map(async ([relative, data]) => {
  if (!relative.split('/').every(segment => /^[\w.-]+$/.test(segment) && !['.', '..'].includes(segment))) {
    throw new Error('Caminho de recurso inválido.');
  }
  const target = join(root, 'public', relative);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(data, 'base64'));
}));
