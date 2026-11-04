#!/bin/bash
# Double-click in Finder to start Experiment Studio. Close this window or press Ctrl+C to stop it.
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is needed. Install it from https://www.python.org/downloads/ and double-click this file again."
  read -r -p "Press Return to close."
  exit 1
fi
python3 run_studio.py
