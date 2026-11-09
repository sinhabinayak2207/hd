"""One recording in, the Vetto deliverable set out: <id>.mp4, <id>.narration.mp3, <id>.en.srt, <id>.json, plus <id>.qc.json.

Usage: python -m vetto.pipeline <video> <out_dir> [--config config.json] [--id ID] [--script script.json]
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys

import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DEFAULT_FIELDS = ["video_id", "script_id", "contributor_id", "script_title", "script_text",
                  "narration_wpm", "narration_language", "summary", "source"]


def load_config(path):
    cfg = json.load(open(path, encoding="utf-8")) if path and os.path.exists(path) else {}
    cfg.setdefault("whisper_model", "small.en")
    cfg.setdefault("contributor_id", "contrib-001")
    cfg.setdefault("script_id_prefix", "script-")
    cfg.setdefault("llm", {})
    return cfg


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, errors="replace")


def probe(video):
    """Width, height, duration (s), codec and audio presence, read from ffmpeg's stream banner."""
    err = run([FFMPEG, "-hide_banner", "-i", video]).stderr
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", err)
    dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else 0.0
    w = h = 0
    vcodec = None
    for line in err.splitlines():
        if "Video:" in line:
            vcodec = line.split("Video:")[1].strip().split()[0].rstrip(",")
            r = re.search(r"\b(\d{3,5})x(\d{3,5})\b", line)
            if r:
                w, h = int(r.group(1)), int(r.group(2))
            break
    rot = re.search(r"rotation of (-?\d+)", err) or re.search(r"rotate\s*:\s*(-?\d+)", err)
    if rot and abs(int(rot.group(1))) in (90, 270):
        w, h = h, w
    return {"width": w, "height": h, "duration_s": round(dur, 3), "video_codec": vcodec, "has_audio": "Audio:" in err}


def make_mp4(video, mp4, info):
    """Copy an H.264/HEVC .mp4 as is; anything else is re-encoded to H.264 + AAC at its own resolution."""
    if os.path.abspath(video) == os.path.abspath(mp4):
        return "kept"
    if video.lower().endswith(".mp4") and info["video_codec"] in ("h264", "hevc"):
        shutil.copyfile(video, mp4)
        return "copied"
    r = run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", video, "-c:v", "libx264", "-preset", "medium",
             "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", mp4])
    if r.returncode:
        raise RuntimeError("mp4 conversion failed: " + r.stderr[-400:])
    return "re-encoded"


def extract_mp3(video, mp3):
    r = run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", video, "-vn", "-ac", "1", "-ar", "44100",
             "-codec:a", "libmp3lame", "-b:a", "128k", mp3])
    if r.returncode:
        raise RuntimeError("audio extraction failed: " + r.stderr[-400:])


def audio_silences(mp3, min_len=10.0, noise_db=-35):
    """Stretches of near-silent audio at least min_len seconds long (ffmpeg silencedetect)."""
    err = run([FFMPEG, "-hide_banner", "-i", mp3, "-af", f"silencedetect=noise={noise_db}dB:d={min_len}", "-f", "null", "-"]).stderr
    out, start = [], None
    for line in err.splitlines():
        a = re.search(r"silence_start: (-?\d+\.?\d*)", line)
        b = re.search(r"silence_end: (\d+\.?\d*)", line)
        if a:
            start = max(0.0, float(a.group(1)))
        if b and start is not None:
            out.append([round(start, 2), round(float(b.group(1)), 2)])
            start = None
    return out


def speech_gaps(words, duration, min_len=10.0):
    """Stretches with no spoken word at least min_len long, including before the first and after the last word.
    This catches pauses filled by machine or room noise, which silencedetect does not see."""
    marks = [0.0] + [x for w in words for x in (w["start"], w["end"])] + [duration]
    gaps = []
    for i in range(0, len(marks) - 1, 2):
        a, b = marks[i], marks[i + 1]
        if b - a >= min_len:
            gaps.append([round(a, 2), round(b, 2)])
    return gaps


