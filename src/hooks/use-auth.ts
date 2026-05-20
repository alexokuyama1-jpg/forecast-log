import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const ADMIN_KEY = "lactalis.admin.session.v1";

export type AdminSession = { email: string; isAdmin: true };

export function isAdminSession(): AdminSession | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(ADMIN_KEY);
    return v ? (JSON.parse(v) as AdminSession) : null;
  } catch { return null; }
}

export function setAdminSession(s: AdminSession | null) {
  if (typeof window === "undefined") return;
  if (s) localStorage.setItem(ADMIN_KEY, JSON.stringify(s));
  else localStorage.removeItem(ADMIN_KEY);
  window.dispatchEvent(new Event("admin-session-change"));
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [admin, setAdmin] = useState<AdminSession | null>(() => isAdminSession());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s); setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const onAdmin = () => setAdmin(isAdminSession());
    window.addEventListener("admin-session-change", onAdmin);
    window.addEventListener("storage", onAdmin);
    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener("admin-session-change", onAdmin);
      window.removeEventListener("storage", onAdmin);
    };
  }, []);

  const authed = !!session || !!admin;
  return {
    session, admin,
    user: session?.user ?? (admin ? { email: admin.email, id: "admin" } as any : null),
    authed,
    loading,
  };
}
