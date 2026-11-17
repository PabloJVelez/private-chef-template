#!/usr/bin/env python3
"""Generate a private pilot env once. Never reads or copies production config."""
import os
from pathlib import Path
import secrets
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: init-pilot.py /absolute/private/pilot.env')
path = Path(sys.argv[1])
if not path.is_absolute():
    raise SystemExit('Use an absolute private path outside the checkout')
path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
values = {
    'PREVIEW_ID': 'pilot',
    'POSTGRES_PASSWORD': secrets.token_hex(24),
    'JWT_SECRET': secrets.token_hex(32),
    'COOKIE_SECRET': secrets.token_hex(32),
    'MEDUSA_IMAGE': 'chef-preview-medusa:pilot',
    'STOREFRONT_IMAGE': 'chef-preview-storefront:pilot',
    'API_PORT': '19000',
    'STOREFRONT_PORT': '13000',
    'API_URL': 'http://localhost:19000',
    'STOREFRONT_URL': 'http://localhost:13000',
}
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as target:
    target.write(''.join(f'{key}={value}\n' for key, value in values.items()))
print('Created private pilot configuration; no production credentials used.')
