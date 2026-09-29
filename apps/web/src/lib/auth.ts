import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { isLocalStack, supabase } from "./supabase";

// Password of the seeded users in supabase/seed.sql. It exists only in the local stack.
const DEV_PASSWORD = "wannadoo-dev";

export type AuthState = { status: "loading" } | { status: "signedOut" } | { status: "signedIn"; user: User };

// Emails a six-digit code and a magic link. Supabase creates the account on first sign-in.
export async function sendCode(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function verifyCode(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function signInAsDevUser(email: string): Promise<void> {
  if (!isLocalStack) throw new Error("The test-user switcher works only against the local Supabase stack.");
  const { error } = await supabase.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (error) throw error;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const user = data.session?.user;
      setState(user ? { status: "signedIn", user } : { status: "signedOut" });
    });
    // No Supabase calls inside this callback: they would deadlock the auth lock.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      setState((prev) => {
        if (!user) return { status: "signedOut" };
        // Token refreshes keep the same user; keep the old object so dependants don't reload.
        if (prev.status === "signedIn" && prev.user.id === user.id) return prev;
        return { status: "signedIn", user };
      });
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return state;
}

// Turns Supabase auth errors into copy a tester can act on.
export function authErrorMessage(error: unknown): string {
  const e = error as { status?: number; code?: string; message?: string };
  const code = e.code ?? "";
  const message = (e.message ?? "").toLowerCase();
  if (e.status === 429 || code.includes("rate_limit") || message.includes("rate limit")) {
    return "Too many attempts. Wait a minute, then try again.";
  }
  if (code === "email_address_invalid" || message.includes("email address")) {
    return "That email address doesn't look right.";
  }
  if (code === "otp_expired" || message.includes("expired") || message.includes("invalid")) {
    return "That code is wrong or has expired. Check the latest email, or send a new code.";
  }
  if (message.includes("fetch") || message.includes("network")) {
    return "Can't reach the server. Check your connection and try again.";
  }
  return "Something went wrong. Please try again.";
}
