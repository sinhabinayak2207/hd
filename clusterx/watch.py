"""Worker: turns every new video into the deliverable set and keeps the review dashboard in sync.

Videos arrive three ways:
  1. dropped into the Drive inbox folder (any of .mp4 .mov .mkv .avi .m4v .webm; optional <id>.script.txt / .json)
  2. uploaded from the dashboard: the worker opens a Drive resumable-upload session and the browser sends the file
     straight to Drive (inbox), so big files never pass through Vercel or Supabase
  3. a Google Drive link pasted in the dashboard ("Anyone with the link"): the worker downloads and processes it

Drive layout (under config "drive_root", default "gdrive:ClusterX AI"):
  inbox/    new videos
  output/   one folder per video: <id>.mp4, <id>.narration.mp3, <id>.en.srt, <id>.json, <id>.qc.json; plus report.csv
  originals/<id>/  ai.en.srt, ai.json, ai.narration.mp3 (pipeline) and human.* (uploaded by a person), never edited
  done/     originals from the inbox, after processing
  failed/   inbox files that could not be processed, with <id>.error.txt

Usage: python -m clusterx.watch [--once] [--interval 60] [--config config.json]
"""
import argparse
import configparser
import csv
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import traceback

import requests

from clusterx import pipeline, store

VIDEO_EXT = (".mp4", ".mov", ".mkv", ".avi", ".m4v", ".webm")
ROOT = pipeline.ROOT
WORK = os.path.join(ROOT, "work")
_log_lock = threading.Lock()


def log(msg):
    line = time.strftime("%Y-%m-%d %H:%M:%S ") + msg
    with _log_lock:
        print(line, flush=True)
        with open(os.path.join(ROOT, "platform.log"), "a", encoding="utf-8") as f:
            f.write(line + "\n")


class Drive:
    def __init__(self, cfg):
        self.exe = cfg.get("rclone", "/mnt/c/Users/sinha/tools/rclone/rclone.exe")
        self.conf = cfg.get("rclone_config", "C:/Users/sinha/AppData/Roaming/rclone/rclone.conf")
        self.root = cfg.get("drive_root", "gdrive:ClusterX AI").rstrip("/")
        self.windows = self.exe.lower().endswith(".exe") and os.name != "nt"
        self._ids = {}

    def local(self, path):
        """rclone.exe is a Windows program: hand it Windows paths when we run under WSL."""
        if self.windows:
            return subprocess.run(["wslpath", "-w", path], capture_output=True, text=True).stdout.strip()
        return path

    def rc(self, *args, check=True, stdin=None):
        r = subprocess.run([self.exe, "--config", self.conf, *args], capture_output=True, text=True, errors="replace",
                           input=stdin)
        err = "\n".join(l for l in r.stderr.splitlines() if "shared Google Drive client_id" not in l)
        if check and r.returncode:
            raise RuntimeError(f"rclone {args[0]} failed: {err[-500:]}")
        return r.stdout

    def setup(self):
        for d in ("inbox", "output", "originals", "done", "failed"):
            self.rc("mkdir", f"{self.root}/{d}")

    def folder_id(self, sub):
        if sub not in self._ids:
            for d in json.loads(self.rc("lsjson", self.root, "--dirs-only") or "[]"):
                self._ids[d["Name"]] = d["ID"]
        return self._ids[sub]

    def access_token(self):
        """rclone keeps the OAuth token in its config; a cheap call refreshes it first if it is about to expire."""
        self.rc("lsf", f"{self.root}/inbox", "--max-depth", "1", check=False)
        path = self.conf
        if self.windows:
            path = subprocess.run(["wslpath", "-u", self.conf], capture_output=True, text=True).stdout.strip()
        c = configparser.ConfigParser()
        c.read(path)
        remote = self.root.split(":")[0]
        return json.loads(c[remote]["token"])["access_token"]

    def upload_session(self, name, size, mime, origin):
        """A Drive resumable-upload URL in inbox/ that the browser at `origin` can PUT the file to directly."""
        r = requests.post(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", timeout=60,
            data=json.dumps({"name": name, "parents": [self.folder_id("inbox")]}),
            headers={"Authorization": "Bearer " + self.access_token(), "Content-Type": "application/json; charset=UTF-8",
                     "X-Upload-Content-Type": mime or "application/octet-stream",
                     "X-Upload-Content-Length": str(size), "Origin": origin})
        r.raise_for_status()
        return r.headers["Location"]

    def inbox(self):
        return json.loads(self.rc("lsjson", f"{self.root}/inbox", "--files-only") or "[]")

    def get(self, name, dest_dir):
        self.rc("copy", f"{self.root}/inbox/{name}", self.local(dest_dir))

    def write_text(self, remote_sub, text):
        self.rc("rcat", f"{self.root}/{remote_sub}", stdin=text)

    def put_dir(self, local_dir, remote_sub, exclude=()):
        self.rc("copy", self.local(local_dir), f"{self.root}/{remote_sub}", *[a for x in exclude for a in ("--exclude", x)])

    def put_file(self, local_file, remote_sub):
        self.rc("copyto", self.local(local_file), f"{self.root}/{remote_sub}")

    def copy_remote(self, src_sub, dst_sub):
        self.rc("copyto", f"{self.root}/{src_sub}", f"{self.root}/{dst_sub}")

    def move(self, name, to):
        self.rc("moveto", f"{self.root}/inbox/{name}", f"{self.root}/{to}/{name}")

    def file_ids(self, remote_sub):
        """{file name: Drive file id} for a Drive folder, used for download links in the dashboard."""
        return {f["Name"]: f["ID"] for f in json.loads(self.rc("lsjson", f"{self.root}/{remote_sub}", "--files-only") or "[]")}

    def cat(self, remote_sub):
        return self.rc("cat", f"{self.root}/{remote_sub}", check=False)


