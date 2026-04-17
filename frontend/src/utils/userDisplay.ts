import type { User } from "../types/models";

type NamedUser = Pick<
  User,
  "display_name" | "first_name" | "last_name" | "email"
>;

export function getUserDisplayName(user: NamedUser) {
  const displayName = user.display_name?.trim();
  if (displayName) {
    return displayName;
  }
  const fullName = `${user.first_name} ${user.last_name}`.trim();
  return fullName || user.email;
}
