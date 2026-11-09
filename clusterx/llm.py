"""AI review through any OpenAI-compatible endpoint (base_url, api_key, model come from config.json)."""
import json
import re
import time

CATEGORIES = [
    "Repairs & DIY", "Textile & Craft Arts", "Professional Trades & Industrial", "Hobbies & Arts",
    "Technology & Computing", "Personal Care", "Specialized & Professional",
]

LABEL_PROMPT = """You review the narration of a first-person video of someone doing a hands-on task.
Label every numbered line as exactly one of:
- "environment": describes the observed scene (objects, materials, tools, setting)
- "task": describes the step being done or the process
- "other": anything else (greetings, jokes, off-topic talk, filler, talking to someone)
Answer with JSON only, one label per line, in order: {"labels": ["task", "environment", ...]}

Lines:
"""

SUMMARY_PROMPT = """Below is the full narration of a first-person video of someone doing a hands-on task.
Return JSON only, with these keys:
"summary": one or two sentences describing what is shown and done,
"category": exactly one of %s,
"script_title": a short task title (like "Hemming a pair of trousers"),
"script_text": two or three sentences describing the starting state and the steps to the result,
"pii_mentions": a list of any personal names, phone numbers, addresses, emails or similar spoken aloud (empty list if none).

Narration:
""" % json.dumps(CATEGORIES)


def _client(cfg):
    from openai import OpenAI
    return OpenAI(base_url=cfg.get("base_url") or None, api_key=cfg["api_key"], timeout=cfg.get("timeout_s", 120))


def _ask(client, cfg, prompt):
    last = None
    for attempt in range(cfg.get("retries", 3)):
        try:
            r = client.chat.completions.create(
                model=cfg["model"],
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
            )
            text = r.choices[0].message.content or ""
            text = re.sub(r"<think>.*?</think>", "", text, flags=re.S)  # qwen reasoning models
            m = re.search(r"\{.*\}", text, re.S)
            return json.loads(m.group(0) if m else text)
        except Exception as e:  # noqa: BLE001
            last = e
            if getattr(e, "status_code", 500) in (400, 401, 403, 404):  # bad key, no plan access, wrong model: retrying won't help
                break
            time.sleep(5 * (attempt + 1))
    raise last


def review(lines, cfg):
    client = _client(cfg)
    chunk = cfg.get("lines_per_request", 60)
    labels = []
    for i in range(0, len(lines), chunk):
        part = lines[i:i + chunk]
        numbered = "\n".join(f"{j + 1}. {t}" for j, t in enumerate(part))
        got = [str(x).strip().lower() for x in _ask(client, cfg, LABEL_PROMPT + numbered).get("labels", [])][: len(part)]
        labels += got + ["other"] * (len(part) - len(got))
    words = [len(t.split()) for t in lines]
    good = sum(w for w, lab in zip(words, labels) if lab in ("environment", "task"))
    pct = round(100.0 * good / max(1, sum(words)), 1)
    info = _ask(client, cfg, SUMMARY_PROMPT + " ".join(lines)[:24000])
    return {
        "labels": labels,
        "descriptive_pct": pct,
        "summary": str(info.get("summary", "")).strip(),
        "category": info.get("category"),
        "script_title": info.get("script_title"),
        "script_text": info.get("script_text"),
        "pii_mentions": info.get("pii_mentions") or [],
    }
