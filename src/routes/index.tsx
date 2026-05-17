import { createFileRoute } from "@tanstack/react-router";
import Dashboard from "@/components/dashboard/Dashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel de Forecast — Custos & Volume PR" },
      { name: "description", content: "Dashboard de forecast multi-CD: realizado vs forecast vs budget, desvios por subpacote, volume e R$/TON." },
    ],
  }),
  component: Index,
});

function Index() {
  return <Dashboard />;
}
