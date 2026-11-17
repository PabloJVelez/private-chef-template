#!/usr/bin/env python3
"""Manually deploy a successful exact-head CI run to the single private pilot."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import urllib.request

REPO = 'PabloJVelez/private-chef-template'
ROOT = Path(__file__).resolve().parent
STATE = Path.home() / '.local/share/chef-previews'
ENV = STATE / 'pilot.env'

def run(args, **kwargs):
    return subprocess.run(args, check=True, text=True, **kwargs)

def gh(*args):
    return json.loads(run(['gh', *args, '--repo', REPO], capture_output=True).stdout)

def current(pr, sha):
    info = gh('pr', 'view', pr, '--json', 'state,headRefOid,isCrossRepository')
    if info['state'] != 'OPEN' or info['headRefOid'] != sha or info['isCrossRepository']:
        raise RuntimeError('Refusing closed, stale or fork PR')

def main():
    if len(sys.argv) != 3 or not all(re.fullmatch(r'[1-9][0-9]*', x) for x in sys.argv[1:]):
        raise SystemExit('usage: deploy-pilot.py PR_NUMBER SUCCESSFUL_RUN_ID')
    pr, run_id = sys.argv[1:]
    os.umask(0o077)
    with (STATE / 'pilot.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        metadata = gh('run', 'view', run_id, '--json', 'conclusion,workflowName,headSha')
        if metadata['conclusion'] != 'success' or metadata['workflowName'] != 'Preview pilot images':
            raise RuntimeError('Expected a successful Preview pilot images run')
        sha = metadata['headSha']
        if not re.fullmatch(r'[0-9a-f]{40}', sha):
            raise RuntimeError('Invalid SHA receipt')
        current(pr, sha)
        # Admission gate before loading multi-GB image archives.
        fs = os.statvfs(STATE)
        if fs.f_bavail * fs.f_frsize < 30 * 1024**3:
            raise RuntimeError('Less than 30 GiB free; refusing deployment')
        with tempfile.TemporaryDirectory(prefix='import-', dir=STATE) as directory:
            folder = Path(directory)
            for app in ('medusa', 'storefront'):
                dest = folder / app
                run(['gh', 'run', 'download', run_id, '--repo', REPO, '--name', f'preview-{app}-{sha}', '--dir', str(dest)])
                if (dest / 'source-sha.txt').read_text().strip() != sha:
                    raise RuntimeError('Artifact source SHA mismatch')
                archive = dest / f'{app}.tar.gz'
                expected = (dest / f'{app}.sha256').read_text().split()[0]
                with archive.open('rb') as source:
                    actual = hashlib.file_digest(source, 'sha256').hexdigest()
                if actual != expected:
                    raise RuntimeError('Artifact checksum mismatch')
                run(['docker', 'load', '-i', str(archive)], stdout=subprocess.DEVNULL)
                image = f'chef-preview-{app}:{sha}'
                label = run(['docker', 'image', 'inspect', image, '--format', '{{index .Config.Labels "org.opencontainers.image.revision"}}'], capture_output=True).stdout.strip()
                if label != sha:
                    raise RuntimeError('Image revision mismatch')
            current(pr, sha)
            values = dict(line.split('=', 1) for line in ENV.read_text().splitlines() if line and not line.startswith('#'))
            values.update(MEDUSA_IMAGE=f'chef-preview-medusa:{sha}', STOREFRONT_IMAGE=f'chef-preview-storefront:{sha}')
            def save_env():
                temporary = ENV.with_suffix('.env.next')
                temporary.write_text(''.join(f'{k}={v}\n' for k, v in values.items()))
                temporary.replace(ENV)
            save_env()
            compose = ['docker', 'compose', '--env-file', str(ENV), '-f', str(ROOT / 'compose.yaml'), '--profile', 'app']
            run([*compose, 'config', '--quiet'])
            run([*compose, 'stop', 'proxy', 'medusa', 'storefront'])
            run([*compose, 'up', '-d', '--wait', 'postgres', 'redis'])
            for name, command in (
                ('migration', ['db:migrate']),
                ('seed', ['exec', './src/scripts/preview-seed.js']),
            ):
                current(pr, sha)
                result = subprocess.run([*compose, 'run', '--rm', '--no-deps', 'medusa', '/app/apps/medusa/node_modules/.bin/medusa', *command], capture_output=True, text=True)
                log = result.stdout + result.stderr
                (STATE / f'{name}-{sha}.log').write_text(log)
                if result.returncode or re.search(r'\b(error|failed|failure)\b', log, re.I):
                    raise RuntimeError(f'{name} emitted error markers; inspect private log before proceeding')
            # Copy only the generated receipt, never expose it on stdout.
            run([*compose, 'create', 'medusa'])
            run([*compose, 'cp', 'medusa:/app/apps/medusa/.medusa/server/preview-emails/bootstrap.json', str(folder / 'bootstrap.json')])
            values['MEDUSA_PUBLISHABLE_KEY'] = json.loads((folder / 'bootstrap.json').read_text())['publishable_key']
            save_env()
            current(pr, sha)
            run([*compose, 'up', '-d', 'medusa', 'storefront', 'proxy'])
            for port, path in ((values['API_PORT'], '/health'), (values['STOREFRONT_PORT'], '/')):
                for attempt in range(60):
                    try:
                        with urllib.request.urlopen(f'http://127.0.0.1:{port}{path}', timeout=3) as response:
                            if response.status == 200: break
                    except Exception:
                        time.sleep(2)
                else: raise RuntimeError(f'Port {port} readiness timed out')
            current(pr, sha)
            (STATE / 'deployed.json').write_text(json.dumps({'pr': pr, 'sha': sha, 'run': run_id, 'surface_health': True}))
            print('Pilot API and storefront responded successfully. Feature acceptance is still required.')

if __name__ == '__main__':
    main()
