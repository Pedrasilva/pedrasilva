import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthCtx = {
  session: Session | null;
  user: User | null;
  /** True effective admin permission (role + not impersonating). Use this for gating UI. */
  isAdmin: boolean;
  /** Real role from DB, ignoring impersonation. Use only to show the impersonation toggle. */
  isRealAdmin: boolean;
  /** Whether the admin is currently viewing the app as a regular collaborator. */
  viewAsUser: boolean;
  setViewAsUser: (v: boolean) => void;
  /** When in viewAsUser mode, the id of the collaborator being impersonated (if chosen). */
  viewAsCollaboratorId: string | null;
  setViewAsCollaboratorId: (id: string | null) => void;
  loading: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  session: null,
  user: null,
  isAdmin: false,
  isRealAdmin: false,
  viewAsUser: false,
  setViewAsUser: () => {},
  viewAsCollaboratorId: null,
  setViewAsCollaboratorId: () => {},
  loading: true,
  signOut: async () => {},
});

const VIEW_AS_KEY = "psa.viewAsUser";
const VIEW_AS_ID_KEY = "psa.viewAsCollaboratorId";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isRealAdmin, setIsRealAdmin] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(true);
  const [viewAsUser, setViewAsUserState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(VIEW_AS_KEY) === "1";
  });
  const [viewAsCollaboratorId, setViewAsCollaboratorIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(VIEW_AS_ID_KEY);
  });

  const setViewAsUser = (v: boolean) => {
    setViewAsUserState(v);
    if (typeof window !== "undefined") {
      if (v) window.sessionStorage.setItem(VIEW_AS_KEY, "1");
      else {
        window.sessionStorage.removeItem(VIEW_AS_KEY);
        window.sessionStorage.removeItem(VIEW_AS_ID_KEY);
      }
    }
    if (!v) setViewAsCollaboratorIdState(null);
  };

  const setViewAsCollaboratorId = (id: string | null) => {
    setViewAsCollaboratorIdState(id);
    if (typeof window !== "undefined") {
      if (id) window.sessionStorage.setItem(VIEW_AS_ID_KEY, id);
      else window.sessionStorage.removeItem(VIEW_AS_ID_KEY);
    }
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => fetchRole(s.user.id), 0);
      } else {
        setIsRealAdmin(false);
        setViewAsUser(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) fetchRole(s.user.id);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function fetchRole(userId: string) {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    setIsRealAdmin(!!data?.some((r) => r.role === "admin"));
  }

  const signOut = async () => {
    setViewAsUser(false);
    await supabase.auth.signOut();
  };

  const isAdmin = isRealAdmin && !viewAsUser;

  return (
    <Ctx.Provider
      value={{
        session,
        user: session?.user ?? null,
        isAdmin,
        isRealAdmin,
        viewAsUser,
        setViewAsUser,
        viewAsCollaboratorId,
        setViewAsCollaboratorId,
        loading,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
