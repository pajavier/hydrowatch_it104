"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { getSupabaseClient } from "@/utils/supabase/client";

type LoginProps = {
  onLogin: (token: string) => void;
};

type AuthMode = "signIn" | "signUp";

export function Login({ onLogin }: LoginProps) {
  const [authMode, setAuthMode] = useState<AuthMode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(
    () =>
      typeof window !== "undefined" &&
      localStorage.getItem("rememberMe") === "true",
  );
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (authMode === "signUp" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);

    try {
      const supabase = getSupabaseClient();
      const { data, error: authError } =
        authMode === "signIn"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (!data.session?.access_token) {
        if (authMode === "signUp") {
          setSuccessMessage(
            "Account created. Check your email to confirm your account, then sign in.",
          );
          setAuthMode("signIn");
          setPassword("");
          setConfirmPassword("");
          return;
        }

        setError("Sign in succeeded, but no access token was returned.");
        return;
      }

      if (rememberMe) {
        localStorage.setItem("rememberMe", "true");
      } else {
        localStorage.removeItem("rememberMe");
      }

      onLogin(data.session.access_token);
    } catch (authError) {
      setError(
        authError instanceof Error
          ? authError.message
          : "Unable to authenticate right now.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const switchAuthMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setError(null);
    setSuccessMessage(null);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const isSignUp = authMode === "signUp";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#070B1A] px-4 py-10 text-white">
      <section className="w-full max-w-[500px] rounded-[28px] border border-white/10 bg-[#111A38]/95 px-8 py-6 shadow-2xl shadow-black/30 backdrop-blur sm:px-12">
        <div className="mb-6 text-center">
          <Image
            alt="Hydrowatch logo"
            className="mx-auto h-40 w-40 object-contain"
            height={160}
            priority
            src="/hydrowatch-logo.png"
            width={160}
          />
          <h1 className="text-[30px] font-extrabold leading-tight text-white">
            HydroWatch
          </h1>
          <p className="mt-2 text-sm font-bold text-slate-400">
            IoT-powered water turbidity monitoring system
          </p>
        </div>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <label className="block">
            <span className="text-sm font-bold text-slate-300">
              Email Address
            </span>
            <span className="mt-2 flex h-13 items-center gap-3 rounded-2xl border border-white/10 bg-[#0B1128] px-4 text-sky-300 focus-within:border-sky-300/60 focus-within:ring-4 focus-within:ring-sky-400/10">
              <MailIcon />
              <input
                className="min-w-0 flex-1 bg-transparent text-base font-medium text-white outline-none placeholder:text-slate-500"
                placeholder="you@example.com"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-bold text-slate-300">Password</span>
            <span className="mt-2 flex h-13 items-center gap-3 rounded-2xl border border-white/10 bg-[#0B1128] px-4 text-sky-300 focus-within:border-sky-300/60 focus-within:ring-4 focus-within:ring-sky-400/10">
              <LockIcon />
              <input
                className="min-w-0 flex-1 bg-transparent text-base font-medium text-white outline-none placeholder:text-slate-500"
                placeholder="********"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="rounded p-1 text-sky-300 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
                type="button"
                onClick={() => setShowPassword((isVisible) => !isVisible)}
              >
                <EyeIcon isVisible={showPassword} />
              </button>
            </span>
          </label>

          {isSignUp && (
            <label className="block">
              <span className="text-sm font-bold text-slate-300">
                Confirm Password
              </span>
              <span className="mt-2 flex h-13 items-center gap-3 rounded-2xl border border-white/10 bg-[#0B1128] px-4 text-sky-300 focus-within:border-sky-300/60 focus-within:ring-4 focus-within:ring-sky-400/10">
                <LockIcon />
                <input
                  className="min-w-0 flex-1 bg-transparent text-base font-medium text-white outline-none placeholder:text-slate-500"
                  placeholder="********"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
                <button
                  aria-label={
                    showConfirmPassword
                      ? "Hide confirm password"
                      : "Show confirm password"
                  }
                  className="rounded p-1 text-sky-300 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
                  type="button"
                  onClick={() =>
                    setShowConfirmPassword((isVisible) => !isVisible)
                  }
                >
                  <EyeIcon isVisible={showConfirmPassword} />
                </button>
              </span>
            </label>
          )}

          <div className="flex items-center justify-between gap-4 py-1">
            <label className="flex items-center gap-2 text-sm font-bold text-slate-300">
              <input
                className="h-4 w-4 accent-sky-400"
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
              />
              Remember me
            </label>

            {!isSignUp && (
              <button
                className="text-sm font-bold text-sky-300 transition hover:text-white hover:underline"
                type="button"
              >
                Forgot Password?
              </button>
            )}
          </div>

          {error && (
            <p className="rounded-2xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-300">
              {error}
            </p>
          )}

          {successMessage && (
            <p className="rounded-2xl border border-sky-300/30 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-200">
              {successMessage}
            </p>
          )}

          <button
            className="mt-1 h-13 w-full rounded-2xl bg-gradient-to-r from-[#38BDF8] to-[#7C3AED] px-4 text-base font-extrabold text-white shadow-lg shadow-sky-500/20 transition hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={isLoading}
          >
            {isLoading
              ? isSignUp
                ? "Creating account..."
                : "Signing in..."
              : isSignUp
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm font-medium text-slate-400">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            className="font-extrabold text-sky-300 underline-offset-4 transition hover:text-white hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-sky-300 active:underline"
            type="button"
            onClick={() => switchAuthMode(isSignUp ? "signIn" : "signUp")}
          >
            {isSignUp ? "Sign In" : "Sign Up"}
          </button>
        </p>
      </section>
    </main>
  );
}

function MailIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M4 6h16v12H4V6Zm0 1 8 6 8-6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6v-9Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function EyeIcon({ isVisible }: { isVisible: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      {!isVisible && (
        <path
          d="m4 4 16 16"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
      )}
    </svg>
  );
}