def safe_id(stem):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("_")[:80] or "video"


def read_script(path):
    """<id>.script.json ({script_title, script_text, ...}) or <id>.script.txt (first line title, rest text)."""
    if path.endswith(".json"):
        return json.load(open(path, encoding="utf-8"))
    lines = open(path, encoding="utf-8").read().strip().splitlines()
    return {"script_title": lines[0].strip() if lines else None, "script_text": " ".join(l.strip() for l in lines[1:]).strip() or None}


REPORT_COLS = ["video_id", "source_file", "category_guess", "resolution", "duration_s", "wpm", "descriptive_pct",
               "pause_over_10s", "spoken_pii", "script_from_contributor", "subtitles_reviewed", "all_automatic_checks_ok",
               "processed_at"]


def report_row(qc):
    c = qc["checks"]
    pii = c.get("no_spoken_pii", {}).get("ok")
    return {
        "video_id": qc["video_id"], "source_file": qc.get("source_file"), "category_guess": qc.get("category_guess"),
        "resolution": c["resolution_1080p"]["value"], "duration_s": c["length_2_to_10_min"]["value_s"],
        "wpm": c["narration_wpm_at_least_25"]["value"], "descriptive_pct": c["descriptive_at_least_90pct"].get("value_pct"),
        "pause_over_10s": "no" if c["no_pause_over_10s"]["ok"] else "YES",
        "spoken_pii": {True: "no", False: "YES", None: "not checked"}[pii],
        "script_from_contributor": "yes" if c["script_written_before_recording"]["ok"] else "no (AI draft)",
        "subtitles_reviewed": "yes" if c.get("subtitles_reviewed_by_person", {}).get("ok") else "no",
        "all_automatic_checks_ok": "yes" if qc["all_automatic_checks_ok"] else "NO",
        "processed_at": time.strftime("%Y-%m-%d %H:%M"),
    }


def update_report(drive, qc):
    path = os.path.join(WORK, "report.csv")
    rows = []
    existing = drive.cat("output/report.csv")
    if existing.strip():
        rows = [r for r in csv.DictReader(existing.splitlines()) if r.get("video_id") != qc["video_id"]]
    rows.append(report_row(qc))
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=REPORT_COLS, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    drive.put_file(path, "output/report.csv")


