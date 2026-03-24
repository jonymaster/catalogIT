import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ROLE_HIERARCHY: Record<string, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
};

interface Props {
  requiredRole?: string;
}

export function ProtectedRoute({ requiredRole }: Props) {
  const { token, user } = useAuth();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (
    requiredRole &&
    (ROLE_HIERARCHY[user?.role ?? ""] ?? -1) < (ROLE_HIERARCHY[requiredRole] ?? 0)
  ) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
