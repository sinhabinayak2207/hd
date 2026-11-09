import { createClient } from "@supabase/supabase-js";

// The publishable key is meant to ship to browsers; row-level security plus the editor login protect the data.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://zpxplqxbjazdhbqogkib.supabase.co";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_WRVv0linTVLUS_e3G57eBQ_6gz9UD_E";

export const supabase = createClient(url, key);

/** environment and task count as descriptive narration for the 90% rule; anything else (other, or a custom label) does not. */
export type Label = string | null;
export type Cue = { start: number; end: number; text: string; label: Label };
export type Version = { cues: Cue[]; meta: Record<string, unknown> };
export type Check ={ ok: boolean | null; value?: unknown; value_pct?: number; value_s?: number; note?: string; [k: string]: unknown };
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
  files: Record<string, string>;
  /** The pipeline's own version, never edited. */
  ai: Version | null;
  /** The version a person uploaded (their SRT / JSON), or null. */
  human: Version | null;
  human_audio_path: string | null;
  /** Which version the reviewer's working copy (cues/meta) was loaded from. */
  base: "ai" | "human";
  /** Which narration MP3 is delivered. */
  audio_source: "ai" | "human";
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

export const DEFAULT_FIELDS = ["video_id", "script_id", "contributor_id", "script_title", "script_text",
  "narration_wpm", "narration_language", "summary", "source"];

function srtTime(t: number): string {
  let ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3600000); ms -= h * 3600000;
  const m = Math.floor(ms / 60000); ms -= m * 60000;
  const s = Math.floor(ms / 1000); ms -= s * 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
}

/** Same rules as the worker: sorted, empty lines dropped, no zero-length or overlapping cues. */
export function cleanCues(cues: Cue[]): Cue[] {
  const out = [...cues]
    .filter((c) => c.text.trim())
    .sort((a, b) => a.start - b.start)
    .map((c) => ({ ...c, text: c.text.trim(), end: Math.max(c.end, c.start + 0.2) }));
  for (let i = 0; i + 1 < out.length; i++) out[i].end = Math.min(out[i].end, out[i + 1].start);
  return out;
}

export function buildSrt(cues: Cue[]): string {
  return cleanCues(cues).map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join("\n");
}

export function narrationWpm(cues: Cue[], duration: number): number {
  const n = cleanCues(cues).reduce((k, c) => k + words(c.text), 0);
  return duration ? Math.round((n / (duration / 60)) * 10) / 10 : 0;
}

export function buildJson(meta: Record<string, unknown>, order: string[] | undefined, wpm: number): string {
  const keys = order && order.length ? order : DEFAULT_FIELDS;
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = k in meta ? meta[k] : null;
  for (const k of Object.keys(meta)) if (!(k in out)) out[k] = meta[k];
  if ("narration_wpm" in out) out.narration_wpm = wpm;
  return JSON.stringify(out, null, 2) + "\n";
}

export function saveBlob(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function driveDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
}

function clickLink(href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Download <id>.narration.mp3, <id>.en.srt and <id>.json for one video (SRT and JSON built from the latest saved edits). */
export async function downloadDeliverables(v: Video, which: ("mp3" | "srt" | "json")[] = ["srt", "json", "mp3"]) {
  const cues = v.cues || [];
  const wpm = narrationWpm(cues, v.duration_s || 0);
  const order = Array.isArray(v.qc?.field_order) ? (v.qc.field_order as string[]) : undefined;
  if (which.includes("srt")) saveBlob(`${v.id}.en.srt`, buildSrt(cues), "application/x-subrip");
  if (which.includes("json")) saveBlob(`${v.id}.json`, buildJson(v.meta || {}, order, wpm), "application/json");
  if (which.includes("mp3")) {
    const name = `${v.id}.narration.mp3`;
    // The reviewer chooses which narration is delivered: the one extracted from the video, or the one a person uploaded.
    const path = v.audio_source === "human" && v.human_audio_path ? v.human_audio_path : v.audio_path;
    if (path && path.endsWith(".narration.mp3")) {
      const { data, error } = await supabase.storage.from("narration").createSignedUrl(path, 600, { download: name });
      if (error || !data) throw new Error(error?.message || "could not get the MP3 link");
      await new Promise((r) => setTimeout(r, 400));
      clickLink(data.signedUrl);
    } else if (v.files?.[name]) {
      window.open(driveDownloadUrl(v.files[name]), "_blank", "noopener");
    } else {
      throw new Error("The full MP3 is not in the dashboard for this video; take it from Drive → output/" + v.id);
    }
  }
}
