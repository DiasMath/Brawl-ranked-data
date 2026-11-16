import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Mic, Square, X } from 'lucide-react';
import { recordDraftSpeech } from './draft-speech';
import type { DraftSpeech } from './draft-speech';
import { recognizeBans, recognizeBrawler } from './draft-voice-names';

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

export function DraftVoice({ action, team, position, firstPickSelected, roster, onStart, isBlocked, onAssign, getSpeech, bans }: {
  action: Action;
  team: 'Azul' | 'Vermelho';
  position: number;
  firstPickSelected: boolean;
  roster: readonly { name: string }[];
  onStart: () => void;
  isBlocked: (name: string) => boolean;
  onAssign: (name: string) => void;
  getSpeech: () => DraftSpeech;
  bans?: {
    slots: { team: 'Azul' | 'Vermelho'; position: number }[];
    validate: (names: string[]) => boolean;
    apply: (names: string[]) => void;
  };
}) {
  const active = useRef<AbortController | null>(null);
  const stopRecording = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<Status>();
  const [options, setOptions] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [review, setReview] = useState<{ name: string; heard: string }[]>([]);
  const [transcription, setTranscription] = useState('');

  useEffect(() => () => active.current?.abort(), []);

  function close() {
    active.current?.abort();
    active.current = null;
    stopRecording.current = null;
    setStatus(undefined);
    setMessage('');
    setOptions([]);
    setReview([]);
    setTranscription('');
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
      const audio = await recordDraftSpeech(stream, context, signal, stop => { stopRecording.current = stop; }, Boolean(bans && bans.slots.length > 1));
      if (signal.aborted) return;
      release();

      setStatus(phase = 'processing');
      const transcript = (await speech.request(audio, Boolean(bans && bans.slots.length > 1))).trim();
      if (signal.aborted) return;
      const { options, opposite } = recognizeBrawler(transcript, action, roster);
      if (bans && !opposite && transcript) {
        const recognized = recognizeBans(transcript, roster);
        if (recognized.length > bans.slots.length) {
          setMessage(`Ouvi “${transcript}”. Diga até ${bans.slots.length} nomes, na ordem do draft.`);
          return;
        }
        if (recognized.length > 1 || recognized[0]?.heard) {
          setReview(bans.slots.map((_, i) => recognized[i] ?? { name: '', heard: '' }));
          setTranscription(transcript);
          return;
        }
        if (recognized[0]?.name) {
          setOptions([recognized[0].name]);
          return;
        }
      }
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
  const names = review.map(row => row.name);
  const ready = Boolean(bans && review.length && names.every(Boolean) && bans.validate(names));
  const hint = status === 'recording'
    ? (bans && bans.slots.length > 1 ? `Ouvindo… diga até ${bans.slots.length} nomes. Primeiro Azul, depois Vermelho.` : action === 'ban' ? 'Ouvindo… diga “banir Rico”.' : 'Ouvindo… diga “escolher Nita”.')
    : status ? statusMessages[status] : '';
  return <div className="draft-voice">
    <button type="button" className="draft-voice-toggle" aria-pressed={status === 'recording'}
      aria-label={status === 'recording' ? 'Concluir gravação' : status ? 'Cancelar reconhecimento' : `${label} por voz · ${turn}`}
      title={`${turn} · diga o comando e o nome do brawler`}
      onClick={() => void listen()}>{status === 'recording' ? <Square size={13}/> :
        status ? <Loader2 className="draft-voice-spinner" size={15}/> : <Mic size={15}/>}</button>
    {(status || options.length > 0 || review.length > 0 || message) && <div className="draft-voice-popover">
      <div className="draft-voice-head">
        <span role="status">{review.length ? 'Revisar bans' : options.length ? `Confirmar ${turn}` : message || `${turn} · ${hint}`}</span>
        <button type="button" aria-label="Fechar comando por voz" onClick={close}><X size={14}/></button>
      </div>
      {bans && review.length > 0 && <>
        <small className="draft-voice-transcript">{transcription}</small>
        <ol className="draft-voice-list">{review.map((row, i) => {
          const slot = bans.slots[i];
          return <li key={i}>
            <label><span>{slot.team} · Ban {slot.position}</span>
              <select aria-label={`${slot.team} · Ban ${slot.position}`} value={row.name}
                onChange={event => {
                  const name = event.target.value;
                  setReview(current => current.map((item, index) => index === i ? { ...item, name } : item));
                }}>
                <option value="">{row.heard ? `Ouvi: ${row.heard}` : 'Escolher brawler'}</option>
                {roster.map(brawler => <option key={brawler.name}>{brawler.name}</option>)}
              </select>
            </label>
          </li>;
        })}</ol>
        {!ready && <small>Revise nomes pendentes, repetidos no mesmo time ou já escolhidos.</small>}
        <button type="button" disabled={!ready} onClick={() => { if (ready) { bans.apply(names); close(); } }}>
          <Check size={14}/> Confirmar {review.length} {review.length === 1 ? 'ban' : 'bans'}
        </button>
      </>}
      {options.map(name => <button type="button" key={name} disabled={isBlocked(name)}
        onClick={() => { if (!isBlocked(name)) { close(); onAssign(name); } }}>
        <Check size={14}/> {name}{isBlocked(name) ? ' · indisponível' : ''}
      </button>)}
    </div>}
  </div>;
}
