# Vetto video platform

Upload a recording to Google Drive. A few minutes later, its Vetto deliverable set appears next to it, along with a QC report.

## Drive folders (`My Drive/Vetto`)

| Folder | What goes there |
|---|---|
| `inbox/` | **You upload here.** Supported: `.mp4 .mov .mkv .avi .m4v .webm`. The file name becomes the `<id>`, for example `carp-0001.mp4`. |
| `inbox/<id>.script.txt` | Optional, but the brief wants it. Line 1 is the `script_title`. The following lines are the `script_text` written before recording. (Or use `<id>.script.json` with the same keys.) |
| `output/<id>/` | `<id>.mp4`, `<id>.narration.mp3`, `<id>.en.srt`, `<id>.json`, `<id>.qc.json` |
| `output/report.csv` | One row per video with every check, so you can see all 14 at a glance. |
| `done/` | The original upload, moved here after processing. |
| `failed/` | Uploads that could not be processed, plus `<id>.error.txt` explaining why. |

## What is automatic and what is not

Automatic (in `<id>.qc.json` and `report.csv`):
- Resolution: 1080 px or more on the short side.
- Length: 2 to 10 minutes.
- Narration wpm: at least 25, counted from the SRT.
- Pauses: no pause longer than 10 s. Measured two ways: gaps between spoken words, and audio silence.
- Descriptive narration: at least 90%. The AI labels each subtitle line as environment, task or other.
- Spoken PII: names, numbers or addresses said aloud.
- A guess at which of the 7 categories the video belongs to.
- A 1–2 sentence summary for the JSON.
- A complete file set with matching names.

Still needs a person, because the brief says so or a machine cannot judge it:
- **Review every SRT** for text and timing.
- PII on screen: third-party faces, name tags, documents, license plates.
- Professional context, one complete task, varied steps.
- No TV, music or conversation in the background.

## JSON fields

The field list comes from `reference_sample.json`. When you get Vetto's reference sample, replace this file with it; the output uses exactly its keys, in its order, and adds nothing.

If no script file is uploaded, the AI drafts `script_title` and `script_text` from the narration. The QC marks these as "AI draft", so edit them.

## AI (`config.json` → `llm`)

Any OpenAI-compatible endpoint works. Setup: `cp config.example.json config.json`, then fill in `api_key`. `config.json` is git-ignored, so keys never reach the repo.
The default is Command Code (`https://api.commandcode.ai/provider/v1`, model `Qwen/Qwen3.7-Flash`). Its API needs the Provider plan or higher; on the Go plan every call returns `upgrade_required`.
Without a working key, everything else still runs. Only the descriptive-%, PII, category and summary checks are skipped, and the QC file says why.

## Review dashboard (Vercel + Supabase)

The Next.js app at the repo root (`app/`, `components/`, `lib/`) is the review dashboard. Vercel builds it on every push.

- Sign in with an editor account. Only emails listed in the `editors` table can read or edit, enforced by row-level security.
- **Videos**: every processed upload, with its checks (length, 1080p, wpm, descriptive %, pauses), review state and Drive sync state.
- **Video page**:
  - narration audio player
  - subtitle editor: edit text, start and end times (or set them from the audio position), the AI label, insert, merge or delete lines
  - metadata editor (`script_title`, `script_text`, `summary`, IDs)
  - a "Subtitles reviewed by me" tick
  - live wpm, descriptive % and pause warnings
- **Save** (Ctrl+S) stores the edit in Supabase and marks it dirty. Within about a minute, the worker rewrites `<id>.en.srt`, `<id>.json` (wpm recomputed from the edited subtitles), `<id>.qc.json` and `report.csv` in Drive, then marks the video "synced".

How the data moves:

```
Drive inbox → worker (laptop: ffmpeg + whisper + AI) → Drive output/<id>/ + Supabase row + preview audio
dashboard edit → Supabase (dirty) → worker → Drive output/<id>/ (srt, json, qc.json)
```

Supabase setup (already done for the `vetto` project): tables `videos` and `editors`, the private storage bucket `narration` and the RLS policies. The worker uses the secret key from `config.json` → `supabase.secret_key` (local only, never committed). The dashboard uses the publishable key, which is safe in the browser. Override it with `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` if needed.

Add another editor: create the user in Supabase → Authentication, then `insert into editors(email) values ('their@email');`.

## Running

- Windows: double-click `start_platform.bat`. Or run `wsl -d Ubuntu-24.04 -- bash /mnt/c/Users/sinha/Downloads/vetto_platform/start_platform.sh`.
- It checks the inbox every 60 s. The log is in `platform.log`.
- Process one local file without Drive: `~/vetto-env/bin/python -m vetto.pipeline video.mp4 out_dir --id carp-0001 --script carp-0001.script.json`

Speed on this machine: about 2 minutes of processing for a 1.5-minute video, using whisper `small.en` on the CPU. Set `"whisper_model": "medium.en"` for better subtitles, at roughly 3 times slower.
