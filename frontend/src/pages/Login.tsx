import { useState, useEffect, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";

interface OidcInfo {
  enabled: boolean;
  provider_name: string;
}

interface Providers {
  local: boolean;
  oidc: OidcInfo | null;
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
    client.get<Providers>("/auth/providers").then((r) => setProviders(r.data));
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-center text-2xl font-bold text-gray-900">
          CatalogIT
        </h1>
        <p className="mb-8 text-center text-sm text-gray-500">
          IT Service &amp; Hardware Management
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        {providers?.oidc && (
          <>
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs text-gray-400">or</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>
            <button
              onClick={login}
              className="w-full rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Sign in with {providers.oidc.provider_name || "SSO"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
