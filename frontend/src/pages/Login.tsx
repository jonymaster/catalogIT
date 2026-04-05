import { useState, useEffect, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import client from "../api/client";
import { BrandMark } from "../components/BrandMark";
import { useAuth } from "../context/useAuth";

interface OidcInfo {
  enabled: boolean;
  provider_name: string;
}

interface Providers {
  local: boolean;
  oidc: OidcInfo | null;
}

const inputClassName =
  "mt-1 block w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 shadow-sm transition-colors focus:border-gray-900 dark:focus:border-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-900/10 dark:focus:ring-gray-100/10";

function ProvidersLoading() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14">
      <div
        className="h-9 w-9 animate-spin rounded-full border-2 border-gray-200 dark:border-gray-700 border-t-gray-900 dark:border-t-gray-100"
        aria-hidden
      />
      <p className="text-sm text-gray-500 dark:text-gray-400">Loading sign-in options…</p>
    </div>
  );
}

interface LocalLoginFormProps {
  email: string;
  password: string;
  error: string;
  loading: boolean;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  emailId: string;
  passwordId: string;
}

function LocalLoginForm({
  email,
  password,
  error,
  loading,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  emailId,
  passwordId,
}: LocalLoginFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label
          htmlFor={emailId}
          className="block text-sm font-medium text-gray-700 dark:text-gray-200"
        >
          Email
        </label>
        <input
          id={emailId}
          type="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          required
          autoComplete="email"
          className={inputClassName}
        />
      </div>
      <div>
        <label
          htmlFor={passwordId}
          className="block text-sm font-medium text-gray-700 dark:text-gray-200"
        >
          Password
        </label>
        <input
          id={passwordId}
          type="password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          required
          autoComplete="current-password"
          className={inputClassName}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-gray-900 dark:bg-gray-100 px-4 py-3 text-sm font-semibold text-white dark:text-gray-900 shadow-sm transition-colors hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export function Login() {
  const { token, login, setToken } = useAuth();
  const navigate = useNavigate();

  const [providers, setProviders] = useState<Providers | null>(null);
  const [email, setEmail] = useState("admin@catalogit.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    client.get<Providers>("/auth/providers").then((r) => {
      setProviders(r.data);
      if (r.data.oidc) {
        setEmail("");
      }
    });
  }, []);

  if (token) {
    return <Navigate to="/" replace />;
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await client.post<{
        access_token: string;
        must_reset_password: boolean;
      }>("/auth/login", { email, password });
      setToken(res.data.access_token);
      if (res.data.must_reset_password) {
        navigate("/reset-password", { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    } catch {
      setError("Invalid credentials");
    } finally {
      setLoading(false);
    }
  }

  const oidc = providers?.oidc;
  const showOidcFirst = !!oidc;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 px-4 py-12 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 shadow-xl ring-1 ring-black/5">
        <div className="mb-2 flex justify-center">
          <BrandMark align="center" className="[&_img]:max-h-16" />
        </div>
        <p className="mb-8 text-center text-sm text-gray-500 dark:text-gray-400">
          IT Service &amp; Hardware Management
        </p>

        {providers === null && <ProvidersLoading />}

        {providers !== null && showOidcFirst && (
          <>
            <button
              type="button"
              onClick={login}
              className="w-full rounded-xl bg-gray-900 dark:bg-gray-100 px-4 py-3.5 text-center text-sm font-semibold text-white dark:text-gray-900 shadow-md transition-colors hover:bg-gray-800 dark:hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
            >
              Sign in with {oidc.provider_name || "SSO"}
            </button>
            <p className="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">
              You will be redirected to your organization&apos;s sign-in page.
            </p>

            <details className="group mt-8 border-t border-gray-100 dark:border-gray-800 pt-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-1 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 transition-colors hover:text-gray-900 dark:hover:text-gray-100 [&::-webkit-details-marker]:hidden">
                <span>Sign in with email and password</span>
                <svg
                  className="h-5 w-5 shrink-0 text-gray-400 transition-transform group-open:rotate-180"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m19.5 8.25-7.5 7.5-7.5-7.5"
                  />
                </svg>
              </summary>
              <div className="mt-4">
                <LocalLoginForm
                  email={email}
                  password={password}
                  error={error}
                  loading={loading}
                  onEmailChange={setEmail}
                  onPasswordChange={setPassword}
                  onSubmit={handleLogin}
                  emailId="login-email-oidc"
                  passwordId="login-password-oidc"
                />
              </div>
            </details>
          </>
        )}

        {providers !== null && !showOidcFirst && (
          <LocalLoginForm
            email={email}
            password={password}
            error={error}
            loading={loading}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onSubmit={handleLogin}
            emailId="login-email"
            passwordId="login-password"
          />
        )}
      </div>
    </div>
  );
}
