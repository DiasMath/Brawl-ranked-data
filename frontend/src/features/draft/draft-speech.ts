type SpeechReply = { id: number; text?: string; error?: string };

export class DraftSpeech {
  private worker = new Worker('/voice/v1/worker.mjs', { type: 'module' });
  private id = 0;
  private pending = new Map<number, (reply: SpeechReply) => void>();
  private closed = false;

  constructor(private roster: string[]) {
    this.worker.onmessage = ({ data }: MessageEvent<SpeechReply>) => this.pending.get(data.id)?.(data);
    this.worker.onerror = () => this.dispose('model-load-failed');
    this.worker.onmessageerror = () => this.dispose('transcription-failed');
  }

  get disposed() {
    return this.closed;
  }

  request(audio?: Float32Array, batch = false) {
    return new Promise<string>((resolve, reject) => {
      if (this.closed) return reject(new Error('model-load-failed'));
      const id = ++this.id;
      const error = audio ? 'transcription-failed' : 'model-load-failed';
      const timeout = setTimeout(() => this.dispose(error), audio ? 30_000 : 180_000);
      this.pending.set(id, reply => {
        clearTimeout(timeout);
        this.pending.delete(id);
        if (reply.error) {
          if (!this.closed) this.dispose(reply.error);
          reject(new Error(reply.error));
        } else resolve(reply.text ?? '');
      });
      if (audio) this.worker.postMessage({ id, audio, batch }, [audio.buffer as ArrayBuffer]);
      else this.worker.postMessage({ id, roster: this.roster });
    });
  }

  dispose(error = 'cancelled') {
    this.closed = true;
    this.worker.terminate();
    for (const [id, finish] of this.pending) finish({ id, error });
  }
}

export async function recordDraftSpeech(
  stream: MediaStream,
  audio: AudioContext,
  signal: AbortSignal,
  onRecording: (stop: () => void) => void,
  batch = false,
) {
  const source = audio.createMediaStreamSource(stream);
  const analyser = audio.createAnalyser();
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  let lastSpeech = 0;

  try {
    const blob = await new Promise<Blob>((resolve, reject) => {
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const stop = () => {
        if (recorder.state !== 'inactive') recorder.stop();
      };
      const limit = setTimeout(stop, batch ? 12_000 : 6000);
      const silence = setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        const now = performance.now();
        if (rms >= 0.012) lastSpeech = now;
        else if (lastSpeech && now - lastSpeech > (batch ? 1050 : 650)) stop();
      }, 50);
      function cleanup() {
        clearTimeout(limit);
        clearInterval(silence);
        signal.removeEventListener('abort', abort);
      }
      function abort() {
        cleanup();
        stop();
        reject(new DOMException('', 'AbortError'));
      }
      recorder.ondataavailable = event => chunks.push(event.data);
      recorder.onstop = () => {
        cleanup();
        resolve(new Blob(chunks, { type: recorder.mimeType }));
      };
      recorder.onerror = () => {
        cleanup();
        reject(new Error('audio-capture'));
      };
      signal.addEventListener('abort', abort, { once: true });
      try {
        recorder.start();
        onRecording(stop);
      } catch (error) {
        cleanup();
        stop();
        reject(error);
      }
    });

    if (!blob.size) throw new Error('no-speech');
    const offline = new OfflineAudioContext(1, 1, 16000);
    const decoded = await offline.decodeAudioData(await blob.arrayBuffer());
    const mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const data = decoded.getChannelData(channel);
      for (let i = 0; i < mono.length; i++) mono[i] += data[i] / decoded.numberOfChannels;
    }
    if (!mono.some(sample => Math.abs(sample) > 0.012)) throw new Error('no-speech');
    return mono;
  } finally {
    source.disconnect();
  }
}
