import { Link } from "react-router-dom";

export function SettingsUsers() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium text-gray-900">User Management</h2>
      <p className="text-sm text-gray-500">
        User management has moved to its own page for easier access.
      </p>
      <Link
        to="/users"
        className="inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        Go to Users
      </Link>
    </div>
  );
}
