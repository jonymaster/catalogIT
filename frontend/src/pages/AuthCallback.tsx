import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { decodePayload } from "../context/auth-context";

export function AuthCallback() {
  const [params] = useSearchParams();
  const { setToken } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const token = params.get("token");
    if (token) {
      setToken(token);
      const payload = decodePayload(token);
      navigate(payload?.must_reset_password ? "/reset-password" : "/", { replace: true });
    } else {
      navigate("/login", { replace: true });
    }
  }, [params, setToken, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
      <p className="text-gray-500 dark:text-gray-400">Signing you in...</p>
    </div>
  );
}
