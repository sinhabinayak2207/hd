"""Supabase link for the dashboard: push processed videos, pull subtitle/metadata edits back.

The worker uses the secret key (server side only, from config.json). The dashboard uses the publishable key plus
an editor login, and row-level security limits it to reading videos and editing cues/meta/reviewed.
"""
import json
import os
import re
import subprocess
import time

import requests

from clusterx import pipeline


class Store:
    def __init__(self, cfg):
        sb = cfg.get("supabase") or {}
        self.url = (sb.get("url") or "").rstrip("/")
        self.key = sb.get("secret_key") or ""
        self.enabled = bool(self.url and self.key)

    def _h(self, extra=None):
        h = {"apikey": self.key, "Authorization": "Bearer " + self.key}
        h.update(extra or {})
        return h

    def upsert(self, row):
        r = requests.post(f"{self.url}/rest/v1/videos", data=json.dumps(row), timeout=60,
                          headers=self._h({"Content-Type": "application/json",
                                           "Prefer": "resolution=merge-duplicates,return=minimal"}))
        r.raise_for_status()

    def upload_audio(self, vid, mp3):
        """The deliverable narration MP3, for playback in the editor and for download. Bigger than the 50 MB bucket
        limit only for very long videos; then a 48 kbps copy is stored for playback (download then comes from Drive)."""
        src, tmp = mp3, None
        if os.path.getsize(mp3) > 45 * 1024 * 1024:
            tmp = src = mp3 + ".preview.mp3"
            subprocess.run([pipeline.FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", mp3, "-ac", "1",
                            "-codec:a", "libmp3lame", "-b:a", "48k", tmp], check=True)
        path = f"{vid}.narration.mp3" if tmp is None else f"{vid}.preview.mp3"
        with open(src, "rb") as f:
            r = requests.post(f"{self.url}/storage/v1/object/narration/{path}", data=f, timeout=600,
                              headers=self._h({"Content-Type": "audio/mpeg", "x-upsert": "true"}))
        if tmp:
            os.remove(tmp)
        r.raise_for_status()
        return path

    def jobs(self, status, kind=None):
        q = f"status=eq.{status}" + (f"&kind=eq.{kind}" if kind else "")
        r = requests.get(f"{self.url}/rest/v1/jobs?{q}&select=*&order=created_at", headers=self._h(), timeout=60)
        r.raise_for_status()
        return r.json()

    def update_job(self, job_id, **fields):
        r = requests.patch(f"{self.url}/rest/v1/jobs?id=eq.{job_id}", data=json.dumps(fields), timeout=60,
                           headers=self._h({"Content-Type": "application/json", "Prefer": "return=minimal"}))
        r.raise_for_status()

    def set_jobs_for_video(self, vid, status, error=None):
        """Move the dashboard job(s) for this video along, so the upload panel shows progress."""
        live = "(uploaded,queued,downloading,processing)"
        body = {"status": status, **({"error": error} if error else {})}
        r = requests.patch(f"{self.url}/rest/v1/jobs?video_id=eq.{requests.utils.quote(vid)}&status=in.{live}",
                           data=json.dumps(body), timeout=60,
                           headers=self._h({"Content-Type": "application/json", "Prefer": "return=minimal"}))
        r.raise_for_status()

    def job_for_video(self, vid):
        """The newest dashboard job for this video that is still waiting to be processed (has any human files)."""
        r = requests.get(f"{self.url}/rest/v1/jobs?video_id=eq.{requests.utils.quote(vid)}"
                         "&status=in.(uploaded,queued,downloading,processing)&select=*&order=created_at.desc&limit=1",
                         headers=self._h(), timeout=60)
        r.raise_for_status()
        rows = r.json()
        return rows[0] if rows else None

    def upload_human_audio(self, vid, mp3):
        path = f"human/{vid}.narration.mp3"
        with open(mp3, "rb") as f:
            r = requests.post(f"{self.url}/storage/v1/object/narration/{path}", data=f, timeout=600,
                              headers=self._h({"Content-Type": "audio/mpeg", "x-upsert": "true"}))
        r.raise_for_status()
        return path

    def download(self, path, dest):
        r = requests.get(f"{self.url}/storage/v1/object/narration/{path}", headers=self._h(), timeout=600, stream=True)
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(4 << 20):
                f.write(chunk)
        return dest

    def dirty(self):
        r = requests.get(f"{self.url}/rest/v1/videos?dirty=eq.true&select=*", headers=self._h(), timeout=60)
        r.raise_for_status()
        return r.json()

    def mark_synced(self, vid, edited_at, patch):
        """Clear the dirty flag only if nobody saved again while we were writing to Drive."""
        q = f"id=eq.{vid}" + (f"&edited_at=eq.{requests.utils.quote(edited_at)}" if edited_at else "")
        body = dict(patch, dirty=False, synced_at=time.strftime("%Y-%m-%dT%H:%M:%S%z"))
        r = requests.patch(f"{self.url}/rest/v1/videos?{q}", data=json.dumps(body), timeout=60,
                           headers=self._h({"Content-Type": "application/json", "Prefer": "return=minimal"}))
        r.raise_for_status()


def parse_srt(path):
    cues = []
    for block in open(path, encoding="utf-8").read().strip().split("\n\n"):
        lines = block.strip().splitlines()
        if len(lines) < 2 or "-->" not in lines[1]:
            continue
        a, b = [x.strip() for x in lines[1].split("-->")]
        cues.append({"start": srt_seconds(a), "end": srt_seconds(b), "text": "\n".join(lines[2:])})
    return cues


