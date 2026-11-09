"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, fmtTime, parseTime, words, type Cue, type Label, type Video } from "@/lib/supabase";

const LABELS: Label[] = ["environment", "task", "other"];
// Fields the pipeline computes or the brief fixes; shown but not editable.
const LOCKED = new Set(["video_id", "narration_wpm", "narration_language"]);

function TimeInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(fmtTime(value));
  const [bad, setBad] = useState(false);
  useEffect(() => setText(fmtTime(value)), [value]);
  return (
    <input
      className="time"
      value={text}
      style={bad ? { borderColor: "var(--bad)" } : undefined}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const v = parseTime(text);
        if (v === null) setBad(true);
        else {
          setBad(false);
          onChange(Math.round(v * 1000) / 1000);
        }
      }}
    />
  );
}

export default function Editor({ id }: { id: string }) {
  const [video, setVideo] = useState<Video | null>(null);
  const [cues, setCues] = useState<Cue[]>([]);
  const [meta, setMeta] = useState<Record<string, unknown>>({});
  const [reviewed, setReviewed] = useState(false);
  const [changed, setChanged] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [follow, setFollow] = useState(true);
  const audio = useRef<HTMLAudioElement>(null);
  const stopAt = useRef<number | null>(null);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("videos").select("*").eq("id", id).maybeSingle();
    if (error) return setError(error.message);
    if (!data) return setError("Video not found.");
    const v = data as Video;
    setVideo(v);
    setCues((v.cues || []).map((c) => ({ ...c, label: c.label ?? null })));
    setMeta(v.meta || {});
    setReviewed(v.reviewed);
    setChanged(false);
    if (v.audio_path) {
      const { data: s } = await supabase.storage.from("narration").createSignedUrl(v.audio_path, 6 * 3600);
      setAudioUrl(s?.signedUrl ?? null);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll the sync state after a save so the user sees when Drive has the new files.
  useEffect(() => {
    if (!video?.dirty) return;
    const t = setInterval(async () => {
      const { data } = await supabase.from("videos").select("dirty,synced_at,qc,meta").eq("id", id).maybeSingle();
      if (data && !data.dirty) {
        setVideo((v) => (v ? { ...v, ...data } : v));
        if (!changed) setMeta(data.meta);
      }
    }, 10000);
    return () => clearInterval(t);
  }, [video?.dirty, id, changed]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (changed) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed]);

  const active = useMemo(() => cues.findIndex((c) => now >= c.start && now < c.end), [cues, now]);
  useEffect(() => {
    if (follow && active >= 0) rowRefs.current[active]?.scrollIntoView({ block: "nearest" });
  }, [active, follow]);

  const edit = (i: number, patch: Partial<Cue>) => {
    setCues((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
    setChanged(true);
  };
  const remove = (i: number) => {
    setCues((cs) => cs.filter((_, j) => j !== i));
    setChanged(true);
  };
  const insertAfter = (i: number) => {
    setCues((cs) => {
      const prev = cs[i];
      const next = cs[i + 1];
      const start = prev ? prev.end : 0;
      const end = next ? Math.max(start + 0.2, Math.min(start + 2, next.start)) : start + 2;
      const c: Cue = { start, end, text: "", label: null };
      return [...cs.slice(0, i + 1), c, ...cs.slice(i + 1)];
    });
    setChanged(true);
  };
  const mergeNext = (i: number) => {
    setCues((cs) => {
      if (!cs[i + 1]) return cs;
      const a = cs[i], b = cs[i + 1];
      const m: Cue = { start: a.start, end: b.end, text: `${a.text.replace(/\n/g, " ")} ${b.text.replace(/\n/g, " ")}`.trim(), label: a.label ?? b.label };
      return [...cs.slice(0, i), m, ...cs.slice(i + 2)];
    });
    setChanged(true);
  };
  const play = (c: Cue) => {
    const a = audio.current;
    if (!a) return;
    a.currentTime = c.start;
    stopAt.current = c.end;
    a.play();
  };

  const stats = useMemo(() => {
    const dur = video?.duration_s || 0;
    const total = cues.reduce((n, c) => n + words(c.text), 0);
    const labelled = cues.every((c) => c.label);
    const good = cues.filter((c) => c.label === "environment" || c.label === "task").reduce((n, c) => n + words(c.text), 0);
    const issues: string[] = [];
    const sorted = [...cues].sort((a, b) => a.start - b.start);
    let last = 0;
    sorted.forEach((c, i) => {
      if (c.start - last > 10) issues.push(`No narration for ${(c.start - last).toFixed(1)} s before ${fmtTime(c.start)}`);
      last = Math.max(last, c.end);
      if (c.end <= c.start) issues.push(`Line at ${fmtTime(c.start)} ends before it starts`);
      if (sorted[i + 1] && c.end > sorted[i + 1].start + 0.001) issues.push(`Line at ${fmtTime(c.start)} overlaps the next one`);
      const lines = c.text.split("\n");
      if (lines.length > 2 || lines.some((l) => l.length > 42)) issues.push(`Line at ${fmtTime(c.start)} is longer than 2 × 42 characters`);
      if (!c.text.trim()) issues.push(`Empty line at ${fmtTime(c.start)} (it will be dropped)`);
    });
    if (dur && dur - last > 10) issues.push(`No narration for the last ${(dur - last).toFixed(1)} s`);
    const unl = cues.filter((c) => !c.label).length;
    if (unl) issues.push(`${unl} line(s) have no label`);
    return {
      total,
      wpm: dur ? Math.round((total / (dur / 60)) * 10) / 10 : 0,
      pct: labelled && total ? Math.round((1000 * good) / total) / 10 : null,
      issues,
    };
  }, [cues, video?.duration_s]);

  const save = async () => {
    setSaving(true);
    setSavedMsg("");
    const clean = [...cues]
      .sort((a, b) => a.start - b.start)
      .map((c) => ({ start: c.start, end: c.end, text: c.text.trim(), label: c.label }));
    const editedAt = new Date().toISOString();
    const { error } = await supabase
      .from("videos")
      .update({ cues: clean, meta, reviewed, dirty: true, edited_at: editedAt })
      .eq("id", id);
    setSaving(false);
    if (error) return setError(error.message);
    setCues(clean);
    setChanged(false);
    setVideo((v) => (v ? { ...v, dirty: true, edited_at: editedAt } : v));
    setSavedMsg("Saved. The worker writes the new SRT and JSON to Drive within about a minute.");
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (changed && !saving) save();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  if (error && !video) return <main className="wrap"><p className="bad">{error}</p><a href="/">← All videos</a></main>;
  if (!video) return <main className="wrap"><p className="muted">Loading…</p></main>;

  const checks = video.qc?.checks || {};
  return (
    <main className="wrap stack">
      <div className="row">
        <a href="/">← All videos</a>
      </div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>{video.id}</h1>
          <div className="muted small">
            {video.source_file} · {video.width}×{video.height} · {fmtTime(video.duration_s || 0)} · AI category: {video.category || "–"}
          </div>
        </div>
        <div className="savebar">
          <label className="row" style={{ flexDirection: "row", color: "var(--text)", fontSize: 14 }}>
            <input type="checkbox" checked={reviewed} onChange={(e) => { setReviewed(e.target.checked); setChanged(true); }} />
            Subtitles reviewed by me
          </label>
          <button className="primary" onClick={save} disabled={!changed || saving}>{saving ? "Saving…" : changed ? "Save (Ctrl+S)" : "Saved"}</button>
        </div>
      </div>
      {error && <p className="bad">{error}</p>}
      {savedMsg && <p className="ok">{savedMsg}</p>}
      <p className="small muted">
        Drive: {video.dirty ? <span className="pill warn">sync pending</span> : video.synced_at ? <span className="pill ok">synced {new Date(video.synced_at).toLocaleString()}</span> : <span className="pill none">original output</span>}
      </p>

      <div className="grid2">
        <section className="card stack">
          <h2>Checks</h2>
          <ul className="issues" style={{ margin: 0, paddingLeft: 18 }}>
            {Object.entries(checks).map(([k, c]) => (
              <li key={k}>
                <span className={`pill ${c.ok === null ? "none" : c.ok ? "ok" : "bad"}`}>{c.ok === null ? "n/a" : c.ok ? "ok" : "fail"}</span>{" "}
                {k.replace(/_/g, " ")}
                {c.value !== undefined && <span className="muted"> · {String(c.value)}</span>}
                {c.value_pct !== undefined && <span className="muted"> · {c.value_pct}%</span>}
                {c.note && <span className="muted small"> · {c.note}</span>}
              </li>
            ))}
          </ul>
          <div className="small">
            <b>Live, with your edits:</b> {stats.total} words · {stats.wpm} wpm{" "}
            <span className={`pill ${stats.wpm >= 25 ? "ok" : "bad"}`}>{stats.wpm >= 25 ? "≥25" : "<25"}</span> · descriptive{" "}
            {stats.pct === null ? <span className="pill none">label every line</span> : <span className={`pill ${stats.pct >= 90 ? "ok" : "bad"}`}>{stats.pct}%</span>}
          </div>
          {stats.issues.length > 0 && (
            <ul className="issues small" style={{ margin: 0, paddingLeft: 18 }}>
              {stats.issues.slice(0, 12).map((s, i) => <li key={i} className="bad">{s}</li>)}
              {stats.issues.length > 12 && <li className="muted">…and {stats.issues.length - 12} more</li>}
            </ul>
          )}
        </section>

        <section className="card stack">
          <h2>Metadata ({video.id}.json)</h2>
          {Object.entries(meta).map(([k, v]) => {
            const locked = LOCKED.has(k);
            const long = k === "script_text" || k === "summary";
            const val = v === null || v === undefined ? "" : String(v);
            const set = (s: string) => { setMeta((m) => ({ ...m, [k]: s === "" ? null : s })); setChanged(true); };
            return (
              <label key={k}>
                {k}{locked && " (computed)"}
                {long ? (
                  <textarea rows={3} value={val} onChange={(e) => set(e.target.value)} />
                ) : (
                  <input value={val} disabled={locked} onChange={(e) => set(e.target.value)} />
                )}
              </label>
            );
          })}
        </section>
      </div>

      <section className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Subtitles ({video.id}.en.srt) · {cues.length} lines</h2>
          <label className="row" style={{ flexDirection: "row", fontSize: 13 }}>
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> follow playback
          </label>
        </div>
        <div className="sticky-player">
          {audioUrl ? (
            <audio
              ref={audio}
              src={audioUrl}
              controls
              preload="metadata"
              onTimeUpdate={(e) => {
                const t = e.currentTarget.currentTime;
                setNow(t);
                if (stopAt.current !== null && t >= stopAt.current) {
                  e.currentTarget.pause();
                  stopAt.current = null;
                }
              }}
              onPlay={() => undefined}
            />
          ) : (
            <p className="muted small">No narration audio uploaded for this video.</p>
          )}
          <div className="small muted num">Now: {fmtTime(now)} · ▶ plays one line · ⇤/⇥ set start/end to the current audio time</div>
        </div>
        <div className="scroll">
          <table className="cues">
            <thead>
              <tr><th>#</th><th>Start</th><th>End</th><th style={{ width: "60%" }}>Text</th><th>Label (AI)</th><th></th></tr>
            </thead>
            <tbody>
              {cues.map((c, i) => (
                <tr key={i} ref={(el) => { rowRefs.current[i] = el; }} className={i === active ? "active" : undefined}>
                  <td className="muted num">{i + 1}</td>
                  <td>
                    <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                      <TimeInput value={c.start} onChange={(v) => edit(i, { start: v })} />
                      <button className="icon" title="Set start to current audio time" onClick={() => edit(i, { start: Math.round(now * 1000) / 1000 })}>⇤</button>
                    </div>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                      <TimeInput value={c.end} onChange={(v) => edit(i, { end: v })} />
                      <button className="icon" title="Set end to current audio time" onClick={() => edit(i, { end: Math.round(now * 1000) / 1000 })}>⇥</button>
                    </div>
                  </td>
                  <td><textarea rows={Math.max(1, c.text.split("\n").length)} value={c.text} onChange={(e) => edit(i, { text: e.target.value })} /></td>
                  <td>
                    <select value={c.label ?? ""} onChange={(e) => edit(i, { label: (e.target.value || null) as Label })}>
                      <option value="">–</option>
                      {LABELS.map((l) => <option key={l!} value={l!}>{l}</option>)}
                    </select>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                      <button className="icon" title="Play this line" onClick={() => play(c)} disabled={!audioUrl}>▶</button>
                      <button className="icon" title="Insert a line after" onClick={() => insertAfter(i)}>＋</button>
                      <button className="icon" title="Merge with next line" onClick={() => mergeNext(i)} disabled={i === cues.length - 1}>⤓</button>
                      <button className="icon" title="Delete line" onClick={() => remove(i)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {cues.length === 0 && <button onClick={() => insertAfter(-1)}>Add first line</button>}
      </section>
    </main>
  );
}
