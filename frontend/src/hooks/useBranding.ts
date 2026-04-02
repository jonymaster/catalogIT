import { useCallback, useEffect, useState } from "react";
import client from "../api/client";
import type { BrandingInfo } from "../types/models";

const EMPTY_BRANDING: BrandingInfo = {
  logo_url: null,
  logo_filename: null,
  updated_at: null,
};

export function useBranding() {
  const [branding, setBranding] = useState<BrandingInfo>(EMPTY_BRANDING);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const response = await client.get<BrandingInfo>("/api/settings/branding");
      setBranding(response.data);
    } catch {
      setBranding(EMPTY_BRANDING);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    function handleBrandingUpdate() {
      void reload();
    }

    window.addEventListener("catalogit:branding-updated", handleBrandingUpdate);
    return () =>
      window.removeEventListener(
        "catalogit:branding-updated",
        handleBrandingUpdate,
      );
  }, [reload]);

  return { branding, loading, reload };
}
