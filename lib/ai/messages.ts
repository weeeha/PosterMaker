import type { UIMessage } from "ai";
import type { Asset, Canvas, Layout, PosterIntent } from "../poster/types";

/**
 * UI-facing projection of a plan, not the raw planner schema.
 *
 * The two intents produce structurally different plans, so the chat panel gets
 * a common summary shape instead of having to narrow a union.
 */
export interface PlanSummary {
  kind: PosterIntent;
  title: string;
  palette: string[];
  mood: string;
  /** Art mode: what we're about to send to the image model. */
  imagePrompt?: string;
  /** Document mode: how many blocks the layout came out to. */
  blockCount?: number;
}

export type PosterDataParts = {
  status: {
    phase: "planning" | "generating-assets" | "composing" | "saving" | "done";
    note?: string;
  };
  plan: { plan: PlanSummary };
  asset: { role: string; asset: Asset };
  /** The canvas rides along because art mode can change the background color. */
  layout: { layout: Layout; canvas: Canvas; title: string };
  error: { message: string };
  progress: { current: number; total: number; label?: string };
};

export type PosterUIMessage = UIMessage<never, PosterDataParts>;
