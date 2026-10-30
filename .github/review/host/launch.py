#!/usr/bin/env python3
"""Host-only container launcher. Never mounted into the model container."""
import json
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent
config = json.loads((root / 'deployment.json').read_text())
args = ['docker', 'run', '--rm', '--name', 'openclaw-pr-review',
        '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
        '--user', f'{os.getuid()}:{os.getgid()}', '--pids-limit', '128',
        '--memory', '2g', '--cpus', '2', '--log-driver', 'none',
        '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=512m',
        '--tmpfs', f'/auth:rw,nosuid,nodev,noexec,size=128m,uid={os.getuid()},gid={os.getgid()}',
        '--mount', f'type=bind,src={root / "runtime"},dst=/opt/openclaw,readonly',
        '--mount', f'type=bind,src={root / "skill"},dst=/skill,readonly',
        '--mount', f'type=bind,src={root / "credentials"},dst=/run/reviewer,readonly',
        '--mount', f'type=bind,src={root / "state"},dst=/state',
        # Supported shared auth store; writable for SQLite locks/OAuth rotation.
        # No gateway config, agent sessions, SSH, project trees or Docker socket.
        '--mount', f'type=bind,src={config["auth_store"]},dst=/auth/state',
        config['image_id']]
raise SystemExit(subprocess.run(args, check=False).returncode)
