/** Maintenance only, never imported by the app/Worker. Add --overwrite to regenerate all. */
import { createClient } from "@supabase/supabase-js";
import { backfillCaptureThumbnails } from "../src/lib/marketing/thumbnails.server";
import { encodeWholeThumbnail } from "./thumbnail-fallback";
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Maintenance credentials unavailable");
const admin = createClient(url, key, { auth: { persistSession: false } });
console.log(await backfillCaptureThumbnails(admin, {
  limit: 5000,
  overwrite: process.argv.includes("--overwrite"),
  // Alternative for Storage's 25MB/50MP limits: server-side maintenance, not edge
  // decode. autoOrient includes mirrored EXIF orientations; originals stay untouched.
  fallback: encodeWholeThumbnail,
}));
