import type { Metadata } from "next";

import { ScientificPlanner } from "./scientific-planner";

export const metadata: Metadata = {
  title: "Planejar trabalhos científicos | Evolvia",
  description:
    "Antecipe decisões para configurar trabalhos científicos sem cadastrar dados ou criar regras definitivas.",
};

export default function ScientificPlannerPage() {
  return <ScientificPlanner />;
}
