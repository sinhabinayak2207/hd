"use client";

import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import { supabase, downloadDeliverables, type Check, type Video } from "@/lib/supabase";
import UploadPanel from "@/components/UploadPanel";

function Pill({ c, text }: { c?: Check; text?: string }) {
  if (!c || c.ok === null || c.ok === undefined) return <span className="pill none">{text ?? "–"}</span>;
  return <span className={`pill ${c.ok ? "ok" : "bad"}`}>{text ?? (c.ok ? "ok" : "fail")}</span>;
}

function List() {
  const [rows, setRows] = useState<Video[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const download = async (id: string) => {
    setBusyId(id);
    setError("");
    const { data, error } = await supabase.from("videos").select("*").eq("id", id).single();
    try {
      if (error || !data) throw new Error(error?.message || "not found");
      await downloadDeliverables(data as Video);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusyId("");
  };

  useEffect(() => {
    const load = () =>
      supabase
        .from("videos")
        .select("id,source_file,status,width,height,duration_s,category,qc,reviewed,dirty,edited_at,synced_at,created_at,meta")
        .order("created_at", { ascending: false })
        .then(({ data, error }) => {
          if (error) setError(error.message);
          else setRows(data as Video[]);
        });
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <main className="wrap stack">
      <div>
        <h1>Videos</h1>
        <p className="muted">
          Add a video below. It shows up here a few minutes after processing. Open one to review and edit its subtitles.
        </p>
      </div>
      <UploadPanel existing={new Set((rows || []).map((r) => r.id))} />
      {error && <p className="bad">{error}</p>}
      {rows === null ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="card muted">No videos yet.</div>
      ) : (
        <div className="card scroll">
          <table>
            <thead>
              <tr>
                <th>Video</th><th>Category (AI)</th><th>Length</th><th>1080p</th><th>WPM</th>
                <th>Descriptive</th><th>Pauses</th><th>Subtitles</th><th>Drive</th><th>Files</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => {
                const c = v.qc?.checks || {};
                const len = c["length_2_to_10_min"];
                return (
                  <tr key={v.id}>
                    <td>
                      <a href={`/v/${encodeURIComponent(v.id)}`}><b>{v.id}</b></a>
                      <div className="muted small">{v.source_file}</div>
                      {v.status === "failed" && <div className="bad small">failed: {String(v.qc?.error || "")}</div>}
                    </td>
                    <td>{v.category || <span className="muted">–</span>}</td>
                    <td className="num"><Pill c={len} text={v.duration_s ? `${(v.duration_s / 60).toFixed(1)} min` : "–"} /></td>
                    <td><Pill c={c["resolution_1080p"]} text={v.width ? `${Math.min(v.width, v.height || 0)}p` : "–"} /></td>
                    <td className="num"><Pill c={c["narration_wpm_at_least_25"]} text={String(c["narration_wpm_at_least_25"]?.value ?? "–")} /></td>
                    <td className="num">
                      <Pill c={c["descriptive_at_least_90pct"]}
                        text={c["descriptive_at_least_90pct"]?.value_pct !== undefined ? `${c["descriptive_at_least_90pct"].value_pct}%` : "not checked"} />
                    </td>
                    <td><Pill c={c["no_pause_over_10s"]} text={c["no_pause_over_10s"]?.ok ? "none >10s" : c["no_pause_over_10s"] ? ">10s found" : "–"} /></td>
                    <td>{v.reviewed ? <span className="pill ok">reviewed</span> : <span className="pill warn">needs review</span>}</td>
                    <td className="small">
                      {v.dirty ? <span className="pill warn">sync pending</span> : v.synced_at ? <span className="pill ok">synced</span> : <span className="pill none">original</span>}
                    </td>
                    <td>
                      {v.status === "ready" && (
                        <button className="icon" title="Download <id>.narration.mp3, <id>.en.srt, <id>.json" disabled={busyId === v.id} onClick={() => download(v.id)}>
                          {busyId === v.id ? "…" : "⬇ mp3 · srt · json"}
                        </button>
                      )}
                      {v.status === "processing" && <span className="pill warn">processing</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

export default function Page() {
  return (
    <AuthGate>
      <List />
    </AuthGate>
  );
}
