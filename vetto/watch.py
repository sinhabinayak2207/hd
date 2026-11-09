"""Watch a Google Drive inbox folder and turn every uploaded video into the Vetto deliverable set.

Drive layout (created on first run, under config "drive_root", default gdrive:Vetto):
  inbox/    upload videos here (any of .mp4 .mov .mkv .avi .m4v .webm); optional <id>.script.json or <id>.script.txt
  output/   one folder per video: <id>.mp4, <id>.narration.mp3, <id>.en.srt, <id>.json, <id>.qc.json; plus report.csv
  done/     the original upload, moved here once its outputs are in output/
  failed/   uploads that could not be processed, with <id>.error.txt next to them

Usage: python -m vetto.watch [--once] [--interval 60] [--config config.json]
"""
import argparse
import csv
import json
import os
import re
import shutil
import subprocess
import sys
import time
import traceback

from vetto import pipeline, store

VIDEO_EXT = (".mp4", ".mov", ".mkv", ".avi", ".m4v", ".webm")
ROOT = pipeline.ROOT
WORK = os.path.join(ROOT, "work")


def log(msg):
    line = time.strftime("%Y-%m-%d %H:%M:%S ") + msg
    print(line, flush=True)
    with open(os.path.join(ROOT, "platform.log"), "a", encoding="utf-8") as f:
        f.write(line + "\n")


class Drive:
    def __init__(self, cfg):
        self.exe = cfg.get("rclone", "/mnt/c/Users/sinha/tools/rclone/rclone.exe")
        self.conf = cfg.get("rclone_config", r"C:/Users/sinha/AppData/Roaming/rclone/rclone.conf")
        self.root = cfg.get("drive_root", "gdrive:Vetto").rstrip("/")
        self.windows = self.exe.lower().endswith(".exe") and os.name != "nt"

    def local(self, path):
        """rclone.exe is a Windows program: hand it Windows paths when we run under WSL."""
        if self.windows:
            return subprocess.run(["wslpath", "-w", path], capture_output=True, text=True).stdout.strip()
        return path

    def rc(self, *args, check=True):
        r = subprocess.run([self.exe, "--config", self.conf, *args], capture_output=True, text=True, errors="replace")
        err = "\n".join(l for l in r.stderr.splitlines() if "shared Google Drive client_id" not in l)
        if check and r.returncode:
            raise RuntimeError(f"rclone {args[0]} failed: {err[-500:]}")
        return r.stdout

    def setup(self):
        for d in ("inbox", "output", "done", "failed"):
            self.rc("mkdir", f"{self.root}/{d}")

    def inbox(self):
        return json.loads(self.rc("lsjson", f"{self.root}/inbox", "--files-only") or "[]")

    def get(self, name, dest_dir):
        self.rc("copy", f"{self.root}/inbox/{name}", self.local(dest_dir))

    def put_dir(self, local_dir, remote_sub):
        self.rc("copy", self.local(local_dir), f"{self.root}/{remote_sub}")

    def put_file(self, local_file, remote_sub):
        self.rc("copyto", self.local(local_file), f"{self.root}/{remote_sub}")

    def move(self, name, to):
        self.rc("moveto", f"{self.root}/inbox/{name}", f"{self.root}/{to}/{name}")

    def cat(self, remote_sub):
        return self.rc("cat", f"{self.root}/{remote_sub}", check=False)


def safe_id(stem):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("_") or "video"


def read_script(path):
    """<id>.script.json ({script_title, script_text, ...}) or <id>.script.txt (first line title, rest text)."""
    if path.endswith(".json"):
        return json.load(open(path, encoding="utf-8"))
    lines = open(path, encoding="utf-8").read().strip().splitlines()
    return {"script_title": lines[0].strip() if lines else None, "script_text": " ".join(l.strip() for l in lines[1:]).strip() or None}


REPORT_COLS = ["video_id", "source_file", "category_guess", "resolution", "duration_s", "wpm", "descriptive_pct",
               "pause_over_10s", "spoken_pii", "script_from_contributor", "all_automatic_checks_ok", "processed_at"]