def parse_srt_text(text):
    tmp = os.path.join(pipeline.ROOT, "work", f"_srt_{os.getpid()}_{time.time_ns()}.srt")
    os.makedirs(os.path.dirname(tmp), exist_ok=True)
    open(tmp, "w", encoding="utf-8").write(text.replace("\r\n", "\n").lstrip("﻿"))
    try:
        return parse_srt(tmp)
    finally:
        os.remove(tmp)


def merge_meta(vid, ai_meta, human_meta, order):
    """The human JSON wins field by field; fields it lacks keep the AI value. video_id always follows the file name."""
    human_meta = human_meta or {}
    out = {k: (human_meta[k] if k in human_meta else ai_meta.get(k)) for k in order}
    if "video_id" in out:
        out["video_id"] = vid
    return out


def srt_seconds(t):
    h, m, s = re.split(r":", t.replace(",", "."))
    return round(int(h) * 3600 + int(m) * 60 + float(s), 3)


def row_from_outputs(out_dir, vid, qc, audio_path, files=None, human=None, human_audio_path=None):
    """The dashboard row. `ai` keeps the pipeline's own version; `human` the uploaded one; cues/meta are the reviewer's
    working version, which starts from the human subtitles when a person uploaded them, else from the AI."""
    meta = json.load(open(os.path.join(out_dir, f"{vid}.json"), encoding="utf-8"))
    cues = parse_srt(os.path.join(out_dir, f"{vid}.en.srt"))
    labels = [l.get("label") for l in qc.get("line_labels") or []]
    for i, c in enumerate(cues):
        c["label"] = labels[i] if i < len(labels) else None
    w, h = (int(x) for x in qc["checks"]["resolution_1080p"]["value"].split("x"))
    order = list(meta.keys())
    qc = dict(qc, field_order=order)  # jsonb does not keep key order; the dashboard needs it for downloads
    ai = {"cues": cues, "meta": meta}
    if human:
        human = {"cues": human.get("cues") or [], "meta": human.get("meta") or {}}
    base = "human" if human and human["cues"] else "ai"
    work_cues = [dict(c, label=None) for c in human["cues"]] if base == "human" else cues
    work_meta = merge_meta(vid, meta, human["meta"], order) if human and (human["meta"] or base == "human") else meta
    return {
        "id": vid, "source_file": qc.get("source_file"), "status": "ready",
        "width": w, "height": h, "duration_s": qc["checks"]["length_2_to_10_min"]["value_s"],
        "category": qc.get("category_guess"), "meta": work_meta, "qc": qc, "cues": work_cues,
        "ai": ai, "human": human, "base": base,
        "audio_path": audio_path, "human_audio_path": human_audio_path,
        "audio_source": "human" if human_audio_path else "ai",
        "files": files or {}, "reviewed": False, "dirty": False, "edited_at": None,
    }


def apply_edits(row, out_dir, fields=None):
    """Rebuild <id>.en.srt, <id>.json and <id>.qc.json from an edited row. Returns (meta, qc)."""
    vid = row["id"]
    os.makedirs(out_dir, exist_ok=True)
    cues = []
    for c in sorted(row["cues"], key=lambda c: float(c.get("start") or 0)):
        text = (c.get("text") or "").strip()
        if not text:
            continue
        s, e = float(c["start"]), float(c["end"])
        cues.append({"start": s, "end": max(e, s + 0.2), "text": text, "label": c.get("label")})
    for a, b in zip(cues, cues[1:]):
        a["end"] = min(a["end"], b["start"])
    pipeline.write_srt(cues, os.path.join(out_dir, f"{vid}.en.srt"))
    duration = float(row.get("duration_s") or 0)
    words = sum(len(c["text"].split()) for c in cues)
    wpm = round(words / (duration / 60.0), 1) if duration else 0.0
    meta = dict(row["meta"] or {})
    order = fields or pipeline.DEFAULT_FIELDS  # jsonb does not keep key order; restore the reference order
    meta = {k: meta.get(k) for k in order} if set(order) >= set(meta) else meta
    if "narration_wpm" in meta:
        meta["narration_wpm"] = wpm
    json.dump(meta, open(os.path.join(out_dir, f"{vid}.json"), "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    qc = dict(row["qc"] or {})
    qc["field_order"] = list(meta.keys())
    checks = qc.setdefault("checks", {})
    checks["narration_wpm_at_least_25"] = {"ok": wpm >= 25, "value": wpm}
    labels = [c["label"] for c in cues]
    if cues and all(labels):
        good = sum(len(c["text"].split()) for c in cues if c["label"] in ("environment", "task"))
        pct = round(100.0 * good / max(1, words), 1)
        checks["descriptive_at_least_90pct"] = {"ok": pct >= 90, "value_pct": pct, "note": "after human review"}
    checks["subtitles_reviewed_by_person"] = {"ok": bool(row.get("reviewed"))}
    qc["line_labels"] = [{"t": pipeline.ts(c["start"]), "text": c["text"].replace("\n", " "), "label": c["label"]} for c in cues]
    qc["words"] = words
    qc["all_automatic_checks_ok"] = all(c["ok"] for c in checks.values() if c.get("ok") is not None)
    json.dump(qc, open(os.path.join(out_dir, f"{vid}.qc.json"), "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    return meta, qc
