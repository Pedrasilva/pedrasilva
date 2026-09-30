import { useRef, useState } from "react";
import { encodeWav } from "@/lib/projects/wav-encoder";

/** Same recording approach as the project-note composer (PCM → 16 kHz WAV). */
export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const srcRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    srcRef.current = source;
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    procRef.current = proc;
    chunksRef.current = [];
    proc.onaudioprocess = (e) => chunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    source.connect(proc);
    proc.connect(ctx.destination);
    setRecording(true);
  }

  /** Stops and returns the WAV, or null if nothing was recorded. */
  async function stop(): Promise<Blob | null> {
    const ctx = ctxRef.current, stream = streamRef.current, src = srcRef.current, proc = procRef.current;
    setRecording(false);
    if (!ctx || !stream || !src || !proc) return null;
    stream.getTracks().forEach((t) => t.stop());
    proc.disconnect();
    src.disconnect();
    const chunks = chunksRef.current;
    const rate = ctx.sampleRate;
    await ctx.close();
    ctxRef.current = null; streamRef.current = null; srcRef.current = null; procRef.current = null; chunksRef.current = [];
    const wav = encodeWav(chunks, rate);
    return wav.size < 2048 ? null : wav;
  }

  return { recording, start, stop };
}