def report_row(qc):
    c = qc["checks"]
    return {
        "video_id": qc["video_id"], "source_file": qc["source_file"], "category_guess": qc.get("category_guess"),
        "resolution": c["resolution_1080p"]["value"], "duration_s": c["length_2_to_10_min"]["value_s"],
        "wpm": c["narration_wpm_at_least_25"]["value"], "descriptive_pct": c["descriptive_at_least_90pct"].get("value_pct"),
        "pause_over_10s": "no" if c["no_pause_over_10s"]["ok"] else "YES",
        "spoken_pii": {True: "no", False: "YES", None: "not checked"}[c["no_spoken_pii"]["ok"]],
        "script_from_contributor": "yes" if c["script_written_before_recording"]["ok"] else "no (AI draft)",
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


def handle(drive, cfg, fields, item, names, db):
    name = item["Name"]
    stem = os.path.splitext(name)[0]
    vid = safe_id(stem)
    job = os.path.join(WORK, vid)
    shutil.rmtree(job, ignore_errors=True)
    src_dir, out_dir = os.path.join(job, "src"), os.path.join(job, vid)
    os.makedirs(src_dir)
    log(f"new upload {name} ({item.get('Size', 0) / 1e6:.0f} MB) -> {vid}")
    script = None
    sidecars = [n for n in (stem + ".script.json", stem + ".script.txt") if n in names]
    try:
        drive.get(name, src_dir)
        for s in sidecars:
            drive.get(s, src_dir)
            script = read_script(os.path.join(src_dir, s))
        qc = pipeline.process(os.path.join(src_dir, name), out_dir, cfg, vid, script, fields, log=log)
        drive.put_dir(out_dir, f"output/{vid}")
        update_report(drive, qc)
        if db.enabled:
            audio = db.upload_audio(vid, os.path.join(out_dir, f"{vid}.narration.mp3"))
            db.upsert(store.row_from_outputs(out_dir, vid, qc, audio))
        for n in [name] + sidecars:
            drive.move(n, "done")
        bad = [k for k, v in qc["checks"].items() if v["ok"] is False]
        log(f"[{vid}] done; failed checks: {', '.join(bad) or 'none'}")
    except Exception as e:  # noqa: BLE001
        err = os.path.join(job, f"{vid}.error.txt")
        open(err, "w", encoding="utf-8").write(f"{type(e).__name__}: {e}\n\n{traceback.format_exc()}")
        log(f"[{vid}] FAILED: {type(e).__name__}: {e}")
        try:
            if db.enabled:
                db.upsert({"id": vid, "source_file": name, "status": "failed", "qc": {"error": f"{type(e).__name__}: {e}"[:500]}})
        except Exception as e3:  # noqa: BLE001
            log(f"[{vid}] could not record failure in dashboard: {e3}")
        try:
            drive.put_file(err, f"failed/{vid}.error.txt")
            for n in [name] + sidecars:
                drive.move(n, "failed")
        except Exception as e2:  # noqa: BLE001
            log(f"[{vid}] could not move to failed/: {e2}")
    finally:
        if not cfg.get("keep_work_files"):
            shutil.rmtree(job, ignore_errors=True)


def sync_edits(drive, db, fields=None):
    """Write subtitle and metadata edits made in the dashboard back to the Drive deliverables."""
    for row in db.dirty():
        vid = row["id"]
        out_dir = os.path.join(WORK, "_edits", vid)
        try:
            meta, qc = store.apply_edits(row, out_dir, fields)
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
    items = drive.inbox()
    names = {i["Name"] for i in items}
    for item in sorted(items, key=lambda i: i.get("ModTime", "")):
        if item["Name"].lower().endswith(VIDEO_EXT):
            handle(drive, cfg, fields, item, names, db)


def main(argv):
    p = argparse.ArgumentParser()
    p.add_argument("--config", default=os.path.join(ROOT, "config.json"))
    p.add_argument("--once", action="store_true")
    p.add_argument("--interval", type=int, default=60)
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
