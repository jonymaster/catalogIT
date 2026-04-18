import type { User } from "../../types/models";

function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

function initials(user: Pick<User, "first_name" | "last_name" | "email" | "display_name">): string {
  const first = user.first_name?.[0] ?? "";
  const last = user.last_name?.[0] ?? "";
  if (first || last) return (first + last).toUpperCase();
  const display = user.display_name ?? user.email ?? "";
  return display.slice(0, 2).toUpperCase();
}

interface AvatarProps {
  user: Pick<User, "id" | "first_name" | "last_name" | "email" | "display_name">;
  size?: number;
  title?: string;
}

export function Avatar({ user, size = 24, title }: AvatarProps) {
  const seed = user.email || user.id || user.display_name || "";
  const hue = hueFromString(seed);
  const label = title ?? `${user.display_name ?? `${user.first_name} ${user.last_name}`} · ${user.email}`;
  return (
    <span
      className="inline-flex items-center justify-center shrink-0 rounded-full border border-border font-semibold select-none"
      title={label}
      style={{
        width: size,
        height: size,
        background: `oklch(0.82 0.04 ${hue})`,
        color: `oklch(0.28 0.04 ${hue})`,
        fontSize: size <= 20 ? 9.5 : size <= 28 ? 10.5 : 12,
      }}
    >
      {initials(user)}
    </span>
  );
}

interface AvatarStackProps {
  users: AvatarProps["user"][];
  max?: number;
  size?: number;
}

export function AvatarStack({ users, max = 4, size = 22 }: AvatarStackProps) {
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  return (
    <span className="inline-flex items-center">
      {shown.map((u, i) => (
        <span
          key={u.id}
          className="relative inline-block"
          style={{ marginLeft: i === 0 ? 0 : -7, zIndex: 10 - i }}
        >
          <Avatar user={u} size={size} />
        </span>
      ))}
      {extra > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full border border-border bg-surface-2 text-fg-3 font-semibold"
          style={{
            marginLeft: -7,
            height: size,
            minWidth: size,
            padding: "0 5px",
            fontSize: 10,
          }}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}
