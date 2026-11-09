import { createClient } from "@supabase/supabase-js";

// The publishable key is meant to ship to browsers; row-level security plus the editor login protect the data.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://zpxplqxbjazdhbqogkib.supabase.co";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_WRVv0linTVLUS_e3G57eBQ_6gz9UD_E";

export const supabase = createClient(url, key);

export type Label = "environment" | "task" | "other" | null;
export type Cue = { start: number; end: number; text: string; label: Label };
export type Check = { ok: boolean | null; value?: unknown; value_pct?: number; value_s?: number; note?: string; [k: string]: unknown };
export type Video = {
  id: string;
  source_file: string | null;
  status: string;
  width: number | null;
  height: number | null;
  duration_s: number | null;
  category: string | null;
  meta: Record<string, unknown>;
  qc: { checks?: Record<string, Check>; error?: string; needs_human_review?: string[]; [k: string]: unknown };
  cues: Cue[];
  audio_path: string | null;
  reviewed: boolean;
  dirty: boolean;
  edited_at: string | null;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export function fmtTime(s: number): string {
  if (!isFinite(s)) return "";
  const ms = Math.round(s * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const sec = (ms % 60000) / 1000;
  const mm = String(m).padStart(2, "0");
  const ss = sec.toFixed(3).padStart(6, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function parseTime(t: string): number | null {
  const parts = t.trim().replace(",", ".").split(":");
  if (!parts.length || parts.length > 3) return null;
  let total = 0;
  for (const p of parts) {
    if (!/^\d+(\.\d+)?$/.test(p)) return null;
    total = total * 60 + parseFloat(p);
  }
  return total;
}

export function words(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
