// Mise à jour automatique des données de saison toutes les 30 minutes.
import { runUpdate } from "./lib/season.mjs";

export default async () => {
  const r = await runUpdate({ budgetMs: 25000 });
  console.log("update", JSON.stringify(r));
};

export const config = { schedule: "*/30 * * * *" };
