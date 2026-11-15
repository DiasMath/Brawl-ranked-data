import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Check, Mic, MicOff, X } from 'lucide-react';

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

function subscribe() {
  return () => {};
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

function voiceOptions(results: VoiceResult['results'], action: Action, roster: readonly { name: string }[]) {
  const options = new Set<string>();
  let opposite = false;
  for (const { transcript } of Array.from(results[0] ?? [])) {
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

export function DraftVoice({ action, roster, isBlocked, onAssign }: {
  action: Action;
  roster: readonly { name: string }[];
  isBlocked: (name: string) => boolean;
  onAssign: (name: string) => void;
}) {
  const supported = useSyncExternalStore(subscribe, () => Boolean(recognitionConstructor()), () => false);
  const active = useRef<Recognition | null>(null);
  const [listening, setListening] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => () => {
    const recognition = active.current;
    if (!recognition) return;
    recognition.onend = recognition.onerror = recognition.onresult = null;
    recognition.abort();
    active.current = null;
  }, []);

  function close() {
    active.current?.abort();
    setMessage('');
    setOptions([]);
  }

  function listen() {
    if (active.current) {
      close();
      return;
    }
    const Recognition = recognitionConstructor();
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = 'pt-BR';
    recognition.maxAlternatives = 3;
    let received = false;
    recognition.onresult = event => {
      received = true;
      const { options, opposite } = voiceOptions(event.results, action, roster);
      setOptions(options);
      if (!options.length) {
        setMessage(opposite ? `Selecione uma posição de ${action === 'ban' ? 'pick' : 'ban'}.` : 'Brawler não reconhecido. Tente dizer só o nome.');
      }
    };
    recognition.onerror = ({ error }) => {
      received = true;
      if (error === 'aborted') return;
      setMessage(error === 'not-allowed' || error === 'service-not-allowed'
        ? 'Permita o uso do microfone no navegador.'
        : error === 'no-speech' ? 'Nenhuma fala detectada. Tente de novo.'
        : 'Reconhecimento de voz indisponível. Use a busca.');
    };
    recognition.onend = () => {
      active.current = null;
      setListening(false);
      if (!received) setMessage('Nenhuma fala detectada. Tente de novo.');
    };
    setMessage('');
    setOptions([]);
    try {
      active.current = recognition;
      setListening(true);
      recognition.start();
    } catch {
      active.current = null;
      setListening(false);
      setMessage('Não foi possível abrir o microfone. Use a busca.');
    }
  }

  const label = action === 'ban' ? 'Ban' : 'Pick';
  return <div className="draft-voice">
    <button type="button" className="draft-voice-toggle" disabled={!supported} aria-pressed={listening}
      aria-label={listening ? 'Parar de ouvir' : `${label} por voz`}
      title={supported ? `${label} por voz · diga o nome do brawler` : 'Reconhecimento de voz indisponível neste navegador'}
      onClick={listen}>{listening ? <MicOff size={15}/> : <Mic size={15}/>}</button>
    {(listening || options.length > 0 || message) && <div className="draft-voice-popover">
      <div className="draft-voice-head">
        <span role="status">{options.length ? `Confirmar ${label.toLowerCase()}` : message || 'Ouvindo… diga o nome do brawler.'}</span>
        <button type="button" aria-label="Fechar comando por voz" onClick={close}><X size={14}/></button>
      </div>
      {options.map(name => <button type="button" key={name} disabled={isBlocked(name)}
        onClick={() => { if (!isBlocked(name)) { close(); onAssign(name); } }}>
        <Check size={14}/> {name}{isBlocked(name) ? ' · indisponível' : ''}
      </button>)}
    </div>}
  </div>;
}
