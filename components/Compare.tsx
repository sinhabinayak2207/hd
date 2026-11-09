"use client";

import { useMemo, useState } from "react";
import { fmtTime, narrationWpm, cleanCues, words, type Cue, type Video } from "@/lib/supabase";
import { alignVersions, normText, readHumanFiles, uploadHumanAudio } from "@/lib/versions";
import { supabase } from "@/lib/supabase";

type Props = {
  video: Video;
  cues: Cue[];
  meta: Record<string, unknown>;
  onUseField: (key: string, value: unknown) => void;
  onAttached: () => void;
};

const show = (v: unknown) => (v === null || v === undefined || v === "" ? "–" : typeof v === "object" ? JSON.stringify(v) : String(v));

export default function Compare({ video, cues, meta, onUseField, onAttached }: Props) {
  const ai = video.ai;
  const human = video.human;
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [srt, setSrt] = useState<File | null>(null);
  const [json, setJson] = useState<File | null>(null);
  const [mp3, setMp3] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const versions = useMemo(() => {
    const v: Record<string, Cue[]> = {};
    if (ai) v.ai = ai.cues;
    if (human?.cues?.length) v.human = human.cues;
    v.reviewer = cues;
    return v;
  }, [ai, human, cues]);
  const segs = useMemo(() => alignVersions(versions), [versions]);
  const cols = Object.keys(versions);
  const title: Record<string, string> = { ai: "AI generated", human: "Uploaded by a person", reviewer: "Reviewer (final)" };

  const fieldKeys = useMemo(() => {
    const order = Array.isArray(video.qc?.field_order) ? (video.qc.field_order as string[]) : [];
    return Array.from(new Set([...order, ...Object.keys(ai?.meta || {}), ...Object.keys(human?.meta || {}), ...Object.keys(meta)]));
  }, [video.qc, ai, human, meta]);

  const statsFor = (c: Cue[]) => {
    const clean = cleanCues(c);
    return `${clean.length} lines · ${clean.reduce((n, x) => n + words(x.text), 0)} words · ${narrationWpm(c, video.duration_s || 0)} wpm`;
  };

  const attach = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const patch: Record<string, unknown> = {};
      const h = await readHumanFiles(srt, json);
      if (h) patch.human = { cues: h.cues.length ? h.cues : human?.cues || [], meta: Object.keys(h.meta).length ? h.meta : human?.meta || {} };
      if (mp3) patch.human_audio_path = await uploadHumanAudio(video.id, mp3);
      if (!Object.keys(patch).length) throw new Error("choose at least one file");
      const { error } = await supabase.from("videos").update(patch).eq("id", video.id);
      if (error) throw new Error(error.message);
      setMsg({ ok: true, text: "Added. Compare below, then load it as the reviewer version if you want to start from it." });
      setSrt(null); setJson(null); setMp3(null);
      onAttached();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
    setBusy(false);
  };

  return (
    <section className="card stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Compare versions</h2>
        <label className="row" style={{ flexDirection: "row", fontSize: 13 }}>
          <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> only rows that differ
        </label>
      </div>

      <div className="row small" style={{ gap: 16 }}>
        {cols.map((k) => (
          <span key={k}><b>{title[k]}:</b> <span className="muted">{statsFor(versions[k])}</span></span>
        ))}
        {!human && <span className="muted">No human-made files yet. Add them below to compare.</span>}
      </div>

      <h3 className="small" style={{ margin: "4px 0 0" }}>Metadata</h3>
      <div className="scroll">
        <table>
          <thead>
            <tr><th>Field</th><th>AI generated</th>{human && <th>Uploaded by a person</th>}<th>Reviewer (final)</th></tr>
          </thead>
          <tbody>
            {fieldKeys.map((k) => {
              const a = ai?.meta?.[k];
              const h = human?.meta?.[k];
              const r = meta[k];
              const differs = show(a) !== show(r) || (human ? show(h) !== show(r) : false);
              if (onlyDiff && !differs) return null;
              return (
                <tr key={k}>
                  <td className="small"><b>{k}</b></td>
                  <td className={`small ${show(a) !== show(r) ? "diff" : ""}`}>
                    {show(a)}
                    {ai && show(a) !== show(r) && k !== "narration_wpm" && k !== "video_id" && (
                      <div><button className="icon" onClick={() => onUseField(k, a ?? null)}>use this</button></div>
                    )}
                  </td>
                  {human && (
                    <td className={`small ${show(h) !== show(r) ? "diff" : ""}`}>
                      {k in (human.meta || {}) ? show(h) : <span className="muted">not in file</span>}
                      {k in (human.meta || {}) && show(h) !== show(r) && k !== "narration_wpm" && k !== "video_id" && (
                        <div><button className="icon" onClick={() => onUseField(k, h ?? null)}>use this</button></div>
                      )}
                    </td>
                  )}
                  <td className="small"><b>{show(r)}</b></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3 className="small" style={{ margin: "4px 0 0" }}>Subtitles, lined up by time</h3>
      <div className="scroll">
        <table>
          <thead>
            <tr><th>Time</th>{cols.map((k) => <th key={k}>{title[k]}</th>)}</tr>
          </thead>
          <tbody>
            {segs.map((s, i) => {
              const r = normText(s.texts.reviewer || "");
              const differs = cols.some((k) => normText(s.texts[k] || "") !== r);
              if (onlyDiff && !differs) return null;
              return (
                <tr key={i}>
                  <td className="small muted num" style={{ whiteSpace: "nowrap" }}>{fmtTime(s.start)}</td>
                  {cols.map((k) => (
                    <td key={k} className={`small ${k !== "reviewer" && normText(s.texts[k] || "") !== r ? "diff" : ""}`}>
                      {s.texts[k] || <span className="muted">–</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3 className="small" style={{ margin: "4px 0 0" }}>{human || video.human_audio_path ? "Replace" : "Add"} files made by a person</h3>
      <div className="row">
        <label>Subtitles (.srt)<input type="file" accept=".srt" onChange={(e) => setSrt(e.target.files?.[0] || null)} /></label>
        <label>Metadata (.json)<input type="file" accept=".json,application/json" onChange={(e) => setJson(e.target.files?.[0] || null)} /></label>
        <label>Narration (.mp3)<input type="file" accept=".mp3,audio/mpeg" onChange={(e) => setMp3(e.target.files?.[0] || null)} /></label>
        <button disabled={busy || (!srt && !json && !mp3)} onClick={attach}>{busy ? "Adding…" : "Add"}</button>
      </div>
      {msg && <p className={msg.ok ? "ok" : "bad"} style={{ margin: 0 }}>{msg.text}</p>}
    </section>
  );
}
