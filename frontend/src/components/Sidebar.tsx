import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const navigation = [
  { name: "Dashboard", to: "/" },
  { name: "Services", to: "/services" },
  { name: "Hardware", to: "/hardware" },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-6">
        <span className="text-lg font-bold text-gray-900">CatalogIT</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`
            }
          >
            {item.name}
          </NavLink>
        ))}

        {isAdmin && (
          <>
            <div className="my-3 h-px bg-gray-200" />
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`
              }
            >
              Settings
            </NavLink>
          </>
        )}
      </nav>

      <div className="border-t border-gray-200 p-4">
        {user && (
          <p className="mb-2 truncate text-sm text-gray-600">{user.email}</p>
        )}
        <button
          onClick={logout}
          className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          Log out
        </button>
      </div>
    </aside>
  );
}
