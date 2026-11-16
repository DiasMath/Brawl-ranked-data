import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Mic, Square, X } from 'lucide-react';
import { recordDraftSpeech } from './draft-speech';
import type { DraftSpeech } from './draft-speech';

type Action = 'ban' | 'pick';
type Status = 'loading' | 'permission' | 'recording' | 'processing';

const errors: Partial<Record<string, string>> = {
  'not-allowed': 'Permita o microfone nas configurações deste site.',
  'audio-capture': 'Não foi possível captar áudio. Confira a entrada de som.',
  'no-speech': 'Nenhuma fala detectada. Tente novamente.',
  'model-load-failed': 'O BRD não conseguiu carregar o modelo de voz. Tente novamente.',
  'transcription-failed': 'O BRD não conseguiu interpretar o áudio. Tente novamente.',
};

const statusMessages = {
  loading: 'Preparando o reconhecimento. O primeiro carregamento baixa cerca de 100 MB.',
  permission: 'Aguardando acesso ao microfone.',
  processing: 'Reconhecendo a fala…',
};

const aliases = new Map([
  ['hico', 'rico'], ['shaly', 'shelly'], ['shely', 'shelly'],
  ['xeli', 'shelly'], ['cheli', 'shelly'], ['collet', 'colette'],
  ['colete', 'colette'], ['paiper', 'piper'],
]);

