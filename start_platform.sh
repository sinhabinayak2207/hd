#!/usr/bin/env bash
# Runs the Drive watcher inside WSL. Log: platform.log
cd "$(dirname "$0")" || exit 1
export TZ=Asia/Kolkata
exec ~/vetto-env/bin/python -u -m vetto.watch "$@"
