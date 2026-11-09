"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { readHumanFiles, uploadHumanAudio } from "@/lib/versions";

type Job = {
  id: string;
  video_id: string;
  kind: "upload" | "drive_link";
  filename: string | null;
  status: string;
  upload_url: string | null;
  error: string | null;
  created_at: string;
};

const CHUNK = 16 * 1024 * 1024; // multiple of 256 KiB, as Drive resumable uploads require
const LIVE = ["requested", "ready_for_upload", "uploaded", "downloading", "queued", "processing"];
const STATUS_TEXT: Record<string, string> = {
  requested: "waiting for the worker",
  ready_for_upload: "uploading",
  uploaded: "uploaded",
  downloading: "downloading from Drive",
  queued: "queued",
  processing: "processing (subtitles, checks)",
  done: "done",
  failed: "failed",
  cancelled: "cancelled",
};

function idFrom(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
}

function putChunk(url: string, blob: Blob, start: number, total: number, onProgress: (sent: number) => void) {
  return new Promise<number>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.setRequestHeader("Content-Range", `bytes ${start}-${start + blob.size - 1}/${total}`);
    x.upload.onprogress = (e) => onProgress(start + e.loaded);
    x.onload = () => resolve(x.status);
    x.onerror = () => reject(new Error("network error"));
    x.send(blob);
  });
}

