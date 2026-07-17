import type { UIMessage } from "ai";
import type { Asset, Layout } from "../poster/types";
import type { PosterPlan } from "./planner";

export type PosterDataParts = {
  status: { phase: "planning" | "generating-assets" | "composing" | "saving" | "done"; note?: string };
  plan: { plan: PosterPlan };
  asset: { role: string; asset: Asset };
  layout: { layout: Layout; palette: string[]; background: string; title: string };
  error: { message: string };
  progress: { current: number; total: number; label?: string };
};

export type PosterUIMessage = UIMessage<never, PosterDataParts>;
