#!/bin/bash
# SessionStart hook: install this repo's Winning Writing skills into the
# user's Claude Code skills directory so they are available in every session
# (Claude Code on the web spins up a fresh container per session, so skills
# copied manually in one session do not persist to the next — this hook
# re-installs them at startup).
#
# Idempotent: safe to run repeatedly. The repo's skills/ is the source of truth,
# so each run refreshes ~/.claude/skills/ from it.
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
SRC="$PROJECT_DIR/skills"
DEST="$HOME/.claude/skills"

mkdir -p "$DEST"

# Copy every skill directory (each contains a SKILL.md). Skip the top-level
# README.md so it does not land as a bogus skill.
count=0
for dir in "$SRC"/*/; do
  [ -d "$dir" ] || continue
  name="$(basename "$dir")"
  cp -r "$dir" "$DEST/$name"
  count=$((count + 1))
done

echo "Installed $count Winning Writing skills into $DEST"
