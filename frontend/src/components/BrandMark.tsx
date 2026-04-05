import { Link } from "react-router-dom";

const LOGO_LIGHT = "/branding/logo-light.png";

interface Props {
  align?: "left" | "center";
  className?: string;
}

export function BrandMark({ align = "left", className = "" }: Props) {
  const alignment =
    align === "center" ? "items-center text-center" : "items-start text-left";

  return (
    <Link
      to="/"
      className={`flex flex-col gap-2 rounded-md transition-opacity hover:opacity-90 ${alignment} ${className}`.trim()}
    >
      <img
        src={LOGO_LIGHT}
        alt="CatalogIT"
        className="max-h-10 w-auto object-contain"
      />
    </Link>
  );
}
