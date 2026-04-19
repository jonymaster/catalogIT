import { Navigate, useParams } from "react-router-dom";

/** Old bookmarked URLs; inline edit now lives on the hardware detail overview. */
export function LaptopEditRedirect() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/hardware" replace />;
  return (
    <Navigate
      to={`/hardware/${id}`}
      replace
      state={{ openEdit: true }}
    />
  );
}
