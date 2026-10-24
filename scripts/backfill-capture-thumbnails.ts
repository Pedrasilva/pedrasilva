/** Runs backfillCaptureThumbnails with the service role. Idempotent. Usage: bun scripts/backfill-capture-thumbnails.ts */
import { createClient } from "@supabase/supabase-js";
import { backfillCaptureThumbnails } from "../src/lib/marketing/thumbnails.server";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
console.log(await backfillCaptureThumbnails(admin, { limit: 5000 }));
