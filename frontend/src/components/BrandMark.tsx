import { Link } from "react-router-dom";
import { useBranding } from "../hooks/useBranding";

interface Props {
  align?: "left" | "center";
  className?: string;
}

export function BrandMark({ align = "left", className = "" }: Props) {
  const { branding } = useBranding();
  const logoUrl =
    branding.logo_url && branding.updated_at
      ? `${branding.logo_url}?v=${encodeURIComponent(branding.updated_at)}`
      : branding.logo_url;

  const alignment =
    align === "center" ? "items-center text-center" : "items-start text-left";

  return (
    <Link
      to="/"
      className={`flex flex-col gap-2 rounded-md transition-opacity hover:opacity-90 ${alignment} ${className}`.trim()}
    >
      <span className="text-lg font-bold text-gray-900">CatalogIT</span>
      {logoUrl && (
        <img
          src={logoUrl}
          alt="CatalogIT logo"
          className="max-h-16 w-auto object-contain"
        />
      )}
    </Link>
  );
}
