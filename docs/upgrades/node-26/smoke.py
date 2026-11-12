"""Bounded HTTP checks against task-owned, egress-isolated Docker fixtures.
Run after rehearsal.py and both image builds. No production credentials are read.
"""
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.error
import urllib.request

out = Path(os.environ['UPGRADE_EVIDENCE_DIR'])
tag = os.environ['UPGRADE_IMAGE_TAG']
results = []

def command(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.STDOUT, timeout=120).strip()

def record(name, **details):
    results.append(dict(name=name, **details))
    (out / 'docker-smoke.json').write_text(json.dumps(results, indent=2))
    print(name, details, flush=True)

def http(base, path, body=None, headers=None, expected=200):
    request = urllib.request.Request(base + path, data=None if body is None else json.dumps(body).encode(),
        headers={'Content-Type': 'application/json', **(headers or {})})
    try:
        response = urllib.request.urlopen(request, timeout=20)
    except urllib.error.HTTPError as error:
        response = error
    data = response.read().decode()
    assert response.status == expected, (path, response.status, data[:500])
    return data

def ready(base, path):
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        try:
            return http(base, path)
        except (AssertionError, OSError):
            time.sleep(1)
    raise RuntimeError('Container readiness timeout: ' + path)

command('docker', 'network', 'create', '--internal', 'chef-node26-smoke')
for service in ['chef-node26-postgres', 'chef-node26-redis']:
    command('docker', 'network', 'connect', 'chef-node26-smoke', service)
started = []
try:
    for workspace in ['medusa', 'storefront']:
        image = f'chef-node26-{workspace}:{tag}'
        config = json.loads(command('docker', 'image', 'inspect', image))[0]
        assert config['Config']['User'] == '1000'
        version = command('docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'node', image, '--version')
        assert version == 'v26.13.1'
        record(workspace + '-image', image_id=config['Id'], user='1000', node=version)
    probe = "const s=require('@swc/core'); if(!s.transformSync('const n: number = 26', {jsc:{parser:{syntax:'typescript'}}}).code.includes('26'))process.exit(1); console.log('SWC native transform OK',s.version)"
    record('alpine-native-swc', output=command('docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'node', f'chef-node26-medusa:{tag}', '-e', probe))
    # Fixture-only provider configuration prevents checkout from requesting Stripe.
    command('docker', 'exec', 'chef-node26-postgres', 'psql', '-U', 'postgres', '-d', 'upgrade_main', '-v', 'ON_ERROR_STOP=1', '-c',
            "UPDATE tax_region SET provider_id='tp_system'; DELETE FROM region_payment_provider;")
    backend_env = {
        'DATABASE_URL': 'postgres://postgres:node26-fixture-only@chef-node26-postgres:5432/upgrade_main',
        'REDIS_URL': 'redis://chef-node26-redis:6379/6', 'NODE_ENV': 'production', 'PORT': '9000',
        'FILE_PROVIDER': 'local', 'STRIPE_API_KEY': 'sk_test_fixture', 'RESEND_API_KEY': 're_fixture',
        'RESEND_FROM_EMAIL': 'fixture@example.invalid', 'JWT_SECRET': 'node26-fixture-jwt',
        'COOKIE_SECRET': 'node26-fixture-cookie', 'MEDUSA_TELEMETRY_DISABLED': '1',
    }
    def launch(name, image, port, env, args=()):
        flags = [flag for key, value in env.items() for flag in ['-e', key + '=' + value]]
        command('docker', 'run', '-d', '--name', name, '--network', 'chef-node26-smoke',
                '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
                '-p', f'127.0.0.1::{port}', *flags, image, *args)
        started.append(name)
        mapping = command('docker', 'port', name, str(port) + '/tcp')
        return 'http://' + mapping
    # Override the normal migration-and-start command: rehearsal already migrated this fixture.
    backend = launch('chef-node26-backend', f'chef-node26-medusa:{tag}', 9000, backend_env,
        ['sh', '-c', 'exec /app/apps/medusa/node_modules/.bin/medusa start'])
    ready(backend, '/health')
    record('backend-health', status=200)
    http(backend, '/admin/users/me', expected=401)
    auth = json.loads(http(backend, '/auth/user/emailpass', {'email': 'fixture@example.invalid', 'password': 'Node26-fixture-only-123!'}))
    http(backend, '/admin/users/me', headers={'Authorization': 'Bearer ' + auth['token']})
    http(backend, '/auth/user/emailpass', {'email': 'fixture@example.invalid', 'password': 'wrong'}, expected=401)
    record('admin-auth', login=200, authenticated=200, anonymous=401, wrong_password=401)
    admin = http(backend, '/app/login')
    assets = re.findall(r'src="([^"]+\.js)"', admin)
    assert assets, 'Admin JavaScript asset missing'
    http(backend, assets[0])
    record('built-admin', html=200, javascript=200)
    seed = next(json.loads(line) for line in (out / 'node24-browser-seed.log').read_text().splitlines() if line.startswith('{"publishableKey"'))
    store_headers = {'x-publishable-api-key': seed['publishableKey']}
    regions = json.loads(http(backend, '/store/regions', headers=store_headers))['regions']
    products = json.loads(http(backend, '/store/products?handle=upgrade-fixture-dinner&region_id=' + regions[0]['id'], headers=store_headers))['products']
    assert len(products) == 1
    cart = json.loads(http(backend, '/store/carts', {'region_id': regions[0]['id']}, store_headers))['cart']
    cart = json.loads(http(backend, '/store/carts/' + cart['id'] + '/line-items', {'variant_id': products[0]['variants'][0]['id'], 'quantity': 1}, store_headers))['cart']
    assert cart['items'][0]['unit_price'] == 425.25
    record('native-cart', items=len(cart['items']), unit_price=425.25)
    storefront = launch('chef-node26-storefront', f'chef-node26-storefront:{tag}', 3000, {
        'NODE_ENV': 'production', 'PORT': '3000', 'PUBLIC_MEDUSA_API_URL': 'http://chef-node26-backend:9000',
        'MEDUSA_PUBLISHABLE_KEY': seed['publishableKey'], 'STRIPE_PUBLIC_KEY': 'pk_test_fixture',
        'STOREFRONT_URL': 'http://localhost:3000',
    })
    home = ready(storefront, '/')
    assert '<html' in home and 'Private Chef' in home
    product = http(storefront, '/products/upgrade-fixture-dinner')
    assert 'Upgrade fixture dinner' in product
    checkout = http(storefront, '/checkout', headers={'Cookie': '_medusa_cart_id=' + cart['id']})
    assert '425.25' in checkout and 'Upgrade fixture dinner' in checkout
    for iteration in range(3):
        http(storefront, '/')
        http(storefront, '/products/upgrade-fixture-dinner')
    record('storefront-ssr', home=200, product=200, checkout=200, repeat_pairs=3, external_payments=False)
finally:
    for name in reversed(started):
        (out / (name + '.log')).write_text(command('docker', 'logs', name))
        command('docker', 'rm', '-f', name)
    for service in ['chef-node26-postgres', 'chef-node26-redis']:
        command('docker', 'network', 'disconnect', 'chef-node26-smoke', service)
    command('docker', 'network', 'rm', 'chef-node26-smoke')