function words(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function nameKey(value: string) {
  const key = words(value).replace(/ /g, '');
  if (/^(8|oito)bits?$/.test(key)) return '8bit';
  if (key === 'erte' || key === 'errete') return 'rt';
  return aliases.get(key) ?? key;
}

function recognizeBrawler(transcript: string, action: Action, roster: readonly { name: string }[]) {
  const utterance = words(transcript);
  const command = /^(ban|banir|bani|bana|banimento|pick|pickar|picar|escolher|escolha|escolhe|esco|selecionar|selecione) (?:(?:o|a|um|uma) )?(.+)$/.exec(utterance);
  if (command && (command[1].startsWith('ban') ? 'ban' : 'pick') !== action) {
    return { options: [], opposite: true };
  }
  const value = (command?.[2] ?? utterance).replace(/^brawler /, '');
  const keys = [nameKey(value)];
  // Whisper can split "escolher" across two words and attach its ending to the name.
  if (command?.[1] === 'esco') keys.push(nameKey(value.replace(/^her(?=[a-z])/, '')));
  const exact = roster.filter(brawler => keys.includes(nameKey(brawler.name)));
  if (exact.length) return { options: exact.map(brawler => brawler.name), opposite: false };

  // The verb can be misheard even when the last word is a recognizable brawler.
  const mentions = roster.filter(brawler => {
    const name = words(brawler.name);
    return name.length > 2 && ` ${value} `.includes(` ${name} `);
  });
  const candidate = mentions.length === 1 && value.endsWith(` ${words(mentions[0].name)}`) ? mentions[0] : null;
  return { options: candidate ? [candidate.name] : [], opposite: false };
}

export function DraftVoice({ action, team, position, firstPickSelected, roster, onStart, isBlocked, onAssign, getSpeech }: {
  action: Action;
  team: 'Azul' | 'Vermelho';
  position: number;
  firstPickSelected: boolean;
  roster: readonly { name: string }[];
  onStart: () => void;
  isBlocked: (name: string) => boolean;
  onAssign: (name: string) => void;
  getSpeech: () => DraftSpeech;
}) {
  const active = useRef<AbortController | null>(null);
  const stopRecording = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<Status>();
  const [options, setOptions] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => () => active.current?.abort(), []);

  function close() {
    active.current?.abort();
    active.current = null;
    stopRecording.current = null;
    setStatus(undefined);
    setMessage('');
    setOptions([]);
  }

  async function listen() {
    if (status === 'recording') {
      stopRecording.current?.();
      return;
    }
    if (active.current) {
      close();
      return;
    }
    if (!firstPickSelected) {
      setMessage('Escolha Azul ou Vermelho em Primeira escolha.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined' ||
        typeof AudioContext === 'undefined' || typeof OfflineAudioContext === 'undefined' || typeof Worker === 'undefined') {
      setMessage('Para usar o microfone, abra o BRD em HTTPS ou localhost em um navegador compatível.');
      return;
    }

    close();
    onStart();
    const controller = new AbortController();
    const { signal } = controller;
    active.current = controller;
    let stream: MediaStream | undefined;
    let context: AudioContext | undefined;
    const release = () => {
      stream?.getTracks().forEach(track => track.stop());
      stream = undefined;
      if (context && context.state !== 'closed') void context.close().catch(() => {});
    };
    signal.addEventListener('abort', release, { once: true });
    let phase: Status = 'loading';
    try {
      setStatus(phase);
      context = new AudioContext();
      const speech = getSpeech();
      await Promise.all([speech.request(), context.resume()]);
      if (signal.aborted) return;

      setStatus(phase = 'permission');
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, noiseSuppression: true, echoCancellation: true } });
      if (signal.aborted) return;
      setStatus(phase = 'recording');
      const audio = await recordDraftSpeech(stream, context, signal, stop => { stopRecording.current = stop; });
      if (signal.aborted) return;
      release();

      setStatus(phase = 'processing');
      const transcript = (await speech.request(audio)).trim();
      if (signal.aborted) return;
      const { options, opposite } = recognizeBrawler(transcript, action, roster);
      setOptions(options);
      if (!options.length) setMessage(opposite ? `O próximo turno é de ${action}.`
        : transcript ? `Ouvi “${transcript}”. Tente dizer o comando com o nome do brawler.` : errors['no-speech']!);
    } catch (error) {
      if (signal.aborted) return;
      const code = error instanceof Error ? error.message : '';
      const denied = error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name);
      const fallback = phase === 'loading' ? 'model-load-failed' : phase === 'processing' ? 'transcription-failed' : 'audio-capture';
      setMessage(errors[denied ? 'not-allowed' : code] ?? errors[fallback]!);
    } finally {
      signal.removeEventListener('abort', release);
      release();
      if (active.current === controller) {
        active.current = null;
        stopRecording.current = null;
        setStatus(undefined);
      }
    }
  }

  const label = action === 'ban' ? 'Ban' : 'Pick';
  const turn = `${label} ${position} · ${team}`;
  const hint = status === 'recording'
    ? (action === 'ban' ? 'Ouvindo… diga “banir Rico”, por exemplo.' : 'Ouvindo… diga “escolher Nita”, por exemplo.')
    : status ? statusMessages[status] : '';
  return <div className="draft-voice">
    <button type="button" className="draft-voice-toggle" aria-pressed={status === 'recording'}
      aria-label={status === 'recording' ? 'Concluir gravação' : status ? 'Cancelar reconhecimento' : `${label} por voz · ${turn}`}
      title={`${turn} · diga o comando e o nome do brawler`}
      onClick={() => void listen()}>{status === 'recording' ? <Square size={13}/> :
        status ? <Loader2 className="draft-voice-spinner" size={15}/> : <Mic size={15}/>}</button>
    {(status || options.length > 0 || message) && <div className="draft-voice-popover">
      <div className="draft-voice-head">
        <span role="status">{options.length ? `Confirmar ${turn}` : message || `${turn} · ${hint}`}</span>
        <button type="button" aria-label="Fechar comando por voz" onClick={close}><X size={14}/></button>
      </div>
      {options.map(name => <button type="button" key={name} disabled={isBlocked(name)}
        onClick={() => { if (!isBlocked(name)) { close(); onAssign(name); } }}>
        <Check size={14}/> {name}{isBlocked(name) ? ' · indisponível' : ''}
      </button>)}
    </div>}
  </div>;
}
