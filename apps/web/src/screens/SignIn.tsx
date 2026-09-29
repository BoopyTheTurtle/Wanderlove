import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { BrandMark, StatusBar } from "../components/PhoneFrame";
import { authErrorMessage, sendCode, verifyCode } from "../lib/auth";
import { isLocalStack } from "../lib/supabase";

const RESEND_SECONDS = 60;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Welcome, then code entry. Every address sees the same copy, so the screen reveals nobody's membership.
export function SignIn({ onTestMode }: { onTestMode: () => void }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const cleanEmail = email.trim().toLowerCase();
  const emailValid = EMAIL_PATTERN.test(cleanEmail);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await sendCode(cleanEmail);
      setStep("code");
      setCode("");
      setCooldown(RESEND_SECONDS);
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleEmail(event: FormEvent) {
    event.preventDefault();
    if (!emailValid || busy) return;
    await send();
  }

  async function handleCode(event: FormEvent) {
    event.preventDefault();
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await verifyCode(cleanEmail, code);
      // The auth listener in App moves on from here.
    } catch (e) {
      setError(authErrorMessage(e));
      setBusy(false);
    }
  }

  function useDifferentEmail() {
    setStep("email");
    setCode("");
    setError(null);
  }

  return (
    <div className="screen auth-screen">
      <StatusBar />
      <div className="onboarding-head">
        <p className="wordmark">
          <BrandMark /> Wannadoo
        </p>
        {step === "email" ? (
          <>
            <h1>Explore your city together</h1>
            <p className="intro">Sign in or create an account with your email. We&rsquo;ll send you a code.</p>
          </>
        ) : (
          <>
            <h1>Check your email</h1>
            <p className="intro">
              We sent a six-digit code to <b>{cleanEmail}</b>. Type it below, or tap the link in the email.
            </p>
          </>
        )}
      </div>

      {step === "email" ? (
        <form className="card auth-card" onSubmit={handleEmail} noValidate>
          <label className="field">
            <span>Email</span>
            <span className="field-input">
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </span>
          </label>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary" disabled={!emailValid || busy}>
            {busy ? "Sending…" : "Send code"}
          </button>
        </form>
      ) : (
        <form className="card auth-card" onSubmit={handleCode} noValidate>
          <label className="field">
            <span>Code</span>
            <span className={`field-input code-input ${error ? "invalid" : ""}`}>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                aria-label="Six-digit code"
                autoFocus
              />
            </span>
          </label>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary" disabled={code.length !== 6 || busy}>
            {busy ? "Checking…" : "Sign in"}
          </button>
          <div className="auth-links">
            <button type="button" className="auth-link" onClick={() => void send()} disabled={cooldown > 0 || busy}>
              {cooldown > 0 ? `Resend code in ${cooldown} s` : "Resend code"}
            </button>
            <button type="button" className="auth-link" onClick={useDifferentEmail} disabled={busy}>
              Use a different email
            </button>
          </div>
        </form>
      )}

      {isLocalStack && (
        <div className="partner-foot">
          <button type="button" className="dev-switch" onClick={onTestMode}>
            Test mode: sign in as a seeded user
          </button>
        </div>
      )}
    </div>
  );
}
