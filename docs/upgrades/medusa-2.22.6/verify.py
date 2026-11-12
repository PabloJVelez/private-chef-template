"""Run from a clean archive of the implemented commit; use only task-owned fixtures.
Node 24.22.1 must be first in PATH. Evidence directory is outside the source tree.
Integration URLs are mandatory, never inferred from application .env files.
"""
import json
import os
from pathlib import Path
import subprocess
import sys

root = Path.cwd()
out = Path(os.environ['UPGRADE_EVIDENCE_DIR'])
out.mkdir(parents=True, exist_ok=True)
assert subprocess.check_output(['node', '--version'], text=True).strip() == 'v24.22.1'
for name in ['BOOKING_TEST_DATABASE_URL', 'BOOKING_TEST_REDIS_URL',
             'AVAILABILITY_TEST_DATABASE_URL', 'SOCIAL_GALLERY_TEST_DATABASE_URL']:
    from urllib.parse import urlparse
    assert urlparse(os.environ[name]).hostname in ('localhost', '127.0.0.1'), name
results = []
checks = [('install', ['install', '--immutable'])]
for workspace in ['medusa', 'storefront']:
    for check in ['typecheck', 'test:unit', 'build']:
        checks.append((workspace + '-' + check.replace(':', '-'), ['workspace', workspace, check]))
checks.extend([
    ('medusa-lint', ['workspace', 'medusa', 'lint']),
    ('integration-http', ['workspace', 'medusa', 'test:integration:http', '--testPathIgnorePatterns=health.spec']),
    ('integration-health', ['workspace', 'medusa', 'test:integration:http', '--runTestsByPath', 'integration-tests/http/health.spec.ts']),
    ('integration-modules', ['workspace', 'medusa', 'test:integration:modules']),
])
for name, args in checks:
    command = ['corepack', 'yarn', *args]
    with (out / (name + '.log')).open('w') as log:
        result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT)
    results.append(dict(name=name, command=command, exit_code=result.returncode))
    (out / 'results.json').write_text(json.dumps(results, indent=2))
    print(name, result.returncode, flush=True)
    if result.returncode and name == 'install': break
sys.exit(any(x['exit_code'] for x in results))
