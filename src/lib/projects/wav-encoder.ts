// Encode Float32 PCM chunks from the Web Audio API into a WAV blob.
// 16-bit signed little-endian mono. Downsamples to 16 kHz on the fly.

export function encodeWav(chunks: Float32Array[], sourceSampleRate: number, targetSampleRate = 16000): Blob {
  // Flatten
  let total = 0;
  for (const c of chunks) total += c.length;
  const pcm = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    pcm.set(c, offset);
    offset += c.length;
  }

  // Downsample
  const downsampled = downsample(pcm, sourceSampleRate, targetSampleRate);

  // 16-bit
  const buffer = new ArrayBuffer(44 + downsampled.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + downsampled.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, targetSampleRate, true);
  view.setUint32(28, targetSampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, downsampled.length * 2, true);

  let idx = 44;
  for (let i = 0; i < downsampled.length; i++) {
    const s = Math.max(-1, Math.min(1, downsampled[i]));
    view.setInt16(idx, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    idx += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function downsample(pcm: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return pcm;
  const ratio = from / to;
  const outLength = Math.floor(pcm.length / ratio);
  const out = new Float32Array(outLength);
  let pos = 0;
  for (let i = 0; i < outLength; i++) {
    const nextPos = Math.floor((i + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let j = pos; j < nextPos && j < pcm.length; j++) {
      sum += pcm[j];
      count++;
    }
    out[i] = count > 0 ? sum / count : 0;
    pos = nextPos;
  }
  return out;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
