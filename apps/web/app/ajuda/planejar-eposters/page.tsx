import type { Metadata } from "next";

import { EposterPlanner } from "./eposter-planner";

export const metadata: Metadata = {
  title: "Planejar pôsteres e ePosters | Evolvia",
  description:
    "Antecipe decisões sobre pôsteres e ePosters sem enviar arquivos, cadastrar trabalhos ou publicar conteúdo.",
};

export default function EposterPlannerPage() {
  return <EposterPlanner />;
}
