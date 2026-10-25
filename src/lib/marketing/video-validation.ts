import type { VideoMetadata } from './mp4-metadata';
import type { PublishFormat } from './instagram-publish';

export const REEL_MAX_BYTES = 1024 * 1024 * 1024;
export class VideoValidationError extends Error {
  constructor(public rule: string, message: string) { super(message); }
}
export function reelPortraitWarning(v: VideoMetadata) { return Math.abs(v.width / v.height - 9 / 16) > 0.02; }
export function validateVideo(v: VideoMetadata, size: number, format: PublishFormat) {
  const fail = (rule: string, message: string): never => { throw new VideoValidationError(rule, message); };
  if (!/^(avc1|avc3|hvc1|hev1)$/.test(v.codec)) fail('codec', 'Video requires H.264 or HEVC in MP4/MOV');
  if (!Number.isFinite(v.duration) || v.duration < 3 || v.duration > (format === 'story' || format === 'carousel' ? 60 : 900)) fail('duration', 'Video length is outside the supported publishing range');
  if (size > (format === 'reel' ? REEL_MAX_BYTES : (format === 'story' || format === 'carousel' ? 100 : 1000) * 1024 * 1024)) fail('size', 'Video file exceeds the supported format size');
  if (!Number.isFinite(v.fps) || v.fps < 23 || v.fps > 60) fail('fps', 'Video requires 23–60 fps');
  if (!Number.isFinite(v.width) || !Number.isFinite(v.height) || v.width <= 0 || v.height <= 0 || v.width > 1920) fail('width', 'Video width must be at most 1920 pixels');
  if (!Number.isFinite(v.bitrate) || v.bitrate > 25000000) fail('bitrate', 'Video bitrate must be at most 25 Mbps');
  if (format === 'story' && reelPortraitWarning(v)) fail('storyRatio', 'Story video must be 9:16');
  // Portrait variants are advisory; landscape cannot be submitted as a finished reel.
  if (format === 'reel' && v.width >= v.height) fail('landscape', 'Reel must be portrait; export at 9:16');
  for (const a of v.audio) if (a.codec !== 'mp4a' || !Number.isFinite(a.sampleRate) || a.sampleRate <= 0 || a.sampleRate > 48000 || ![1,2].includes(a.channels)) fail('audio', 'Audio requires AAC, ≤48 kHz, mono or stereo');
}