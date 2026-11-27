"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { api, ApiError, logout, User } from "@/lib/api";

type Mode = "signup" | "signin";

export default function AuthPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const target = safeTarget(searchParams.get("next"));
  const ownerSignIn = target === "/admin";
  const [mode, setMode] = useState<Mode>("signup");
  const [signedInUser, setSignedInUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [error, setError] = useState("");
  const activeMode = ownerSignIn ? "signin" : mode;

  useEffect(() => {
    api<{ user: User }>("/auth/me")
      .then(({ user }) => {
        if (user.role === "admin") router.replace("/admin");
        else if (ownerSignIn) setSignedInUser(user);
        else router.replace(target);
      })
      .catch((reason: unknown) => {
        if (reason instanceof ApiError && reason.status !== 401) setError(reason.message);
      });
  }, [ownerSignIn, router, target]);

  async function switchAccount() {
    setSwitchingAccount(true);
    setError("");
    try {
      await logout();
      setSignedInUser(null);
    } catch (reason) {
      setError(
        reason instanceof Error && reason.name === "AbortError"
          ? "Sign out timed out. Please check your connection and try again."
          : reason instanceof Error ? reason.message : "Could not sign out.",
      );
    } finally {
      setSwitchingAccount(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = {
      full_name: String(form.get("full_name") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      password: String(form.get("password") ?? ""),
      accepted_terms: form.get("accepted_terms") === "on",
    };
    try {
      const { user } = await api<{ user: User }>(
        activeMode === "signup" ? "/auth/register" : "/auth/login",
        {
          method: "POST",
          body: JSON.stringify(
            activeMode === "signup"
              ? payload
              : { email: payload.email, password: payload.password },
          ),
        },
      );
      router.replace(user.role === "admin" ? "/admin" : target);
    } catch (reason) {
      setError(
        reason instanceof ApiError && reason.timedOut && activeMode === "signup"
          ? "Sign-up timed out. If your account was created, switch to Sign in before trying again."
          : reason instanceof Error ? reason.message : "Unable to sign in.",
      );
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <Link className="auth-back" href="/">← Back to The Nail Nurse</Link>
      <section className="auth-card">
        <Image className="auth-logo" src="/logo.png" alt="The Nail Nurse" width={78} height={78} />
        <p className="eyebrow">Your next nail date</p>
        <h1>{activeMode === "signup" ? "Come on in, lovely." : "Welcome back."}</h1>
        <p className="auth-intro">
          {ownerSignIn
            ? "Sign in with the administrator account to manage your dashboard."
            : activeMode === "signup"
            ? "Create your client account to book your favourite service."
            : "Sign in to pick up where you left off."}
        </p>

        {signedInUser && (
          <div className="account-switch-note">
            <p role="status">You’re signed in as {signedInUser.email}. Sign out before continuing with the owner account.</p>
            <button className="button button-outline" type="button" onClick={switchAccount} disabled={switchingAccount}>
              {switchingAccount ? "Signing out..." : "Sign out of client account"}
            </button>
          </div>
        )}

        <form className="form-stack" onSubmit={submit}>
          {activeMode === "signup" && (
            <>
              <label>Full name<input name="full_name" autoComplete="name" required maxLength={120} /></label>
              <label>Phone number<input name="phone" type="tel" autoComplete="tel" required minLength={7} maxLength={32} /></label>
            </>
          )}
          <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
          <label>Password<input name="password" type="password" autoComplete={activeMode === "signup" ? "new-password" : "current-password"} required minLength={activeMode === "signup" ? 12 : 1} /></label>
          {activeMode === "signup" && (
            <label className="checkbox-row">
              <input name="accepted_terms" type="checkbox" required />
              <span>I agree to the <Link href="/#policies" target="_blank">booking policies and terms</Link>.</span>
            </label>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          {ownerSignIn && error && (
            <p className="auth-owner-help">
              If you haven’t set up the owner account yet, run{" "}
              <code>python -m flask --app app setup-admin</code> from the backend folder.
              To change an existing owner password, run{" "}
              <code>python -m flask --app app reset-admin-password</code>. Password entry is hidden in the terminal.
            </p>
          )}
          <button className="button button-primary form-submit" type="submit" disabled={busy || switchingAccount || Boolean(signedInUser)}>
            {busy ? "One moment..." : activeMode === "signup" ? "Create my account" : "Sign in"}
          </button>
        </form>

        {!ownerSignIn && (
          <p className="auth-switch">
            {mode === "signup" ? "Already have an account?" : "New to The Nail Nurse?"}{" "}
            <button type="button" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(""); }}>
              {mode === "signup" ? "Sign in" : "Create an account"}
            </button>
          </p>
        )}
        <p className="auth-security">Your password is encrypted before it is stored. We never save it as plain text.</p>
      </section>
    </main>
  );
}

function safeTarget(target: string | null): string {
  return target?.startsWith("/") && !target.startsWith("//") ? target : "/book";
}
