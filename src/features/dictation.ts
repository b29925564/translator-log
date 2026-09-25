// Voice input through the browser's speech recognition (Chrome, Edge,
// Safari). Feature-detected: callers hide the mic when it is missing.

import { useCallback, useEffect, useRef, useState } from 'react';
import { getLang } from '../i18n';
import { haptic } from '../ui/motion';

interface RecResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface Rec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<RecResult> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecCtor = new () => Rec;

const ctor = (): RecCtor | undefined => {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

export const dictationSupported = () => !!ctor();

/** Streams what is heard into `onText(transcript, isFinal)` until silence or stop(). */
export function useDictation(onText: (text: string, final: boolean) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Rec | null>(null);
  const cb = useRef(onText);
  cb.current = onText;

  const stop = useCallback(() => rec.current?.stop(), []);

  const start = useCallback(() => {
    const C = ctor();
    if (!C) return;
    rec.current?.abort();
    const r = new C();
    r.lang = getLang() === 'en' ? 'en-US' : 'zh-TW';
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      let text = '';
      let final = false;
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        final = e.results[i].isFinal;
      }
      cb.current(text, final);
    };
    r.onerror = (e) => {
      setError(e.error);
      setListening(false);
    };
    r.onend = () => setListening(false);
    try {
      r.start();
      rec.current = r;
      setError(null);
      setListening(true);
      haptic(10);
    } catch {
      setListening(false);
    }
  }, []);

  useEffect(() => () => rec.current?.abort(), []);
  return { supported: dictationSupported(), listening, error, start, stop };
}
