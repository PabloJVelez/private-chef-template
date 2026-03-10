#!/bin/bash
set -e

# Wires DevAgent slash commands for Cursor to match markethaus layout:
# - .agents/commands/<name>.md  (canonical; symlinks to .devagent/commands/)
# - .cursor/commands/<name>.md   (Cursor-facing; symlinks to ../../.agents/commands/)
# Cursor discovers .cursor/commands/*.md as slash commands (e.g. new-task.md → /new-task).
# Run from project root: ./.devagent/scripts/sync-core-commands.sh

DEVAGENT_CMDS=".devagent/commands"
AGENTS_CMDS=".agents/commands"
CURSOR_CMDS=".cursor/commands"

if [ ! -d "$DEVAGENT_CMDS" ]; then
  echo "Error: $DEVAGENT_CMDS not found. Run from project root."
  exit 1
fi

mkdir -p "$AGENTS_CMDS" "$CURSOR_CMDS"

echo "1. Populating $AGENTS_CMDS (symlinks to $DEVAGENT_CMDS)..."
for CMD in "$DEVAGENT_CMDS"/*.md; do
  [ -f "$CMD" ] || continue
  NAME=$(basename "$CMD")
  TARGET="$AGENTS_CMDS/$NAME"
  if [ -e "$TARGET" ] && [ ! -L "$TARGET" ]; then
    echo "   Skip (existing non-symlink): $TARGET"
    continue
  fi
  ln -sf ../../.devagent/commands/"$NAME" "$TARGET"
done

echo "2. Linking $CURSOR_CMDS -> $AGENTS_CMDS (Cursor discovers these as slash commands)..."
for CMD in "$AGENTS_CMDS"/*.md; do
  [ -e "$CMD" ] || continue
  NAME=$(basename "$CMD")
  TARGET="$CURSOR_CMDS/$NAME"
  if [ -e "$TARGET" ] && [ ! -L "$TARGET" ]; then
    echo "   Skip (existing non-symlink): $TARGET"
    continue
  fi
  ln -sf ../../.agents/commands/"$NAME" "$TARGET"
done

echo "Done. Use /new-task, /research, etc. in Cursor chat. Reload window if needed."
