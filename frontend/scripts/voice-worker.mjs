import { env, LogitsProcessor, LogitsProcessorList, pipeline } from './runtime/transformers.min.js';

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL('./models/', import.meta.url).href;
env.backends.onnx.wasm.wasmPaths = new URL('./runtime/', import.meta.url).href;
env.backends.onnx.wasm.numThreads = 1;

let engine;
let queue = Promise.resolve();

function voiceVocabulary({ model, tokenizer }, roster, batch = false) {
  const config = model.generation_config;
  const context = batch
    ? ' Brawl Stars. Lista de brawlers para banir, separados por vírgulas. Brawlers: '
    : ' Brawl Stars. O jogador vai banir ou escolher um brawler. Brawlers: ';
  const encode = text => tokenizer.encode(text, { add_special_tokens: false });
  const names = encode(`${context}${roster.join(', ')}. Brawler:`);
  const prefix = [
    config.prev_sot_token_id, ...(names.length <= 360 ? names : encode(`${context}Brawler:`)),
    config.decoder_start_token_id, config.lang_to_id['<|pt|>'],
    config.task_to_id.transcribe, config.no_timestamps_token_id,
  ];

  const roots = new Map();
  for (const name of [...roster, 'oito bit', 'erre tê']) {
    for (const phrase of [name, `Banir ${name}`, `Banir o ${name}`, `Banir a ${name}`,
      `Escolher ${name}`, `Escolher o ${name}`, `Escolher a ${name}`, `Picar ${name}`]) {
      for (const form of new Set([phrase, phrase.toLowerCase()])) {
        let node = roots;
        for (const token of encode(` ${form}`)) {
          if (!node.has(token)) node.set(token, new Map());
          node = node.get(token);
        }
        if (!batch) node.set(config.eos_token_id, new Map());
      }
    }
  }

  const separators = new Set([",", ";"].flatMap(encode));
  class BrawlerBias extends LogitsProcessor {
    _call(sequences, scores) {
      for (const [index, sequence] of sequences.entries()) {
        let node = roots;
        const spoken = sequence.slice(prefix.length);
        const cursor = batch ? spoken.findLastIndex(token => separators.has(Number(token))) + 1 : 0;
        for (const token of spoken.slice(cursor)) node = node?.get(Number(token));
        // Restart the name bias after a separator without forcing a match.
        if (node) for (const token of node.keys()) scores[index].data[token] += batch ? 2.5 : 2;
      }
      return scores;
    }
  }
  const biases = new LogitsProcessorList();
  biases.push(new BrawlerBias());
  return { prefix, biases };
}

async function handle({ id, audio, roster, batch }) {
  try {
    if (!engine) {
      const recognizer = await pipeline('automatic-speech-recognition', 'whisper-base', { device: 'wasm', dtype: 'q8' });
      engine = { recognizer, single: voiceVocabulary(recognizer, roster), batch: voiceVocabulary(recognizer, roster, true) };
    }
    let text = '';
    if (audio) {
      const { recognizer } = engine;
      const { prefix, biases } = batch ? engine.batch : engine.single;
      const { input_features } = await recognizer.processor(audio);
      const tokens = await recognizer.model.generate({
        inputs: input_features, decoder_input_ids: prefix, logits_processor: biases, max_new_tokens: batch ? 42 : 16,
      });
      text = recognizer.tokenizer.decode(tokens[0].tolist().slice(prefix.length), { skip_special_tokens: true });
    }
    self.postMessage({ id, text });
  } catch (error) {
    console.error('Draft voice:', error);
    self.postMessage({ id, error: engine ? 'transcription-failed' : 'model-load-failed' });
  }
}

self.onmessage = ({ data }) => {
  queue = queue.then(() => handle(data));
};
