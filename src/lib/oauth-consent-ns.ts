import { supabase } from "@/integrations/supabase/client";

export type OAuthNs = {
  getAuthorizationDetails: (id: string) => Promise<{
    data: {
      client?: { name?: string } | null;
      redirect_url?: string | null;
      redirect_to?: string | null;
    } | null;
    error: { message: string } | null;
  }>;
  approveAuthorization: (id: string) => Promise<{
    data: { redirect_url?: string | null; redirect_to?: string | null } | null;
    error: { message: string } | null;
  }>;
  denyAuthorization: (id: string) => Promise<{
    data: { redirect_url?: string | null; redirect_to?: string | null } | null;
    error: { message: string } | null;
  }>;
};

export function oauthNs(): OAuthNs {
  return (supabase.auth as unknown as { oauth: OAuthNs }).oauth;
}
