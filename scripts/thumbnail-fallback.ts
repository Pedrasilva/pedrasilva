/** Native maintenance helper only. Never import this from src/. */
import sharp from "sharp";

export async function encodeWholeThumbnail(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await sharp(bytes)
    .autoOrient().resize({ width: 600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 75 }).toBuffer());
}