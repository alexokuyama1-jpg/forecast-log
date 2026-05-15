import { createFileRoute } from "@tanstack/react-router";
import Dashboard from "@/components/dashboard/Dashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel Logístico — CD Carambeí | Lactalis" },
      { name: "description", content: "Dashboard operacional e financeiro do Centro de Distribuição Carambeí: efetividade de embarques, ocupação de armazém, volume vs budget, perdas e FTE." },
    ],
  }),
  component: Index,
});

function Index() {
  return <Dashboard />;
}
