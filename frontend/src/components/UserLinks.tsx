import { Fragment } from "react";
import { Link } from "react-router-dom";
import type { User } from "../types/models";
import { getUserDisplayName } from "../utils/userDisplay";

type LinkedUser = Pick<
  User,
  "id" | "display_name" | "first_name" | "last_name" | "email"
>;

const baseLinkClassName =
  "text-brand-700 transition-colors hover:text-brand-800 hover:underline dark:text-brand-300 dark:hover:text-brand-200";

export function UserLink({
  user,
  showEmail = false,
  className,
}: {
  user: LinkedUser;
  showEmail?: boolean;
  className?: string;
}) {
  const label = getUserDisplayName(user);

  return (
    <Link
      to={`/users/${user.id}`}
      className={[baseLinkClassName, className].filter(Boolean).join(" ")}
    >
      {showEmail ? `${label} (${user.email})` : label}
    </Link>
  );
}

export function UserLinkList({
  users,
  empty = "--",
  showEmail = false,
}: {
  users: LinkedUser[];
  empty?: string;
  showEmail?: boolean;
}) {
  if (users.length === 0) {
    return <>{empty}</>;
  }

  return users.map((user, index) => (
    <Fragment key={user.id}>
      <UserLink user={user} showEmail={showEmail} />
      {index < users.length - 1 ? ", " : null}
    </Fragment>
  ));
}
