import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { IconCheck, IconMic, IconX } from './icons';

interface VoiceResult {
  0?: { transcript: string };
}

interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<VoiceResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionConstructor = new () => Recognition;

/** Chrome/Edge expose the unprefixed name; Safari still uses the WebKit name. */
const recognitionConstructor = (): RecognitionConstructor | undefined => {
  const w = window as typeof window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

const errorText = (error: string): string => {
  if (error === 'not-allowed' || error === 'service-not-allowed') return 'Microphone access was not allowed';
  if (error === 'no-speech') return 'No speech heard — try again';
  if (error === 'audio-capture') return 'No microphone is available';
  if (error === 'network') return 'Voice recognition could not reach its service';
  return `Voice input failed: ${error}`;
};

interface TextareaRef {
  current: HTMLTextAreaElement | null;
}

export interface VoiceInputState {
  listening: boolean;
  error: string | null;
  status: string;
  startButton: preact.RefObject<HTMLButtonElement>;
  acceptButton: preact.RefObject<HTMLButtonElement>;
  start(): void;
  accept(): void;
  cancel(focus?: boolean): void;
  toggle(): void;
}

/** Browser speech recognition wired to a controlled textarea, shared by every voice entry. */
export function useVoiceInput(value: string, onValue: (value: string) => void, area: TextareaRef): VoiceInputState {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const startButton = useRef<HTMLButtonElement>(null);
  const acceptButton = useRef<HTMLButtonElement>(null);
  const recognition = useRef<Recognition | null>(null);
  const ending = useRef<'accept' | 'cancel' | null>(null);
  const before = useRef('');
  const valueNow = useRef(value);
  const onValueNow = useRef(onValue);
  valueNow.current = value;
  onValueNow.current = onValue;

  const finish = useCallback(
    (keep: boolean, focus = true) => {
      const active = recognition.current;
      if (!active || ending.current) return;
      ending.current = keep ? 'accept' : 'cancel';
      setListening(false);
      if (!keep) onValueNow.current(before.current);
      setStatus(keep ? 'Voice input accepted.' : 'Voice input cancelled.');
      try {
        keep ? active.stop() : active.abort();
      } catch {
        recognition.current = null;
        ending.current = null;
      }
      if (focus) queueMicrotask(() => (keep ? area.current : startButton.current)?.focus());
    },
    [area],
  );

  const start = useCallback(() => {
    if (recognition.current) return;
    const Recognition = recognitionConstructor();
    if (!Recognition) {
      setError('Voice input is not enabled in this browser');
      return;
    }

    const active = new Recognition();
    const original = valueNow.current;
    ending.current = null;
    before.current = original;
    active.continuous = true;
    active.interimResults = true;
    active.lang = navigator.language;
    active.onresult = (event) => {
      if (recognition.current !== active || ending.current === 'cancel') return;
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) transcript += event.results[i]?.[0]?.transcript ?? '';
      const space = original.trim() && transcript.trim() && !/\s$/.test(original) ? ' ' : '';
      onValueNow.current(`${original}${space}${transcript.trimStart()}`);
    };
    active.onerror = (event) => {
      if (recognition.current !== active) return;
      const exit = ending.current;
      recognition.current = null;
      ending.current = null;
      setListening(false);
      if (exit === 'cancel') return;
      setStatus('Voice input stopped.');
      setError(errorText(event.error));
      queueMicrotask(() => startButton.current?.focus());
    };
    active.onend = () => {
      if (recognition.current !== active) return;
      const exit = ending.current;
      recognition.current = null;
      ending.current = null;
      setListening(false);
      if (exit !== 'cancel') {
        setStatus('Voice input accepted.');
        queueMicrotask(() => area.current?.focus());
      }
    };

    try {
      active.start();
      recognition.current = active;
      setError(null);
      setListening(true);
      setStatus('Listening. Press Escape to cancel or Control Shift Space to accept.');
      queueMicrotask(() => acceptButton.current?.focus());
    } catch (err) {
      setError((err as Error).message || 'Voice input could not start');
    }
  }, []);

  const accept = useCallback(() => finish(true), [finish]);
  const cancel = useCallback((focus = true) => finish(false, focus), [finish]);
  const toggle = useCallback(() => (recognition.current ? finish(true) : start()), [finish, start]);

  useEffect(
    () => () => {
      const active = recognition.current;
      recognition.current = null;
      ending.current = null;
      active?.abort();
    },
    [],
  );

  return { listening, error, status, startButton, acceptButton, start, accept, cancel, toggle };
}

/** The approved MIC / flowing dots / cancel / accept UI around a voice-enabled textarea. */
export function VoiceInputControls({ voice, disabled = false }: { voice: VoiceInputState; disabled?: boolean }) {
  return (
    <>
      <span class="voice-trigger">
        <button
          ref={voice.startButton}
          type="button"
          class="voice-btn"
          disabled={disabled}
          aria-label="Start voice input"
          aria-keyshortcuts="Control+Shift+Space"
          onClick={voice.start}
        >
          <IconMic size={17} />
        </button>
        <span class="voice-tip" role="tooltip">
          Voice input <kbd>Ctrl Shift Space</kbd>
        </span>
      </span>
      <div class="voice-session" aria-hidden={!voice.listening}>
        <span class="voice-flow" aria-hidden="true" />
        <span class="voice-actions">
          <button type="button" class="voice-btn cancel" aria-label="Cancel voice input" title="Cancel — Esc" onClick={() => voice.cancel()}>
            <IconX size={17} />
          </button>
          <button
            ref={voice.acceptButton}
            type="button"
            class="voice-btn accept"
            aria-label="Accept voice input"
            aria-keyshortcuts="Control+Shift+Space"
            title="Accept — Ctrl+Shift+Space"
            onClick={voice.accept}
          >
            <IconCheck size={17} />
          </button>
        </span>
      </div>
      <span class="sr-only" role="status" aria-live="polite">
        {voice.status}
      </span>
    </>
  );
}