async function waitForUploadUrl(jobId: string): Promise<string> {
  const until = Date.now() + 120000;
  while (Date.now() < until) {
    const { data } = await supabase.from("jobs").select("status,upload_url,error").eq("id", jobId).single();
    if (data?.status === "ready_for_upload" && data.upload_url) return data.upload_url;
    if (data?.status === "failed") throw new Error(data.error || "the worker refused the upload");
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("No answer from the worker for 2 minutes. Is the laptop on and start_platform running?");
}

export default function UploadPanel({ existing }: { existing: Set<string> }) {
  const [tab, setTab] = useState<"file" | "link" | "folder">("file");
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState("");
  const [vid, setVid] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [replace, setReplace] = useState(false);
  const [hSrt, setHSrt] = useState<File | null>(null);
  const [hJson, setHJson] = useState<File | null>(null);
  const [hMp3, setHMp3] = useState<File | null>(null);
  const humanForm = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const loadJobs = async () => {
    const { data } = await supabase
      .from("jobs").select("id,video_id,kind,filename,status,upload_url,error,created_at")
      .order("created_at", { ascending: false }).limit(10);
    if (data) setJobs(data as Job[]);
  };
  useEffect(() => {
    loadJobs();
    const t = setInterval(loadJobs, 5000);
    return () => clearInterval(t);
  }, []);

  const idTaken = vid !== "" && existing.has(vid);
  const idValid = /^[A-Za-z0-9._-]{1,80}$/.test(vid);
  const ready = idValid && (!idTaken || replace) && !busy && (tab === "file" ? !!file : tab === "link" ? !!link.trim() : false);

  const reset = () => {
    setFile(null); setLink(""); setVid(""); setTitle(""); setText(""); setReplace(false); setProgress(null);
    setHSrt(null); setHJson(null); setHMp3(null);
    if (input.current) input.current.value = "";
    humanForm.current?.querySelectorAll("input").forEach((i) => (i.value = ""));
  };

  const start = async () => {
    setBusy(true);
    setMsg(null);
    try {
      // Optional files a person made: parsed / stored now, compared with the AI output after processing.
      const human = await readHumanFiles(hSrt, hJson);
      const human_audio_path = hMp3 ? await uploadHumanAudio(vid, hMp3) : null;
      const base = { video_id: vid, script_title: title.trim() || null, script_text: text.trim() || null, human, human_audio_path };
      if (tab === "link") {
        const { error } = await supabase.from("jobs").insert({ ...base, kind: "drive_link", drive_url: link.trim() });
        if (error) throw new Error(error.message);
        setMsg({ ok: true, text: `Added. The worker downloads ${vid} from Drive and processes it; progress is below.` });
        reset();
      } else if (file) {
        const { data, error } = await supabase.from("jobs")
          .insert({ ...base, kind: "upload", filename: file.name, size: file.size, origin: window.location.origin })
          .select("id").single();
        if (error || !data) throw new Error(error?.message || "could not create the upload");
        setProgress(0);
        const url = await waitForUploadUrl(data.id);
        let offset = 0;
        while (offset < file.size) {
          const blob = file.slice(offset, Math.min(offset + CHUNK, file.size), "");
          let status = 0;
          // Drive sometimes answers 403/429/5xx (rate limit) for a while; the chunk is then simply sent again.
          for (let attempt = 0; attempt < 10; attempt++) {
            try {
              status = await putChunk(url, blob, offset, file.size, (sent) => setProgress(sent / file.size));
              if (status === 308 || status === 200 || status === 201) break;
            } catch {
              status = 0;
            }
            await new Promise((r) => setTimeout(r, Math.min(60000, 2000 * 2 ** attempt)));
          }
          if (status === 403 || status === 429)
            throw new Error("Google Drive rate limit: the upload was refused for several minutes. Try again later, or drop the file into the Drive folder.");
          if (status !== 308 && status !== 200 && status !== 201) throw new Error(`upload stopped (HTTP ${status || "network"})`);
          offset += blob.size;
        }
        await supabase.from("jobs").update({ status: "uploaded" }).eq("id", data.id);
        setMsg({ ok: true, text: `${file.name} uploaded to Drive as ${vid}. Processing starts within a minute; progress is below.` });
        reset();
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
      setProgress(null);
    }
    setBusy(false);
    loadJobs();
  };

  return (
    <section className="card stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Add a video</h2>
        <div className="row" style={{ gap: 6 }}>
          <button className={tab === "file" ? "primary" : ""} onClick={() => setTab("file")}>From computer</button>
          <button className={tab === "link" ? "primary" : ""} onClick={() => setTab("link")}>Google Drive link</button>
          <button className={tab === "folder" ? "primary" : ""} onClick={() => setTab("folder")}>Drive folder</button>
        </div>
      </div>

      {tab === "folder" ? (
        <p className="muted" style={{ margin: 0 }}>
          Drop videos into Google Drive → Shared with me → <b>ClusterX AI → inbox</b>. The file name becomes the video ID.
          Optional files next to it: <code>&lt;id&gt;.script.txt</code> (first line = script title, the rest = script text), and files a
          person made: <code>&lt;id&gt;.narration.mp3</code>, <code>&lt;id&gt;.en.srt</code>, <code>&lt;id&gt;.json</code>.
        </p>
      ) : (
        <div className="grid2">
          <div className="stack">
            {tab === "file" ? (
              <label>
                Video file (.mp4 .mov .mkv .avi .m4v .webm)
                <input
                  ref={input}
                  type="file"
                  accept="video/*,.mp4,.mov,.mkv,.avi,.m4v,.webm"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setFile(f);
                    if (f) setVid(idFrom(f.name));
                  }}
                />
                {file && <span className="small">{(file.size / 1e6).toFixed(0)} MB</span>}
              </label>
            ) : (
              <label>
                Google Drive link (sharing: “Anyone with the link”)
                <input value={link} placeholder="https://drive.google.com/file/d/…/view" onChange={(e) => setLink(e.target.value)} />
              </label>
            )}
            <label>
              Video ID (file names become &lt;id&gt;.mp4, &lt;id&gt;.en.srt, …)
              <input value={vid} placeholder="carp-0001" onChange={(e) => setVid(e.target.value.trim())} />
              {vid && !idValid && <span className="bad small">Letters, digits, dot, dash and underscore only.</span>}
              {idTaken && (
                <span className="row small" style={{ gap: 6 }}>
                  <span className="bad">{vid} already exists.</span>
                  <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> replace it
                </span>
              )}
            </label>
          </div>
          <div className="stack">
            <label>Script title (written before recording)<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
            <label>Script text<textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} /></label>
          </div>
        </div>
      )}

      {tab !== "folder" && (
        <details>
          <summary className="small">
            Files made by a person (optional): {[hMp3 && "mp3", hSrt && "srt", hJson && "json"].filter(Boolean).join(", ") || "none"}
          </summary>
          <div className="row" ref={humanForm} style={{ marginTop: 8 }}>
            <label>Narration (&lt;id&gt;.narration.mp3)<input type="file" accept=".mp3,audio/mpeg" onChange={(e) => setHMp3(e.target.files?.[0] || null)} /></label>
            <label>Subtitles (&lt;id&gt;.en.srt)<input type="file" accept=".srt" onChange={(e) => setHSrt(e.target.files?.[0] || null)} /></label>
            <label>Metadata (&lt;id&gt;.json)<input type="file" accept=".json,application/json" onChange={(e) => setHJson(e.target.files?.[0] || null)} /></label>
          </div>
          <p className="small muted" style={{ margin: "6px 0 0" }}>
            The AI still makes its own version. On the video page you compare both, pick one as the reviewer version and edit it.
            When subtitles are attached, the reviewer version starts from them.
          </p>
        </details>
      )}

      {tab !== "folder" && (
        <div className="row">
          <button className="primary" disabled={!ready} onClick={start}>
            {busy ? (progress !== null ? `Uploading ${Math.floor(progress * 100)}%` : "Working…") : tab === "file" ? "Upload" : "Add from Drive"}
          </button>
          {progress !== null && (
            <progress value={progress} max={1} style={{ flex: 1, minWidth: 160 }} />
          )}
        </div>
      )}
      {msg && <p className={msg.ok ? "ok" : "bad"} style={{ margin: 0 }}>{msg.text}</p>}

      {jobs.length > 0 && (
        <div className="scroll">
          <table>
            <thead><tr><th>Recent</th><th>Source</th><th>Status</th><th>Added</th></tr></thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td><b>{j.video_id}</b></td>
                  <td className="small muted">{j.kind === "upload" ? j.filename : "Drive link"}</td>
                  <td>
                    <span className={`pill ${j.status === "done" ? "ok" : j.status === "failed" ? "bad" : LIVE.includes(j.status) ? "warn" : "none"}`}>
                      {STATUS_TEXT[j.status] || j.status}
                    </span>
                    {j.error && <div className="bad small">{j.error}</div>}
                  </td>
                  <td className="small muted">{new Date(j.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
