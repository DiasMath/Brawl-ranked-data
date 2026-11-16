import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('../public/voice/v1/', import.meta.url));
const runtime = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/';
const model = 'https://huggingface.co/onnx-community/whisper-base/resolve/27a07b4b52b3a4c5886134bb4320e93e1a4bbc7c/';
const files = [
  ['runtime', runtime, 'transformers.min.js', 'aa5002b70e789798da263f5f99c62bd3e8fcd0c119258a493c40c180648365fa'],
  ['runtime', runtime, 'ort-wasm-simd-threaded.jsep.mjs', '08fb86ec433c78bfb032c5d84a68b8e8e5a8d81268fa39e24314179a5767a5b9'],
  ['runtime', runtime, 'ort-wasm-simd-threaded.jsep.wasm', 'c46655e8a94afc45338d4cb2b840475f88e5012d524509916e505079c00bfa39'],
  ['models/whisper-base', model, 'config.json', 'f4d0608f7d918166da7edb3e188de5ef1bfe70d9802e785d271fd88111e9cf4b'],
  ['models/whisper-base', model, 'generation_config.json', '61070cf8de25b1e9256e8e102ded49d8d24a8369ed36ef84fdf21549e68125a0'],
  ['models/whisper-base', model, 'preprocessor_config.json', 'a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d'],
  ['models/whisper-base', model, 'tokenizer.json', '27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566'],
  ['models/whisper-base', model, 'tokenizer_config.json', '2e036e4dbacfdeb7242c7d4ec4149f4a16e86026048f94d1637e3a8ee9c6a573'],
  ['models/whisper-base', model, 'onnx/encoder_model_quantized.onnx', '5862993336bf33acd23736071aae2b32261d3b1b2f37780194460d4ef974dd46'],
  ['models/whisper-base', model, 'onnx/decoder_model_merged_quantized.onnx', 'fa3ef9902734ce5ae6f9ef2bdb2ba9a6c4b5785b09f4f420ce036573dc9d090b'],
  ['licenses', 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/', 'LICENSE', 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30', 'transformers.txt'],
  ['licenses', 'https://raw.githubusercontent.com/microsoft/onnxruntime/89f8206ba4/', 'LICENSE', '2f07c72751aed99790b8a4869cf2311df85a860b22ded05fa22803587a48922c', 'onnxruntime.txt'],
  ['licenses', 'https://raw.githubusercontent.com/openai/whisper/86098128c0b4f24f0e2aa2994de830614b474227/', 'LICENSE', 'b5d65a59060e68c4ff940e1eddfa6f94b2d68fdf58ed7f4dd57721c997e35e9d', 'whisper.txt'],
];

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

await Promise.all(files.map(async ([folder, base, file, expected, output = file]) => {
  const path = join(target, folder, output);
  const saved = await readFile(path).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  });
  if (saved && hash(saved) === expected) return;
  const response = await fetch(new URL(file, base), { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Voz: falha ao obter ${file} (HTTP ${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (hash(bytes) !== expected) throw new Error(`Voz: conteúdo inválido em ${file}.`);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
}));

await copyFile(new URL('./voice-worker.mjs', import.meta.url), join(target, 'worker.mjs'));
