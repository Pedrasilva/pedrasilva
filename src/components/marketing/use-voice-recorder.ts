import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import i18n from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { encodeWav } from "@/lib/projects/wav-encoder";

/**
 * Shared voice recorder (PCM → 16 kHz WAV), used by the timesheet assistant and marketing.
 * - AudioContext is created synchronously inside the click (Safari/Chrome autoplay rules), then resumed.
 * - `recording` turns true only once real audio frames arrive; `level` (0..1) drives a live meter.
 * - Silent recordings are never returned. Failures are toasted and logged (no audio) to voice_input_failures.
 * start() never throws: it resolves true when recording started, false otherwise.
 */
export type VoiceErrorCode =
  | "NotAllowedError" | "NotFoundError" | "NotReadableError" | "SecurityError"
  | "Timeout" | "ContextNotRunning" | "NoFrames" | "Silent" | "Unknown";

const GUM_TIMEOUT_MS = 10_000;
const FIRST_FRAME_TIMEOUT_MS = 3_000;
/** Below these the recording is treated as silence. */
const SILENT_PEAK = 0.01;
const SILENT_RMS = 0.0015;

class VoiceError extends Error { constructor(public code: VoiceErrorCode, public rawName?: string) { super(code); } }

function mapError(e: unknown): VoiceError {
  if (e instanceof VoiceError) return e;
  const name = (e as { name?: string })?.name ?? "";
  const inFrame = typeof window !== "undefined" && window.top !== window.self;
  if (name === "NotAllowedError" || name === "PermissionDeniedError")
    return new VoiceError(inFrame ? "SecurityError" : "NotAllowedError", name);
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return new VoiceError("NotFoundError", name);
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return new VoiceError("NotReadableError", name);
  if (name === "SecurityError" || name === "TypeError") return new VoiceError("SecurityError", name);
  return new VoiceError("Unknown", name || String(e));
}

function detectPlatform() {
  const ua = navigator.userAgent;
  const os = /Windows/i.test(ua) ? "Windows" : /Mac OS X|Macintosh/i.test(ua) ? "macOS" : /iPhone|iPad/i.test(ua) ? "iOS" : /Android/i.test(ua) ? "Android" : /Linux/i.test(ua) ? "Linux" : "Other";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Other";
  return { os, browser, ua: ua.slice(0, 400) };
}

async function logFailure(code: VoiceErrorCode, rawName: string | undefined, feature: string, seconds: number | null, silent: boolean, ctxState: string | null) {
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const p = detectPlatform();
    await supabase.from("voice_input_failures").insert({
      feature, browser: p.browser, os: p.os, user_agent: p.ua,
      error_name: rawName && rawName !== code ? `${code} (${rawName})` : code,
      recording_seconds: seconds, silent, context_state: ctxState,
    });
  } catch { /* logging must never break the UI */ }
}

function report(err: VoiceError, feature: string, seconds: number | null, ctxState: string | null) {
  toast.error(i18n.t(`common:voice.errors.${err.code}`), { duration: err.code === "NotAllowedError" ? 12000 : 6000 });
  void logFailure(err.code, err.rawName, feature, seconds, err.code === "Silent", ctxState);
}

export function useVoiceRecorder(feature = "voice") {
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [level, setLevel] = useState(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const srcRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const startedAtRef = useRef(0);

  function teardown() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try { procRef.current?.disconnect(); } catch { /* noop */ }
    try { srcRef.current?.disconnect(); } catch { /* noop */ }
    const ctx = ctxRef.current;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
    ctxRef.current = null; streamRef.current = null; srcRef.current = null; procRef.current = null;
    setRecording(false); setStarting(false); setLevel(0);
  }

  useEffect(() => () => teardown(), []); // release the mic on unmount

  /** Call directly from the click handler (no await before it). */
  function start(): Promise<boolean> {
    if (starting || recording) return Promise.resolve(false);
    // 1. Synchronously, inside the user gesture.
    let ctx: AudioContext;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctor();
    } catch (e) {
      report(mapError(e), feature, null, null);
      return Promise.resolve(false);
    }
    ctxRef.current = ctx;
    const resumed = ctx.resume().catch(() => {});
    setStarting(true);
    chunksRef.current = [];

    return (async () => {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new VoiceError("SecurityError");
        let timer: number | undefined;
        const stream = await Promise.race([
          navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }),
          new Promise<never>((_, rej) => { timer = window.setTimeout(() => rej(new VoiceError("Timeout")), GUM_TIMEOUT_MS); }),
        ]).finally(() => window.clearTimeout(timer));
        streamRef.current = stream;
        if (ctxRef.current !== ctx) { stream.getTracks().forEach((t) => t.stop()); return false; }
        await resumed;
        if (ctx.state !== "running") await ctx.resume().catch(() => {});
        if (ctx.state !== "running") throw new VoiceError("ContextNotRunning");

        const source = ctx.createMediaStreamSource(stream);
        srcRef.current = source;
        const proc = ctx.createScriptProcessor(4096, 1, 1);
        procRef.current = proc;
        const firstFrame = new Promise<void>((resolve, reject) => {
          const t = window.setTimeout(() => reject(new VoiceError("NoFrames")), FIRST_FRAME_TIMEOUT_MS);
          let got = false;
          proc.onaudioprocess = (e) => {
            const data = e.inputBuffer.getChannelData(0);
            chunksRef.current.push(new Float32Array(data));
            let sum = 0;
            for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
            const rms = Math.sqrt(sum / data.length);
            setLevel(Math.min(1, rms * 8));
            if (!got) { got = true; window.clearTimeout(t); resolve(); }
          };
        });
        source.connect(proc);
        proc.connect(ctx.destination);
        await firstFrame;
        startedAtRef.current = Date.now();
        setStarting(false);
        setRecording(true);
        return true;
      } catch (e) {
        const state = ctx.state;
        teardown();
        report(mapError(e), feature, null, state);
        return false;
      }
    })();
  }

  /** Stops and returns the WAV, or null if nothing (or only silence) was recorded. */
  async function stop(): Promise<Blob | null> {
    const ctx = ctxRef.current;
    if (!ctx || !procRef.current) { teardown(); return null; }
    const chunks = chunksRef.current;
    const rate = ctx.sampleRate;
    const seconds = Math.round(((Date.now() - startedAtRef.current) / 1000) * 10) / 10;
    teardown();
    chunksRef.current = [];
    let peak = 0, sum = 0, n = 0;
    for (const c of chunks) for (let i = 0; i < c.length; i++) { const v = Math.abs(c[i]); if (v > peak) peak = v; sum += v * v; n++; }
    const rms = n ? Math.sqrt(sum / n) : 0;
    if (n === 0 || (peak < SILENT_PEAK && rms < SILENT_RMS)) {
      report(new VoiceError("Silent"), feature, seconds, "closed");
      return null;
    }
    const wav = encodeWav(chunks, rate);
    return wav.size < 2048 ? null : wav;
  }

  return { recording, starting, level, start, stop };
}

/** UI language for transcription: "en" when the app is in English, otherwise "pt". */
export function transcriptionLanguage(): "pt" | "en" {
  return (i18n.language ?? "").toLowerCase().startsWith("en") ? "en" : "pt";
}