def transcribe(mp3, model_name):
    from faster_whisper import WhisperModel
    model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=os.cpu_count() or 4)
    import numpy as np
    raw = subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-i", mp3, "-ac", "1", "-ar", "16000",
                          "-f", "f32le", "-"], capture_output=True).stdout
    audio = np.frombuffer(raw, dtype=np.float32)
    segs, info = model.transcribe(audio, language="en", word_timestamps=True, vad_filter=True, beam_size=5)
    words = []
    for s in segs:
        for w in s.words or []:
            words.append({"start": round(w.start, 3), "end": round(w.end, 3), "word": w.word})
    return words


def cues_from_words(words, max_chars=42, max_lines=2, max_dur=6.0, max_gap=1.5):
    """Group timed words into subtitle cues: at most 2 lines of 42 characters and 6 s, split at pauses and sentence ends."""
    cues, cur = [], []

    def text_of(ws):
        return "".join(w["word"] for w in ws).strip()

    for w in words:
        if cur:
            gap = w["start"] - cur[-1]["end"]
            too_long = len(text_of(cur + [w])) > max_chars * max_lines or (w["end"] - cur[0]["start"]) > max_dur
            ends_sentence = cur[-1]["word"].strip()[-1:] in ".?!"
            if gap > max_gap or too_long or (ends_sentence and len(text_of(cur)) > max_chars * 0.6):
                cues.append(cur)
                cur = []
        cur.append(w)
    if cur:
        cues.append(cur)
    out = [{"start": ws[0]["start"], "end": max(ws[-1]["end"], ws[0]["start"] + 0.8), "text": wrap(text_of(ws), max_chars)}
           for ws in cues]
    for a, b in zip(out, out[1:]):
        if a["end"] > b["start"]:
            a["end"] = b["start"]
    return out


def wrap(text, width):
    if len(text) <= width:
        return text
    words, best = text.split(), None
    for i in range(1, len(words)):
        a, b = " ".join(words[:i]), " ".join(words[i:])
        score = max(len(a), len(b))
        if best is None or score < best[0]:
            best = (score, a + "\n" + b)
    return best[1] if best else text


def ts(t):
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def write_srt(cues, path):
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        for i, c in enumerate(cues, 1):
            f.write(f"{i}\n{ts(c['start'])} --> {ts(c['end'])}\n{c['text']}\n\n")


def srt_words(path):
    """Word count of an SRT's text lines (used for narration_wpm, as the brief allows)."""
    n = 0
    for block in open(path, encoding="utf-8").read().strip().split("\n\n"):
        lines = block.splitlines()
        n += sum(len(l.split()) for l in lines[2:])
    return n


def build_metadata(vid, wpm, review, script, cfg, fields):
    script = script or {}
    review = review or {}
    meta = {
        "video_id": vid,
        "script_id": script.get("script_id") or cfg["script_id_prefix"] + vid,
        "contributor_id": script.get("contributor_id") or cfg["contributor_id"],
        "script_title": script.get("script_title") or review.get("script_title"),
        "script_text": script.get("script_text") or review.get("script_text"),
        "narration_wpm": wpm,
        "narration_language": "en",
        "summary": review.get("summary") or None,
        "source": script.get("source"),
    }
    return {k: meta.get(k) for k in fields}


