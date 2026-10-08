import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as browserClient } from "@/integrations/supabase/client";

/**
 * The finance entity the signed-in user is working in (switcher choice, else
 * PSA). Every finance insert sets it explicitly; throws when the user has no
 * finance entity so a write can never land in the wrong one.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function currentEntityId(client: SupabaseClient<any, any, any> = browserClient as never): Promise<string> {
  const { data, error } = await client.rpc("current_finance_entity");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No finance entity available for this user");
  return data as string;
}
