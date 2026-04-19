import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useLocation } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/hr")({
  component: HRLayout,
});

function HRLayout() {
  const navigate = useNavigate();
  const loc = useLocation();

  // /hr (raiz) redirecciona para a lista de colaboradores
  useEffect(() => {
    if (loc.pathname === "/hr" || loc.pathname === "/hr/") {
      navigate({ to: "/hr" as never, replace: true });
      // Como /hr não tem componente próprio para além de Outlet,
      // mandamos para a lista principal
      navigate({ to: "/hr/minha-ficha", replace: true });
    }
  }, [loc.pathname, navigate]);

  return <Outlet />;
}
