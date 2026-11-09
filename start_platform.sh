#!/usr/bin/env bash
# Runs the worker (Drive watcher + dashboard sync) inside WSL. Log: platform.log
cd "$(dirname "$0")" || exit 1
export TZ=Asia/Kolkata
exec ~/clusterx-env/bin/python -u -m clusterx.watch "$@"
