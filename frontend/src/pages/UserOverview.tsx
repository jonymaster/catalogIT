import { Link, useOutletContext } from "react-router-dom";
import { Badge, BooleanYesNoBadge } from "../components/Badge";
import type { UserDetailOutletContext } from "../types/userProfile";
import { getUserDisplayName } from "../utils/userDisplay";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">{children}</dd>
    </div>
  );
}

function sourceBadge(source: "local" | "scim" | "oidc") {
  if (source === "local") {
    return <Badge color="gray">Manual</Badge>;
  }
  if (source === "scim") {
    return <Badge color="blue">SCIM</Badge>;
  }
  return <Badge color="purple">OIDC</Badge>;
}

export function UserOverview() {
  const { profile } = useOutletContext<UserDetailOutletContext>();
  const { user } = profile;
  const fullName = `${user.first_name} ${user.last_name}`.trim();
  const displayName = getUserDisplayName(user);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link
          to="owned-services"
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-brand-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-brand-700"
        >
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Owned Services
          </p>
          <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-gray-100">
            {profile.owned_services.length}
          </p>
        </Link>
        <Link
          to="assigned-services"
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-brand-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-brand-700"
        >
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Assigned Services
          </p>
          <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-gray-100">
            {profile.assigned_services.length}
          </p>
        </Link>
        <Link
          to="assigned-assets"
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-brand-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-brand-700"
        >
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Assigned Assets
          </p>
          <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-gray-100">
            {profile.assigned_laptops.length}
          </p>
        </Link>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">
          Profile
        </h2>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name">{fullName || "—"}</Field>
          <Field label="Display Name">
            {displayName !== fullName ? displayName : "—"}
          </Field>
          <Field label="Email">{user.email}</Field>
          <Field label="Role">{user.role}</Field>
          <Field label="Active">
            <BooleanYesNoBadge value={user.is_active} />
          </Field>
          <Field label="Renewal Emails">
            <BooleanYesNoBadge value={user.receive_renewal_notifications} />
          </Field>
          <Field label="Department">{user.department?.trim() || "—"}</Field>
          <Field label="Locale">{user.locale?.trim() || "—"}</Field>
          <Field label="Timezone">{user.timezone?.trim() || "—"}</Field>
          <Field label="Provisioning Source">
            {sourceBadge(user.provisioning_source)}
          </Field>
        </dl>
      </div>
    </div>
  );
}
