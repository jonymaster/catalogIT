import { useAuth } from "../context/AuthContext";
import { Navigate } from "react-router-dom";

export function Login() {
  const { token, login } = useAuth();

  if (token) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-center text-2xl font-bold text-gray-900">
          CatalogIT
        </h1>
        <p className="mb-8 text-center text-sm text-gray-500">
          IT Service & Hardware Management
        </p>
        <button
          onClick={login}
          className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
        >
          Sign in with Okta
        </button>
      </div>
    </div>
  );
}