def save_originals(drive, vid, out_dir, human, human_mp3):
    """Keep the pipeline's own files and any human-uploaded files untouched in originals/<id>/."""
    stage = os.path.join(WORK, vid, "originals")
    os.makedirs(stage, exist_ok=True)
    for src, dst in ((f"{vid}.en.srt", "ai.en.srt"), (f"{vid}.json", "ai.json"), (f"{vid}.narration.mp3", "ai.narration.mp3")):
        shutil.copyfile(os.path.join(out_dir, src), os.path.join(stage, dst))
    if human:
        if human.get("cues"):
            pipeline.write_srt(human["cues"], os.path.join(stage, "human.en.srt"))
        if human.get("meta"):
            json.dump(human["meta"], open(os.path.join(stage, "human.json"), "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    if human_mp3:
        shutil.copyfile(human_mp3, os.path.join(stage, "human.narration.mp3"))
    drive.put_dir(stage, f"originals/{vid}")


def gather_human(db, vid, sidecar_files, job=None):
    """Human-made files for this video: inbox sidecars (<id>.en.srt, <id>.json, <id>.narration.mp3) or the
    dashboard job's attachments. Returns (human {cues, meta} or None, local mp3 path or None, storage path or None)."""
    cues, meta, mp3, path = None, None, None, None
    for f in sidecar_files:
        if f.endswith(".en.srt"):
            cues = store.parse_srt(f)
        elif f.endswith(".narration.mp3"):
            mp3 = f
        elif f.endswith(".json") and not f.endswith(".script.json"):
            meta = json.load(open(f, encoding="utf-8-sig"))
    if job and job.get("human"):
        cues = cues or job["human"].get("cues")
        meta = meta or job["human"].get("meta")
    if job and job.get("human_audio_path") and not mp3 and db.enabled:
        os.makedirs(os.path.join(WORK, vid), exist_ok=True)
        mp3 = db.download(job["human_audio_path"], os.path.join(WORK, vid, "human.narration.mp3"))
        path = job["human_audio_path"]
    if mp3 and not path and db.enabled:
        path = db.upload_human_audio(vid, mp3)
    human = {"cues": cues or [], "meta": meta or {}} if (cues or meta) else None
    return human, mp3, path


def process_file(drive, cfg, fields, db, src, vid, script, source_name, human=None, human_mp3=None, human_audio_path=None):
    """Run the pipeline on a local file and publish the results to Drive and the dashboard. Raises on failure.
    output/<id>/ always holds the reviewer's version, which starts from the human files when a person uploaded them."""
    out_dir = os.path.join(WORK, vid, vid)
    if db.enabled:
        db.upsert({"id": vid, "source_file": source_name, "status": "processing"})
        db.set_jobs_for_video(vid, "processing")
    qc = pipeline.process(src, out_dir, cfg, vid, script, fields, log=log)
    qc["source_file"] = source_name
    save_originals(drive, vid, out_dir, human, human_mp3)
    audio = db.upload_audio(vid, os.path.join(out_dir, f"{vid}.narration.mp3")) if db.enabled else None
    row = store.row_from_outputs(out_dir, vid, qc, audio, None, human, human_audio_path)
    if row["base"] == "human" or (human and human.get("meta")):
        row["meta"], row["qc"] = store.apply_edits(row, out_dir, fields)
        qc = row["qc"]
    if row["audio_source"] == "human" and human_mp3:
        shutil.copyfile(human_mp3, os.path.join(out_dir, f"{vid}.narration.mp3"))
    row["qc"]["delivered_audio"] = row["audio_source"]
    json.dump(row["qc"], open(os.path.join(out_dir, f"{vid}.qc.json"), "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    # The person supplies the MP4 themselves, so by default the (often multi-GB) copy is not uploaded again.
    drive.put_dir(out_dir, f"output/{vid}", () if cfg.get("deliver_mp4") else ("*.mp4",))
    update_report(drive, qc)
    if db.enabled:
        row["files"] = drive.file_ids(f"output/{vid}")
        db.upsert(row)
        db.set_jobs_for_video(vid, "done")
    if human:
        used = [k for k in ("cues", "meta") if human.get(k)] + (["mp3"] if human_mp3 else [])
        log(f"[{vid}] human files used: {', '.join(used)}")
    bad = [k for k, v in qc["checks"].items() if v["ok"] is False]
    log(f"[{vid}] done; failed checks: {', '.join(bad) or 'none'}")


def record_failure(db, vid, source_name, e):
    msg = f"{type(e).__name__}: {e}"[:500]
    log(f"[{vid}] FAILED: {msg}")
    if db.enabled:
        try:
            db.upsert({"id": vid, "source_file": source_name, "status": "failed", "qc": {"error": msg}})
            db.set_jobs_for_video(vid, "failed", msg)
        except Exception as e3:  # noqa: BLE001
            log(f"[{vid}] could not record the failure in the dashboard: {e3}")


def handle_inbox_item(drive, cfg, fields, item, names, db):
    name = item["Name"]
    stem = os.path.splitext(name)[0]
    vid = safe_id(stem)
    job_dir = os.path.join(WORK, vid)
    shutil.rmtree(job_dir, ignore_errors=True)
    src_dir = os.path.join(job_dir, "src")
    os.makedirs(src_dir)
    log(f"inbox: {name} ({item.get('Size', 0) / 1e6:.0f} MB) -> {vid}")
    script = None
    sidecars = [n for n in (stem + ".script.json", stem + ".script.txt") if n in names]
    human_files = [n for n in (stem + ".en.srt", stem + ".json", stem + ".narration.mp3") if n in names]
    sidecars += human_files
    try:
        drive.get(name, src_dir)
        for s in sidecars:
            drive.get(s, src_dir)
            if s.endswith((".script.json", ".script.txt")):
                script = read_script(os.path.join(src_dir, s))
        job = db.job_for_video(vid) if db.enabled else None
        human, human_mp3, human_path = gather_human(db, vid, [os.path.join(src_dir, s) for s in human_files], job)
        process_file(drive, cfg, fields, db, os.path.join(src_dir, name), vid, script, name, human, human_mp3, human_path)
        for n in [name] + sidecars:
            drive.move(n, "done")
    except Exception as e:  # noqa: BLE001
        record_failure(db, vid, name, e)
        err = os.path.join(job_dir, f"{vid}.error.txt")
        open(err, "w", encoding="utf-8").write(f"{type(e).__name__}: {e}\n\n{traceback.format_exc()}")
        try:
            drive.put_file(err, f"failed/{vid}.error.txt")
            for n in [name] + sidecars:
                drive.move(n, "failed")
        except Exception as e2:  # noqa: BLE001
            log(f"[{vid}] could not move to failed/: {e2}")
    finally:
        if not cfg.get("keep_work_files"):
            shutil.rmtree(job_dir, ignore_errors=True)


def drive_file_id(url):
    for pat in (r"/d/([A-Za-z0-9_-]{20,})", r"[?&]id=([A-Za-z0-9_-]{20,})", r"^([A-Za-z0-9_-]{20,})$"):
        m = re.search(pat, url.strip())
        if m:
            return m.group(1)
    return None


def download_drive_link(url, dest_dir):
    """Download a Drive file shared as "Anyone with the link". Returns the local path."""
    fid = drive_file_id(url)
    if not fid:
        raise RuntimeError("that does not look like a Google Drive file link")
    r = requests.get("https://drive.usercontent.google.com/download", params={"id": fid, "export": "download", "confirm": "t"},
                     stream=True, timeout=120)
    r.raise_for_status()
    if "text/html" in r.headers.get("Content-Type", ""):
        raise RuntimeError("Drive did not return the file: set its sharing to 'Anyone with the link' and try again")
    cd = r.headers.get("Content-Disposition", "")
    m = re.search(r"filename\*?=(?:UTF-8'')?\"?([^\";]+)", cd)
    name = os.path.basename(requests.utils.unquote(m.group(1))) if m else f"{fid}.mp4"
    path = os.path.join(dest_dir, name)
    with open(path, "wb") as f:
        for chunk in r.iter_content(8 << 20):
            f.write(chunk)
    return path


def handle_link_job(drive, cfg, fields, db, job):
    vid = job["video_id"]
    work = os.path.join(WORK, vid)
    shutil.rmtree(work, ignore_errors=True)
    os.makedirs(work)
    log(f"drive link job -> {vid}")
    try:
        db.update_job(job["id"], status="downloading")
        src = download_drive_link(job["drive_url"], work)
        script = {"script_title": job.get("script_title"), "script_text": job.get("script_text")} \
            if job.get("script_title") or job.get("script_text") else None
        human, human_mp3, human_path = gather_human(db, vid, [], job)
        process_file(drive, cfg, fields, db, src, vid, script, os.path.basename(src), human, human_mp3, human_path)
    except Exception as e:  # noqa: BLE001
        record_failure(db, vid, job.get("drive_url"), e)
        db.update_job(job["id"], status="failed", error=f"{type(e).__name__}: {e}"[:500])
    finally:
        shutil.rmtree(work, ignore_errors=True)


def upload_desk(drive, db, stop):
    """Hand out Drive upload URLs for dashboard uploads, within seconds, even while a video is being processed."""
    while not stop.is_set():
        try:
            for job in db.jobs(status="requested", kind="upload"):
                vid = job["video_id"]
                try:
                    ext = os.path.splitext(job.get("filename") or "")[1].lower()
                    if ext not in VIDEO_EXT:
                        raise RuntimeError(f"unsupported file type '{ext or '?'}'; use one of {', '.join(VIDEO_EXT)}")
                    if job.get("script_title") or job.get("script_text"):
                        drive.write_text(f"inbox/{vid}.script.txt",
                                         f"{job.get('script_title') or ''}\n{job.get('script_text') or ''}\n")
                    url = drive.upload_session(vid + ext, job["size"], None, job["origin"])
                    db.update_job(job["id"], status="ready_for_upload", upload_url=url)
                    log(f"[{vid}] upload URL handed to the dashboard ({job['size'] / 1e6:.0f} MB)")
                except Exception as e:  # noqa: BLE001
                    db.update_job(job["id"], status="failed", error=f"{type(e).__name__}: {e}"[:500])
                    log(f"[{vid}] upload request failed: {e}")
            for job in db.jobs(status="uploaded", kind="upload"):
                db.update_job(job["id"], status="queued")
        except Exception as e:  # noqa: BLE001
            log(f"upload desk error: {e}")
        stop.wait(3)


def sync_edits(drive, db, fields=None):
    """Write subtitle and metadata edits made in the dashboard back to the Drive deliverables."""
    for row in db.dirty():
        vid = row["id"]
        out_dir = os.path.join(WORK, "_edits", vid)
        try:
            meta, qc = store.apply_edits(row, out_dir, fields)
            want = row.get("audio_source") or "ai"
            if want != qc.get("delivered_audio", "ai"):
                mp3 = f"output/{vid}/{vid}.narration.mp3"
                if want == "human" and row.get("human_audio_path"):
                    local = db.download(row["human_audio_path"], os.path.join(out_dir, "human.narration.mp3"))
                    drive.put_file(local, mp3)
                    drive.put_file(local, f"originals/{vid}/human.narration.mp3")
                elif want == "ai":
                    drive.copy_remote(f"originals/{vid}/ai.narration.mp3", mp3)
                qc["delivered_audio"] = want
                json.dump(qc, open(os.path.join(out_dir, f"{vid}.qc.json"), "w", encoding="utf-8"), indent=2, ensure_ascii=False)
                log(f"[{vid}] narration MP3 switched to the {want} version")
            for f in (f"{vid}.en.srt", f"{vid}.json", f"{vid}.qc.json"):
                drive.put_file(os.path.join(out_dir, f), f"output/{vid}/{f}")
            update_report(drive, qc)
            db.mark_synced(vid, row.get("edited_at"), {"meta": meta, "qc": qc})
            log(f"[{vid}] dashboard edits written to Drive (wpm {meta.get('narration_wpm')}, reviewed={row.get('reviewed')})")
        except Exception as e:  # noqa: BLE001
            log(f"[{vid}] could not write dashboard edits: {type(e).__name__}: {e}")
        finally:
            shutil.rmtree(out_dir, ignore_errors=True)


def tick(drive, cfg, fields, db):
    if db.enabled:
        sync_edits(drive, db, fields)
        for job in db.jobs(status="requested", kind="drive_link"):
            handle_link_job(drive, cfg, fields, db, job)
    items = drive.inbox()
    names = {i["Name"] for i in items}
    for item in sorted(items, key=lambda i: i.get("ModTime", "")):
        if item["Name"].lower().endswith(VIDEO_EXT):
            handle_inbox_item(drive, cfg, fields, item, names, db)


def main(argv):
    p = argparse.ArgumentParser()
    p.add_argument("--config", default=os.path.join(ROOT, "config.json"))
    p.add_argument("--once", action="store_true")
    p.add_argument("--interval", type=int, default=20)
    a = p.parse_args(argv)
    os.makedirs(WORK, exist_ok=True)
    cfg = pipeline.load_config(a.config)
    fields = None
    if cfg.get("metadata_template") and os.path.exists(os.path.join(ROOT, cfg["metadata_template"])):
        fields = list(json.load(open(os.path.join(ROOT, cfg["metadata_template"]), encoding="utf-8")).keys())
    drive = Drive(cfg)
    drive.setup()
    db = store.Store(cfg)
    log(f"dashboard sync: {'on' if db.enabled else 'off (no supabase in config.json)'}")
    log(f"watching {drive.root}/inbox (AI: {cfg['llm'].get('model') or 'not configured'})")
    stop = threading.Event()
    if db.enabled and not a.once:
        threading.Thread(target=upload_desk, args=(Drive(cfg), db, stop), daemon=True).start()
    while True:
        try:
            tick(drive, cfg, fields, db)
        except Exception as e:  # noqa: BLE001
            log(f"poll error: {e}")
        if a.once:
            break
        time.sleep(a.interval)


if __name__ == "__main__":
    main(sys.argv[1:])
