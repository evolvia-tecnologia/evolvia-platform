import type { Metadata } from "next";

import { PaidRegistrationPlanner } from "./paid-registration-planner";

export const metadata: Metadata = {
  title: "Planejar inscrição paga | Evolvia",
  description:
    "Antecipe decisões sobre inscrições e atividades pagas sem informar valores ou processar pagamentos.",
};

export default function PaidRegistrationPlannerPage() {
  return <PaidRegistrationPlanner />;
}
