"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, fmtTime, parseTime, words, downloadDeliverables, type Cue, type Video } from "@/lib/supabase";
import Compare from "@/components/Compare";

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
  const [dlError, setDlError] = useState("");
  const [base, setBase] = useState<"ai" | "human">("ai");
  const [audioSource, setAudioSource] = useState<"ai" | "human">("ai");
  const [confirmLoad, setConfirmLoad] = useState<"ai" | "human" | null>(null);
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
    setBase(v.base || "ai");
    setAudioSource(v.audio_source === "human" && v.human_audio_path ? "human" : "ai");
    setChanged(false);
  }, [id]);

  // The player plays the narration the reviewer chose to deliver.
  const audioPath = audioSource === "human" && video?.human_audio_path ? video.human_audio_path : video?.audio_path;
  useEffect(() => {
    if (!audioPath) return setAudioUrl(null);
    supabase.storage.from("narration").createSignedUrl(audioPath, 6 * 3600).then(({ data }) => setAudioUrl(data?.signedUrl ?? null));
  }, [audioPath]);

  /** Replace the reviewer's working copy with the AI or the human version (the reviewer then edits it and saves). */
  const loadVersion = (k: "ai" | "human") => {
    if (!video) return;
    const src = k === "ai" ? video.ai : video.human;
    if (!src) return;
    const aiMeta = video.ai?.meta || {};
    const order = Array.isArray(video.qc?.field_order) ? (video.qc.field_order as string[]) : Object.keys(aiMeta);
    const m: Record<string, unknown> = {};
    for (const key of order) m[key] = k === "human" && key in (src.meta || {}) ? src.meta[key] : aiMeta[key] ?? null;
    if ("video_id" in m) m.video_id = video.id;
    if (src.cues.length) setCues(src.cues.map((c) => ({ ...c, label: k === "ai" ? c.label ?? null : null })));
    setMeta(m);
    setBase(k);
    setChanged(true);
    setConfirmLoad(null);
  };

  const refreshVersions = async () => {
    const { data } = await supabase.from("videos").select("ai,human,human_audio_path").eq("id", id).maybeSingle();
    if (data) setVideo((v) => (v ? { ...v, ...data } : v));
  };

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
    return {
      total,
      wpm: dur ? Math.round((total / (dur / 60)) * 10) / 10 : 0,
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
      .update({ cues: clean, meta, reviewed, base, audio_source: audioSource, dirty: true, edited_at: editedAt })
      .eq("id", id);
    setSaving(false);
    if (error) return setError(error.message);
    setCues(clean);
    setChanged(false);
    setVideo((v) => (v ? { ...v, dirty: true, edited_at: editedAt, base, audio_source: audioSource } : v));
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
          <button
            disabled={changed}
            title={changed ? "Save your edits first" : "Download <id>.narration.mp3, <id>.en.srt and <id>.json"}
            onClick={() => {
              setDlError("");
              downloadDeliverables({ ...video, cues, meta, audio_source: audioSource }).catch((e) => setDlError(String(e.message || e)));
            }}
          >
            ⬇ Download files
          </button>
        </div>
      </div>
      {error && <p className="bad">{error}</p>}
      {dlError && <p className="bad">{dlError}</p>}
      <div className="row small">
        <span className="muted">Download one:</span>
        {(["mp3", "srt", "json"] as const).map((k) => (
          <button key={k} className="icon" disabled={changed}
            onClick={() => downloadDeliverables({ ...video, cues, meta, audio_source: audioSource }, [k]).catch((e) => setDlError(String(e.message || e)))}>
            {k === "mp3" ? `${video.id}.narration.mp3` : k === "srt" ? `${video.id}.en.srt` : `${video.id}.json`}
          </button>
        ))}
      </div>
      {savedMsg && <p className="ok">{savedMsg}</p>}
      <p className="small muted">
        Drive: {video.dirty ? <span className="pill warn">sync pending</span> : video.synced_at ? <span className="pill ok">synced {new Date(video.synced_at).toLocaleString()}</span> : <span className="pill none">original output</span>}
      </p>

      <section className="card stack">
        <h2 style={{ margin: 0 }}>Reviewer version</h2>
        <p className="small muted" style={{ margin: 0 }}>
          The editor below always holds the reviewer&apos;s version. Only this version is delivered: Drive output, downloads and
          narration_wpm all come from it. It was loaded from the <b>{base === "human" ? "human-uploaded" : "AI-generated"}</b> version.
        </p>
        <div className="row">
          <span className="small">Start over from:</span>
          {(["ai", "human"] as const).map((k) => {
            const has = k === "ai" ? !!video.ai : !!video.human;
            return (
              <button key={k} disabled={!has} title={has ? "" : "No human-made files for this video yet (add them in Compare below)"}
                onClick={() => setConfirmLoad(k)}>
                {k === "ai" ? "AI generated" : "Uploaded by a person"}{base === k ? " (current)" : ""}
              </button>
            );
          })}
          {confirmLoad && (
            <span className="row small" style={{ gap: 6 }}>
              <span className="bad">Replace the subtitles and metadata in the editor with the {confirmLoad === "ai" ? "AI" : "human"} version?</span>
              <button className="primary icon" onClick={() => loadVersion(confirmLoad)}>Yes, load it</button>
              <button className="icon" onClick={() => setConfirmLoad(null)}>Cancel</button>
            </span>
          )}
        </div>
        <div className="row small">
          <span>Narration MP3 to deliver:</span>
          <label className="row" style={{ flexDirection: "row", fontSize: 13, color: "var(--text)" }}>
            <input type="radio" name="audio" checked={audioSource === "ai"} onChange={() => { setAudioSource("ai"); setChanged(true); }} />
            extracted from the video
          </label>
          <label className="row" style={{ flexDirection: "row", fontSize: 13, color: "var(--text)" }}>
            <input type="radio" name="audio" disabled={!video.human_audio_path} checked={audioSource === "human"}
              onChange={() => { setAudioSource("human"); setChanged(true); }} />
            uploaded by a person{!video.human_audio_path && " (none yet)"}
          </label>
        </div>
      </section>

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
            <span className={`pill ${stats.wpm >= 25 ? "ok" : "bad"}`}>{stats.wpm >= 25 ? "≥25" : "<25"}</span>
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
              <tr><th>#</th><th>Start</th><th>End</th><th style={{ width: "60%" }}>Text</th><th></th></tr>
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

      <Compare
        video={video}
        cues={cues}
        meta={meta}
        onUseField={(k, v) => { setMeta((m) => ({ ...m, [k]: v })); setChanged(true); }}
        onAttached={refreshVersions}
      />
    </main>
  );
}
