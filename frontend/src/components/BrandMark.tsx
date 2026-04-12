import { Link } from "react-router-dom";
import { useHtmlHasDarkClass } from "../hooks/useHtmlDarkClass";

import fullLight from "../assets/branding/transparent-light.png";
import fullDark from "../assets/branding/transparent-dark.png";
import smallLight from "../assets/branding/small-light.png";
import smallDark from "../assets/branding/small-dark.png";

const imgExpanded =
  "block h-10 w-auto max-w-[min(100%,12rem)] shrink-0 object-contain object-left";
const imgCollapsed = "block h-8 w-8 shrink-0 object-contain";

interface Props {
  align?: "left" | "center";
  className?: string;
  collapsed?: boolean;
}

export function BrandMark({ align = "left", className = "", collapsed = false }: Props) {
  const isDark = useHtmlHasDarkClass();
  const src = collapsed
    ? isDark
      ? smallDark
      : smallLight
    : isDark
      ? fullDark
      : fullLight;

  const alignment =
    align === "center"
      ? "items-center text-center"
      : collapsed
        ? "items-center"
        : "items-start text-left";

  return (
    <Link
      to="/"
      className={`flex flex-col gap-2 rounded-md transition-opacity hover:opacity-90 ${alignment} ${className}`.trim()}
    >
      <img
        src={src}
        alt="CatalogIT"
        className={`${collapsed ? imgCollapsed : imgExpanded} ${collapsed && align === "center" ? "mx-auto" : ""}`}
        width={collapsed ? 32 : undefined}
        height={collapsed ? 32 : 40}
        decoding="async"
      />
    </Link>
  );
}
