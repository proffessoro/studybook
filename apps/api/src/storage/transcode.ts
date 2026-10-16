import { spawn } from 'node:child_process';
import { setPriority } from 'node:os';
import type { FileKind } from '@studybook/shared';
import { env } from '../config/env.js';

/** Longest side of a processed image: sharp on a phone, a fraction of a camera photo's weight. */
const IMAGE_MAX_SIDE = 1600;
/** A video longer than this to process is stopped, so one file can't hold the worker forever. */
const FFMPEG_TIMEOUT_MS = 30 * 60 * 1000;
/** Two threads on the 2 vCPU target leave room for the API (design §7). */
const FFMPEG_THREADS = '2';

/**
 * 480p on the shorter side (portrait phone videos stay 480 wide), never upscaled,
 * with even sizes as H.264 needs.
 */
const SCALE_480P =
  "scale=w='if(gte(iw,ih),-2,min(480,trunc(iw/2)*2))':h='if(gte(iw,ih),min(480,trunc(ih/2)*2),-2)'";

/** Writes the smaller version of `input` to `output`. */
export async function transcode(kind: FileKind, input: string, output: string): Promise<void> {
  switch (kind) {
    case 'image': {
      // Loaded here, so only the worker pays for sharp's native library.
      const { default: sharp } = await import('sharp');
      // rotate() applies the EXIF orientation; sharp drops all metadata (GPS included) by default.
      await sharp(input, { animated: true })
        .rotate()
        .resize({ width: IMAGE_MAX_SIDE, height: IMAGE_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 75 })
        .toFile(output);
      return;
    }
    case 'audio':
      // 64 kbps AAC (design §5.5): clear speech and music at a fraction of a WAV or high-bitrate MP3.
      await ffmpeg(['-i', input, '-vn', '-map_metadata', '-1', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', '-f', 'mp4', output]);
      return;
    case 'video':
      // One 480p H.264 MP4 with `faststart` (index first), so it plays while downloading.
      await ffmpeg([
        '-i', input,
        '-map', '0:v:0', '-map', '0:a:0?',
        '-vf', SCALE_480P,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-maxrate', '900k', '-bufsize', '1800k',
        '-profile:v', 'main', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '64k',
        '-map_metadata', '-1', '-movflags', '+faststart',
        '-threads', FFMPEG_THREADS,
        '-f', 'mp4', output,
      ]);
      return;
    case 'pdf':
      throw new Error('PDFs are not processed');
  }
}

/** Runs ffmpeg at low priority; rejects with the end of its error output. */
function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(env.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args], {
      stdio: ['ignore', 'ignore', 'pipe'],
      signal: AbortSignal.timeout(FFMPEG_TIMEOUT_MS),
      windowsHide: true,
    });
    if (child.pid) {
      try {
        // Background work: the API's requests come first.
        setPriority(child.pid, 10);
      } catch {
        // Not allowed on some systems; processing still works.
      }
    }
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-2000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with ${code}: ${stderr.trim()}`));
    });
  });
}