def process(video, out_dir, cfg, vid=None, script=None, fields=None, log=print):
    vid = vid or os.path.splitext(os.path.basename(video))[0]
    fields = fields or DEFAULT_FIELDS
    os.makedirs(out_dir, exist_ok=True)
    mp4 = os.path.join(out_dir, f"{vid}.mp4")
    mp3 = os.path.join(out_dir, f"{vid}.narration.mp3")
    srt = os.path.join(out_dir, f"{vid}.en.srt")
    js = os.path.join(out_dir, f"{vid}.json")
    info = probe(video)
    if not info["width"]:
        raise RuntimeError("no video stream found")
    if not info["has_audio"]:
        raise RuntimeError("the video has no audio track, so there is no narration to extract")
    log(f"[{vid}] {info['width']}x{info['height']} {info['duration_s']}s; making mp4")
    mp4_mode = make_mp4(video, mp4, info)
    extract_mp3(video, mp3)
    log(f"[{vid}] transcribing with {cfg['whisper_model']}")
    words = transcribe(mp3, cfg["whisper_model"])
    cues = cues_from_words(words)
    write_srt(cues, srt)
    minutes = info["duration_s"] / 60.0
    wpm = round(srt_words(srt) / minutes, 1) if minutes else 0.0
    review, review_error = None, None
    if cfg["llm"].get("api_key") and cues:
        log(f"[{vid}] AI review ({cfg['llm'].get('model')})")
        try:
            from vetto import llm
            review = llm.review([c["text"].replace("\n", " ") for c in cues], cfg["llm"])
        except Exception as e:  # noqa: BLE001
            review_error = f"{type(e).__name__}: {e}"[:300]
    elif not cfg["llm"].get("api_key"):
        review_error = "no AI key in config.json, not checked"
    meta = build_metadata(vid, wpm, review, script, cfg, fields)
    json.dump(meta, open(js, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    gaps = speech_gaps(words, info["duration_s"])
    quiet = audio_silences(mp3)
    short = min(info["width"], info["height"])
    checks = {
        "resolution_1080p": {"ok": short >= 1080, "value": f"{info['width']}x{info['height']}"},
        "length_2_to_10_min": {"ok": 120 <= info["duration_s"] <= 600, "value_s": info["duration_s"],
                               "note": "suggested length, no hard cap"},
        "narration_wpm_at_least_25": {"ok": wpm >= 25, "value": wpm},
        "no_pause_over_10s": {"ok": not gaps and not quiet, "speech_gaps_s": gaps, "audio_silences_s": quiet},
        "descriptive_at_least_90pct": ({"ok": review["descriptive_pct"] >= 90, "value_pct": review["descriptive_pct"]}
                                       if review else {"ok": None, "note": review_error}),
        "no_spoken_pii": ({"ok": not review["pii_mentions"], "found": review["pii_mentions"]}
                          if review else {"ok": None, "note": review_error}),
        "script_written_before_recording": {"ok": bool(script and script.get("script_title") and script.get("script_text")),
                                            "note": "from the contributor's script file" if script else
                                            "no script file uploaded; title/text drafted by AI from the narration, edit them"},
        "file_set_complete": {"ok": all(os.path.exists(p) for p in (mp4, mp3, srt, js))},
    }
    qc = {
        "video_id": vid,
        "source_file": os.path.basename(video),
        "mp4": mp4_mode,
        "category_guess": (review or {}).get("category"),
        "words": len(words),
        "checks": checks,
        "all_automatic_checks_ok": all(c["ok"] for c in checks.values() if c["ok"] is not None),
        "needs_human_review": [
            "Read every SRT line against the audio and fix text and timing (the brief requires a person to review each file).",
            "Watch for PII on screen: third-party faces, name tags, documents, screens with personal data, license plates.",
            "Professional context, one complete task, varied steps, hands in frame, no TV/music/conversations in background.",
        ],
        "line_labels": [{"t": ts(c["start"]), "text": c["text"].replace("\n", " "), "label": lab}
                        for c, lab in zip(cues, (review or {}).get("labels") or [None] * len(cues))],
    }
    json.dump(qc, open(os.path.join(out_dir, f"{vid}.qc.json"), "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    return qc


def main(argv):
    p = argparse.ArgumentParser()
    p.add_argument("video")
    p.add_argument("out_dir")
    p.add_argument("--config", default=os.path.join(ROOT, "config.json"))
    p.add_argument("--id")
    p.add_argument("--script", help="JSON with script_title / script_text written before recording")
    a = p.parse_args(argv)
    cfg = load_config(a.config)
    script = json.load(open(a.script, encoding="utf-8")) if a.script else None
    fields = None
    tpl = os.path.join(ROOT, cfg.get("metadata_template") or "")
    if cfg.get("metadata_template") and os.path.exists(tpl):
        fields = list(json.load(open(tpl, encoding="utf-8")).keys())
    qc = process(a.video, a.out_dir, cfg, a.id, script, fields)
    print(json.dumps({k: v["ok"] for k, v in qc["checks"].items()}, indent=1))


if __name__ == "__main__":
    main(sys.argv[1:])
