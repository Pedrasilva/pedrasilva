/**
 * Google Calendar connection — always for the signed-in caller (context.userId).
 * No function here accepts a user id.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CalendarStatus = { connected: boolean; email: string | null };

export const getCalendarStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CalendarStatus> => {
    const { getConnection } = await import("./calendar.server");
    const c = await getConnection(context.userId);
    return { connected: !!c, email: c?.google_email ?? null };
  });

export const getCalendarConnectUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ origin: z.string().url(), returnTo: z.string().max(200) }).parse(i))
  .handler(async ({ data, context }) => {
    const { signState, authUrl, checkOrigin } = await import("./calendar.server");
    const origin = checkOrigin(data.origin);
    return { url: authUrl(origin, await signState(context.userId, origin, data.returnTo)) };
  });

export const disconnectCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { disconnect } = await import("./calendar.server");
    return disconnect(context.userId);
  });
