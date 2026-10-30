#!/usr/bin/env python3
"""ONE operator action, AFTER merge: python3 .github/review/host/activate.py
Prompts privately for a narrowly scoped GitHub PAT, stages the existing runtime
and skill, verifies main's workflow, then enables the dedicated user service.
Do not run during PR development: this activates a host service.
"""
import datetime as dt
import getpass
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess

source = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('runner', source / 'runner.py')
runner = importlib.util.module_from_spec(spec); spec.loader.exec_module(runner)
require = runner.require


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def main():
    os.umask(0o077)
    home = Path.home()
    runtime = Path(shutil.which('openclaw') or '').resolve().parent
    require((runtime / 'package.json').is_file(), 'Installed OpenClaw executable not found')
    require(json.loads((runtime / 'package.json').read_text())['version'] == '2026.9.7',
            'This runner is validated with OpenClaw 2026.9.7; revalidate before changing runtime')
    skill = home / '.openclaw/workspace/agent-skills/skills/pr-review'
    auth = home / '.openclaw/state'
    require((auth / 'openclaw.sqlite').is_file(), 'Existing shared OpenClaw auth store missing')
    require(run('loginctl', 'show-user', str(os.getuid()), '--property=Linger', '--value') == 'yes',
            'Persistent user services require loginctl enable-linger for this host user')
    root = home / '.local/share/openclaw-pr-review'
    require(not root.exists(), 'Installation already exists; stop service and inspect before a deliberate upgrade')
    require(not any(c in str(home) for c in ',\n%'), 'Unsupported home path')
    # Full private policy is copied locally only, never committed or uploaded.
    digest = hashlib.sha256()
    for name in runner.SKILL_FILES:
        file = skill / name
        require(file.is_file() and not file.is_symlink(), 'Installed pr-review skill missing')
        digest.update(name.encode() + b'\0' + file.read_bytes() + b'\0')
    runner.load_skill(skill, digest.hexdigest())
    status = json.loads(run('openclaw', 'models', 'status', '--json'))
    profiles = [p for p in status.get('auth', {}).get('oauth', {}).get('profiles', [])
                if p.get('provider') == 'openai' and p.get('type') == 'oauth' and p.get('status') == 'ok']
    require(len(profiles) == 1, 'Expected one usable OpenAI OAuth profile; resolve model authentication first')
    model_config = json.loads((source / 'host/openclaw.json').read_text())
    model_config['auth']['order']['openai'] = [profiles[0]['profileId']]
    print('Enter a fine-grained PAT restricted to PabloJVelez/private-chef-template:')
    print('Actions read, Contents read, Pull requests write; Checks/Commit statuses read for CI context.')
    token = getpass.getpass('GitHub token (hidden): ').strip()
    require(token.startswith('github_pat_'), 'Use a fine-grained PAT, not a broad classic/CLI token')
    api = runner.review.GitHub(runner.REPOSITORY, token)
    actor = runner.review.http_json('https://api.github.com/user', token)
    repo = runner.review.http_json(f'https://api.github.com/repos/{runner.REPOSITORY}', token)
    require(repo['default_branch'] == 'main' and not repo['private'], 'Expected public repository with main default branch')
    require(run('git', '-C', str(source), 'status', '--porcelain') == '',
            'Activate only from a clean, reviewed checkout')
    require(run('git', '-C', str(source), 'rev-parse', 'HEAD') == api.get('commits/main')['sha'],
            'Activate only from the exact merged main commit')
    workflow = api.get('actions/workflows/auto-pr-review.yml')
    blob = api.get(f'contents/{runner.WORKFLOW}?ref=main')
    expected = runner.git_blob((source.parent / 'workflows/auto-pr-review.yml').read_bytes())
    require(blob['sha'] == expected and workflow['path'] == runner.WORKFLOW and workflow['state'] == 'active',
            'Reviewed queue workflow must be merged to main and enabled before activation')
    run('docker', 'info', '--format', '{{.ServerVersion}}')
    config = {'repository_id': repo['id'], 'workflow_id': workflow['id'], 'workflow_blob': expected,
              'actor_id': actor['id'], 'skill_sha256': digest.hexdigest(),
              'enabled_after': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}
    # Test/build before creating service or credentials. Build uses only trusted files.
    subprocess.run(['python3', '-m', 'unittest', 'discover', '-s', str(source), '-p', 'test_*.py'], check=True)
    subprocess.run(['docker', 'build', '-t', 'openclaw-pr-review:installed', '-f',
                    str(source / 'host/Dockerfile'), str(source)], check=True)
    image = run('docker', 'image', 'inspect', 'openclaw-pr-review:installed', '--format', '{{.Id}}')
    subprocess.run(['docker', 'run', '--rm', '--network', 'none', '--read-only',
                    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
                    '--user', f'{os.getuid()}:{os.getgid()}', '--pids-limit', '128',
                    '--memory', '2g', '--cpus', '2',
                    '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=512m',
                    '--mount', f'type=bind,src={runtime},dst=/opt/openclaw,readonly',
                    '--mount', f'type=bind,src={source / "host/smoke_runtime.py"},dst=/smoke.py,readonly',
                    '--entrypoint', 'python3', image, '/smoke.py'], check=True)
    root.mkdir(parents=True, mode=0o700)
    for name in ('state', 'credentials', 'skill'):
        (root / name).mkdir(mode=0o700)
    shutil.copytree(runtime, root / 'runtime', symlinks=False)
    for name in runner.SKILL_FILES:
        dest = root / 'skill' / name; dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(skill / name, dest)
    (root / 'credentials/github-token').write_text(token + '\n')
    (root / 'credentials/config.json').write_text(json.dumps(config))
    (root / 'credentials/openclaw.json').write_text(json.dumps(model_config))
    (root / 'deployment.json').write_text(json.dumps({'image_id': image, 'auth_store': str(auth)}))
    shutil.copyfile(source / 'host/launch.py', root / 'launch.py')
    # No shell interpolation in the generated service; python builds Docker argv.
    launcher = str(root / 'launch.py').replace('\\', '\\\\').replace('"', '\\"')
    unit = ('[Unit]\nDescription=Restricted OpenClaw PR review queue\nAfter=default.target\n'
            '[Service]\nType=simple\n'
            f'ExecStart=/usr/bin/python3 "{launcher}"\n'
            'ExecStop=-/usr/bin/docker stop --time 30 openclaw-pr-review\n'
            'Restart=on-failure\nRestartSec=120\nTimeoutStopSec=45\nUMask=0077\n'
            '[Install]\nWantedBy=default.target\n')
    units = home / '.config/systemd/user'; units.mkdir(parents=True, exist_ok=True)
    (units / 'openclaw-pr-review.service').write_text(unit)
    subprocess.run(['systemctl', '--user', 'daemon-reload'], check=True)
    subprocess.run(['systemctl', '--user', 'enable', '--now', 'openclaw-pr-review.service'], check=True)
    print('Service enabled. Automation is NOT verified: complete dry-run, publication and real event checks in docs/automatic-pr-review.md.')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(str(exc) if isinstance(exc, runner.Failure) else type(exc).__name__)
        raise SystemExit(1)
