"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <main className="wrap"><p className="muted">Loading…</p></main>;

  if (!session) {
    return (
      <main className="wrap narrow">
        <h1>Vetto review</h1>
        <p className="muted">Sign in to review subtitles and metadata.</p>
        <form
          className="card stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            setBusy(false);
            if (error) setError(error.message);
          }}
        >
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></label>
          {error && <p className="bad">{error}</p>}
          <button className="primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
      </main>
    );
  }

  return (
    <>
      <header className="topbar">
        <a href="/" className="brand">Vetto review</a>
        <span className="muted small">{session.user.email}</span>
        <button className="ghost small" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>
      {children}
    </>
  );
}
