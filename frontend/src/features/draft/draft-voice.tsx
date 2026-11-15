import { useEffect, useRef, useState } from 'react';
import { Check, Mic, MicOff, Search, X } from 'lucide-react';

type VoiceResult = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};
type Recognition = {
  lang: string;
  maxAlternatives: number;
  onresult: ((event: VoiceResult) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
};
type RecognitionConstructor = new () => Recognition;
type SpeechWindow = Window & {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
};
type Action = 'ban' | 'pick';

function recognitionConstructor() {
  const browser = window as SpeechWindow;
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}

const recognitionErrors: Record<string, string> = {
  network: 'Falha na conexão com o serviço de voz do navegador.',
  'audio-capture': 'O navegador não captou áudio. Confira o microfone e a entrada de som.',
  'not-allowed': 'Permita o microfone nas configurações deste site.',
  'service-not-allowed': 'O navegador bloqueou o serviço de reconhecimento de voz.',
  'language-not-supported': 'O reconhecimento em português do Brasil está indisponível no navegador.',
  'language-unavailable': 'O reconhecimento em português do Brasil está indisponível no navegador.',
  'no-speech': 'Nenhuma fala detectada. Tente novamente.',
  unsupported: 'Este navegador não oferece reconhecimento de voz.',
  'start-failed': 'O navegador não conseguiu iniciar o reconhecimento de voz.',
};

function cancelRecognition(recognition: Recognition) {
  recognition.onend = recognition.onerror = recognition.onresult = null;
  recognition.abort();
}

function words(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/\p{M}/gu,'').replace(/[^a-z0-9]+/g,' ').trim();
}

function nameKey(value: string) {
  const key = words(value).replace(/ /g,'');
  if (/^(8|oito)bits?$/.test(key)) return '8bit';
  if (key === 'erte' || key === 'errete') return 'rt';
  return key;
}

function voiceOptions(transcripts: string[], action: Action, roster: readonly { name: string }[]) {
  const options = new Set<string>();
  let opposite = false;
  for (const transcript of transcripts) {
    const utterance = words(transcript);
    const command = /^(ban|banir|bani|bana|banimento|pick|pickar|picar|escolher|escolha|selecionar|selecione) (?:[oa] )?(.+)$/.exec(utterance);
    if (command && (command[1].startsWith('ban') ? 'ban' : 'pick') !== action) {
      opposite = true;
      continue;
    }
    const key = nameKey(command?.[2] ?? utterance);
    for (const brawler of roster) {
      if (nameKey(brawler.name) === key) options.add(brawler.name);
    }
  }
  return { options: [...options], opposite };
}

export function DraftVoice({ action, team, position, firstPickSelected, roster, onStart, isBlocked, onAssign }: {
  action: Action;
  team: 'Azul' | 'Vermelho';
  position: number;
  firstPickSelected: boolean;
  roster: readonly { name: string }[];
  onStart: () => void;
  isBlocked: (name: string) => boolean;
  onAssign: (name: string) => void;
}) {
  const active = useRef<Recognition | null>(null);
  const [listening, setListening] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const [typed, setTyped] = useState('');

  useEffect(() => () => {
    if (active.current) cancelRecognition(active.current);
    active.current = null;
  }, []);

  function close() {
    if (active.current) cancelRecognition(active.current);
    active.current = null;
    setListening(false);
    setMessage('');
    setOptions([]);
    setFailure('');
    setTyped('');
  }

  function preview(transcripts: string[]) {
    const { options, opposite } = voiceOptions(transcripts, action, roster);
    setOptions(options);
    setMessage(options.length ? '' : opposite
      ? `O próximo turno é de ${action}.`
      : 'Brawler não reconhecido. Tente só o nome.');
  }

  function listen() {
    if (active.current) {
      close();
      return;
    }
    if (!firstPickSelected) {
      setMessage('Escolha Azul ou Vermelho em Primeira escolha.');
      return;
    }
    close();
    onStart();
    const Recognition = recognitionConstructor();
    if (!Recognition) {
      setFailure('unsupported');
      return;
    }
    try {
      const recognition = new Recognition();
      recognition.lang = 'pt-BR';
      recognition.maxAlternatives = 3;
      let received = false;
      recognition.onresult = event => {
        if (active.current !== recognition) return;
        received = true;
        preview(Array.from(event.results[0] ?? [], row => row.transcript));
      };
      recognition.onerror = ({ error }) => {
        if (active.current !== recognition) return;
        active.current = null;
        if (error !== 'aborted') {
          setOptions([]);
          setMessage('');
          setFailure(error);
        }
        setListening(false);
      };
      recognition.onend = () => {
        if (active.current !== recognition) return;
        active.current = null;
        setListening(false);
        if (!received) setFailure('no-speech');
      };
      active.current = recognition;
      setListening(true);
      recognition.start();
    } catch (error) {
      active.current = null;
      setListening(false);
      const denied = error instanceof DOMException && ['SecurityError', 'NotAllowedError'].includes(error.name);
      setFailure(denied ? 'not-allowed' : 'start-failed');
    }
  }

  const label = action === 'ban' ? 'Ban' : 'Pick';
  const turn = `${label} ${position} · ${team}`;
  return <div className="draft-voice">
    <button type="button" className="draft-voice-toggle" aria-pressed={listening}
      aria-label={listening ? 'Parar de ouvir' : `${label} por voz · ${turn}`}
      title={`${turn} · diga o nome do brawler`}
      onClick={listen}>{listening ? <MicOff size={15}/> : <Mic size={15}/>}</button>
    {(listening || options.length > 0 || message || failure) && <div className="draft-voice-popover">
      <div className="draft-voice-head">
        <span role="status">{options.length ? `Confirmar ${turn}` : message
          || (failure && (recognitionErrors[failure] ?? 'O navegador reportou uma falha de reconhecimento.'))
          || `${turn} · ouvindo…`}</span>
        <button type="button" aria-label="Fechar comando por voz" onClick={close}><X size={14}/></button>
      </div>
      {failure && <>
        <small className="draft-voice-error"><code>{failure}</code> · {turn}</small>
        <form className="draft-voice-fallback" onSubmit={event => {
          event.preventDefault();
          if (typed.trim()) preview([typed]);
        }}>
          <input autoFocus aria-label="Ditado ou nome do brawler" value={typed}
            placeholder="Nome do brawler"
            onChange={event => { setTyped(event.target.value); setMessage(''); setOptions([]); }}/>
          <button type="submit" aria-label="Buscar nome para este turno" disabled={!typed.trim()}><Search size={14}/></button>
        </form>
        <small>Digite ou use <kbd>Win</kbd> + <kbd>H</kbd> no Windows e pressione <kbd>Enter</kbd>.</small>
      </>}
      {options.map(name => <button type="button" key={name} disabled={isBlocked(name)}
        onClick={() => { if (!isBlocked(name)) { close(); onAssign(name); } }}>
        <Check size={14}/> {name}{isBlocked(name) ? ' · indisponível' : ''}
      </button>)}
    </div>}
  </div>;
}
