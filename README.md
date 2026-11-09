# ClusterX AI video platform

You add a first-person narrated video. The platform produces the deliverable set for it:
- `<id>.mp4`
- `<id>.narration.mp3`
- `<id>.en.srt`
- `<id>.json`

It also writes a QC report and opens everything in a review dashboard, where a person checks and edits the subtitles.

## Parts

| Part | Where it runs | What it does |
|---|---|---|
| Dashboard (`app/`, `components/`, `lib/`) | Vercel | Sign in, add videos, review and edit subtitles and metadata, download files |
| Worker (`clusterx/`) | Laptop (WSL) or any server | Pulls in new videos and runs ffmpeg, Whisper, the QC checks and the optional AI review, then writes results to Drive and Supabase |
| Supabase | Cloud | Logins, video rows (subtitles, metadata, QC), the upload job queue, the narration MP3s |
| Google Drive (`ClusterX AI/`) | Cloud | `inbox/` for new videos, `output/<id>/` with the deliverables, plus `report.csv`, `done/` and `failed/` |

## Adding a video (dashboard → "Add a video")

1. **From computer.** Pick a file. It goes from the browser straight into Drive `inbox/`, in 16 MB chunks with automatic retry, so large files are fine. Nothing goes through Vercel.
2. **Google Drive link.** Paste a link to a file shared as "Anyone with the link". The worker downloads it.
3. **Drive folder.** Drop the file into `ClusterX AI/inbox/` yourself. Optionally add `<id>.script.txt`: the first line is the script title, the rest is the script text.

The video ID becomes the file name of every deliverable. A script title and text written before recording can be entered with the upload. Without them, the AI drafts both from the narration and the QC marks them as an AI draft.

## Review (dashboard → open a video)

- An audio player plus the subtitle table. You can edit each line's text and its start and end time (or set them from the audio position), and you can insert, merge and delete lines.
- Metadata (`script_title`, `script_text`, `summary`, IDs), plus a "Subtitles reviewed by me" tick.
- Live checks while you edit: wpm, gaps over 10 s, line length and overlaps.
- **Save** (Ctrl+S). Within a minute, the worker rewrites `<id>.en.srt`, `<id>.json` (with the wpm recomputed from the edited subtitles), `<id>.qc.json` and `report.csv` in Drive.
- **⬇ Download files** downloads `<id>.narration.mp3`, `<id>.en.srt` and `<id>.json` to your computer, built from the latest saved edits. The video list has the same button on every row.

## Automatic checks

- Resolution: 1080 px or more on the short side.
- Length: 2 to 10 minutes.
- Narration: at least 25 wpm.
- Pauses: none longer than 10 s, measured both as gaps between words and as audio silence.
- Descriptive narration: at least 90% describes the environment or the task. The AI judges each subtitle line.
- Spoken PII.
- Category guess.
- Summary.
- A complete file set.

These need a person: reviewing every SRT, checking for PII on screen, a professional setting, one complete task, and no background TV, music or conversation.

## Configuration (`config.json`, git-ignored; copy from `config.example.json`)

- `drive_root`: the rclone remote and folder (default `gdrive:ClusterX AI`).
- `llm`: any OpenAI-compatible endpoint (`base_url`, `api_key`, `model`). The default is Command Code with `Qwen/Qwen3.7-Flash`, which needs its Provider plan. Without a working key, the AI checks are skipped and noted in the QC.
- `supabase`: `url` and `secret_key`. These are for the worker only and are never committed.
- `metadata_template`: `reference_sample.json`. The output JSON uses exactly these keys, in this order.
- `whisper_model`: `small.en` by default. `medium.en` gives better subtitles but is about 3 times slower.

The dashboard uses the Supabase publishable key, which is safe in the browser. Row-level security allows only emails listed in the `editors` table, and lets them change only subtitles, metadata, the review tick and their own upload jobs. To add an editor, create the user in Supabase → Authentication, then run `insert into editors(email) values ('their@email');`.

## Running the worker

- Windows: double-click `start_platform.bat`. In WSL: `bash start_platform.sh`.
- It hands out upload URLs within seconds and checks for new work every 20 s. The log is `platform.log`.
- To process one local file without Drive: `python -m clusterx.pipeline video.mp4 out_dir --id carp-0001 --script script.json`.

The rclone remote needs the full `drive` scope; with `drive.file`, files dropped into the inbox from another app are not seen. Run `rclone config reconnect gdrive:` once to grant it. rclone's shared Google client ID has a global rate limit; a client ID of your own avoids the occasional `403 quota` (see rclone's docs on making your own client ID).
