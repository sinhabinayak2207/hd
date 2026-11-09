import { supabase, type Cue, type Version } from "@/lib/supabase";

function srtSeconds(t: string): number {
  const m = t.trim().replace(",", ".").match(/^(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
  if (!m) throw new Error(`bad SRT time "${t}"`);
  return Math.round((+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) * 1000) / 1000;
}

/** Parse an .srt file into cues. Throws with a readable message when the file is not SRT. */
export function parseSrt(text: string): Cue[] {
  const blocks = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim().split(/\n\s*\n/);
  const cues: Cue[] = [];
  for (const b of blocks) {
    const lines = b.split("\n");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const [a, z] = lines[i].split("-->");
    cues.push({ start: srtSeconds(a), end: srtSeconds(z.trim().split(/\s+/)[0]), text: lines.slice(i + 1).join("\n").trim(), label: null });
  }
  if (!cues.length) throw new Error("no subtitles found in the .srt file");
  return cues;
}

/** Read the optional human files a person attaches. */
export async function readHumanFiles(srt: File | null, json: File | null): Promise<Version | null> {
  if (!srt && !json) return null;
  const cues = srt ? parseSrt(await srt.text()) : [];
  let meta: Record<string, unknown> = {};
  if (json) {
    try {
      const parsed = JSON.parse((await json.text()).replace(/^﻿/, ""));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      meta = parsed;
    } catch (e) {
      throw new Error(`the .json file is not valid metadata JSON (${e instanceof Error ? e.message : e})`);
    }
  }
  return { cues, meta };
}

/** Upload a person's narration MP3 to the dashboard storage. Returns its storage path. */
export async function uploadHumanAudio(vid: string, mp3: File): Promise<string> {
  if (!/\.mp3$/i.test(mp3.name)) throw new Error("the narration file must be an .mp3");
  if (mp3.size > 50 * 1024 * 1024) throw new Error("the MP3 is larger than 50 MB; put it in the Drive inbox as <id>.narration.mp3 instead");
  const path = `human/${vid}.narration.mp3`;
  const { error } = await supabase.storage.from("narration").upload(path, mp3, { upsert: true, contentType: "audio/mpeg" });
  if (error) throw new Error(`MP3 upload failed: ${error.message}`);
  return path;
}

export function normText(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
}

export type Segment = { start: number; end: number; texts: Record<string, string> };

/** Line up several subtitle versions on one timeline: cues that overlap in time land in the same row. */
export function alignVersions(versions: Record<string, Cue[]>): Segment[] {
  const all: { k: string; c: Cue }[] = [];
  for (const [k, cues] of Object.entries(versions)) for (const c of cues) if (c.text.trim()) all.push({ k, c });
  all.sort((a, b) => a.c.start - b.c.start);
  const segs: Segment[] = [];
  for (const { k, c } of all) {
    const last = segs[segs.length - 1];
    if (last && c.start < last.end - 0.05) {
      last.end = Math.max(last.end, c.end);
      last.texts[k] = last.texts[k] ? `${last.texts[k]} ${c.text.replace(/\n/g, " ")}` : c.text.replace(/\n/g, " ");
    } else {
      segs.push({ start: c.start, end: c.end, texts: { [k]: c.text.replace(/\n/g, " ") } });
    }
  }
  return segs;
}
