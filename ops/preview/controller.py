#!/usr/bin/env python3
"""Operator-installed reconciler. Never executes scripts or Compose files from PRs.

Default is a read-only plan. --apply requires explicitly enabled private config.
GitHub/Cloudflare failures stop reconciliation; absent PRs are individually checked
before retiring their synthetic data. Only this controller's recorded resources
are ever deleted. Secrets and application logs stay in the private state directory.
"""
import argparse
import base64
import datetime as dt
import fcntl
import hashlib
import ipaddress
import socket
from contextlib import contextmanager
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent
MARKER = '<!-- chef-preview-controller:v1 -->'
SHA = re.compile(r'^[0-9a-f]{40}$')
GIB = 1024**3


def command(args, timeout=1200, **kwargs):
    # Never expose command output (may include env, credentials or app payloads)
    # through exceptions or public PR status text.
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout, **kwargs)
    if result.returncode:
        raise RuntimeError(f'{Path(args[0]).name} failed with exit {result.returncode}')
    return result.stdout


def atomic(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    tmp = path.with_name(path.name + '.next')
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as f:
        f.write(value)
        f.flush()
        os.fsync(f.fileno())
    tmp.replace(path)


def write_json(path, obj):
    atomic(path, json.dumps(obj, indent=2) + '\n')


def load_env(path):
    return dict(line.split('=', 1) for line in path.read_text().splitlines()
                if line and not line.startswith('#'))


def save_env(path, env):
    assert all('\n' not in str(v) for v in env.values())
    atomic(path, ''.join(f'{k}={v}\n' for k, v in env.items()))


def trusted(pr, repo):
    return (pr['state'] == 'open' and not pr.get('draft', False)
            and pr['head']['repo'] is not None
            and pr['head']['repo']['full_name'] == repo
            and SHA.fullmatch(pr['head']['sha']) is not None)


def choose(open_prs, entries, capacity, repo):
    """Existing occupants retain slots; oldest eligible PRs fill vacancies."""
    eligible = {str(p['number']): p for p in open_prs if trusted(p, repo)}
    occupants = [key for key in entries if key in eligible]
    # Existing closed/failed resources consume slots until confirmed cleanup.
    available = max(0, capacity - len(entries))
    waiting = sorted((p for k, p in eligible.items() if k not in entries), key=lambda p: p['number'])
    return occupants + [str(p['number']) for p in waiting[:available]], [str(p['number']) for p in waiting[available:]]


class GitHub:
    def __init__(self, repo):
        if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repo):
            raise ValueError('Invalid repository')
        self.repo = repo
        self.login = None

    def api(self, path, payload=None, method=None):
        args = ['gh', 'api', path]
        if method:
            args += ['--method', method]
        if payload is not None:
            args += ['--input', '-']
        return json.loads(command(args, input=json.dumps(payload) if payload is not None else None) or 'null')

    def pages(self, path, key=None):
        result = []
        for page in range(1, 101):
            data = self.api(path + ('&' if '?' in path else '?') + f'per_page=100&page={page}')
            batch = data[key] if key else data
            result.extend(batch)
            if len(batch) < 100:
                return result
        raise RuntimeError('Pagination limit exceeded; refusing partial reconciliation')

    def pr(self, number):
        return self.api(f'repos/{self.repo}/pulls/{int(number)}')

    def guard(self, number, sha):
        pr = self.pr(number)
        if not trusted(pr, self.repo) or pr['head']['sha'] != sha:
            raise RuntimeError('PR closed, draft, fork, or superseded')
        permission = self.api(f'repos/{self.repo}/collaborators/{pr["user"]["login"]}/permission')['permission']
        if permission not in ('admin', 'maintain', 'write'):
            raise RuntimeError('PR author is not an authorized repository writer')
        return pr

    def build(self, sha):
        runs = self.pages(f'repos/{self.repo}/actions/workflows/preview-build.yml/runs?head_sha={sha}', 'workflow_runs')
        # Prefer the newest attempt, never silently fall back from a failed run.
        runs = [r for r in runs if r['head_sha'] == sha and r['event'] == 'pull_request']
        if not runs:
            return None
        run = max(runs, key=lambda r: r['id'])
        if run['status'] != 'completed' or run['conclusion'] != 'success':
            return None
        artifacts = self.pages(f'repos/{self.repo}/actions/runs/{run["id"]}/artifacts', 'artifacts')
        for app in ('medusa', 'storefront'):
            matches = [a for a in artifacts if a['name'] == f'preview-{app}-{sha}' and not a['expired']]
            if len(matches) != 1:
                return None
        return run

    def comment(self, number, message):
        if self.login is None:
            self.login = self.api('user')['login']
        path = f'repos/{self.repo}/issues/{int(number)}/comments'
        matches = [c for c in self.pages(path) if c['user']['login'] == self.login and c['body'].startswith(MARKER)]
        if len(matches) > 1:
            raise RuntimeError('Duplicate controller comments require reconciliation')
        body = MARKER + '\n' + message
        if matches:
            if matches[0]['body'] != body:
                self.api(f'repos/{self.repo}/issues/comments/{matches[0]["id"]}', {'body': body}, 'PATCH')
        else:
            self.api(path, {'body': body}, 'POST')

    def preview_deployments(self, number, surface):
        if self.login is None:
            self.login = self.api('user')['login']
        environment = f'pr-{int(number)}-{surface}'
        records = self.pages(f'repos/{self.repo}/deployments?environment={environment}')
        return [d for d in records if d.get('creator', {}).get('login') == self.login
                and d.get('task') == 'deploy:chef-preview'
                and d.get('payload') == {'controller': MARKER, 'pr': int(number), 'surface': surface}]

    def deployment_status(self, deployment, state, url=None):
        path = f'repos/{self.repo}/deployments/{deployment["id"]}/statuses'
        latest = self.api(path + '?per_page=1')
        if latest and latest[0]['state'] == state and (url is None or latest[0].get('environment_url') == url):
            return
        payload = {'state': state, 'auto_inactive': False,
                   'description': 'Synthetic PR preview: ' + state}
        if url is not None:
            payload['environment_url'] = url
        self.api(path, payload, 'POST')

    def deployment(self, number, sha, state, urls=None):
        # GitHub is the durable receipt: recover after a lost POST response without
        # creating duplicates. Never merge the default branch or gate on unrelated CI.
        self.guard(number, sha)
        for surface in ('storefront', 'admin'):
            records = self.preview_deployments(number, surface)
            matching = [d for d in records if d['sha'] == sha]
            if matching:
                deployment = max(matching, key=lambda d: d['id'])
            else:
                deployment = self.api(f'repos/{self.repo}/deployments', {
                    'ref': sha, 'task': 'deploy:chef-preview', 'auto_merge': False,
                    'required_contexts': [], 'environment': f'pr-{int(number)}-{surface}',
                    'transient_environment': True, 'production_environment': False,
                    'description': f'PR #{int(number)} {surface} preview',
                    'payload': {'controller': MARKER, 'pr': int(number), 'surface': surface}
                }, 'POST')
            self.guard(number, sha)
            self.deployment_status(deployment, state, (urls or {}).get(surface))
            # Old commit links must not claim to serve the new commit's environment.
            for old in records:
                if old['id'] != deployment['id']:
                    self.deployment_status(old, 'inactive')

    def deactivate_previews(self, number):
        for surface in ('storefront', 'admin'):
            for deployment in self.preview_deployments(number, surface):
                self.deployment_status(deployment, 'inactive')


class Cloudflare:
    def __init__(self, config):
        self.config = config
        self.token = os.environ.get('CLOUDFLARE_API_TOKEN')
        if not self.token:
            raise RuntimeError('Cloudflare service credential is unavailable')

    def api(self, path, data=None, method=None):
        req = urllib.request.Request('https://api.cloudflare.com/client/v4' + path,
            data=json.dumps(data).encode() if data is not None else None,
            method=method, headers={'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                value = json.load(r)
        except urllib.error.HTTPError as e:
            raise RuntimeError(f'Cloudflare request failed: HTTP {e.code}') from None
        if not value.get('success'):
            raise RuntimeError('Cloudflare rejected request')
        return value['result']

    @property
    def tunnel_path(self):
        return f'/accounts/{self.config["account_id"]}/cfd_tunnel/{self.config["tunnel_id"]}/configurations'

    def hosts(self, number):
        return [f'pr-{int(number)}-preview.{self.config["domain"]}', f'api-pr-{int(number)}-preview.{self.config["domain"]}']

    def route(self, number, env, remove=False, delete_dns=False):
        hosts = self.hosts(number)
        target = self.config['tunnel_id'] + '.cfargotunnel.com'
        base = f'/zones/{self.config["zone_id"]}/dns_records'
        for host in hosts:
            records = self.api(base + '?name=' + host)
            if any(r['type'] != 'CNAME' or r['content'] != target or not r['proxied'] for r in records):
                raise RuntimeError('Existing DNS record conflicts with controller ownership')
        result = self.api(self.tunnel_path)
        config = result['config']
        # Preserve every unrelated route and tunnel option; require a catch-all.
        ingress = config['ingress']
        if ingress[-1] != {'service': 'http_status:404'}:
            raise RuntimeError('Unexpected tunnel fallback; refusing overwrite')
        wanted = [f'http://127.0.0.1:{env["STOREFRONT_PORT"]}', f'http://127.0.0.1:{env["API_PORT"]}']
        for route in ingress:
            if route.get('hostname') in hosts and route.get('service') != wanted[hosts.index(route['hostname'])]:
                raise RuntimeError('Existing tunnel route has a different owner/port')
        config['ingress'] = [r for r in ingress[:-1] if r.get('hostname') not in hosts]
        if not remove:
            config['ingress'] += [{'hostname': h, 'service': s} for h, s in zip(hosts, wanted)]
        config['ingress'].append({'service': 'http_status:404'})
        self.api(self.tunnel_path, {'config': config}, 'PUT')
        actual = self.api(self.tunnel_path)['config']['ingress']
        if actual != config['ingress']:
            raise RuntimeError('Tunnel configuration verification failed')
        # Deletion is exact hostname + exact target only, never wildcard sweep.
        target = self.config['tunnel_id'] + '.cfargotunnel.com'
        base = f'/zones/{self.config["zone_id"]}/dns_records'
        for host in hosts:
            records = self.api(base + '?name=' + host)
            if any(r['type'] != 'CNAME' or r['content'] != target or not r['proxied'] for r in records):
                raise RuntimeError('Existing DNS record conflicts with controller ownership')
            if remove and delete_dns:
                for record in records:
                    self.api(base + '/' + record['id'], method='DELETE')
            elif not remove and not records:
                self.api(base, {'type': 'CNAME', 'name': host, 'content': target, 'proxied': True, 'ttl': 1})


def http(url, data=None, headers=None):
    h = {'User-Agent': 'Mozilla/5.0 (compatible; ChefPreviewHealthCheck/1.0)'}
    h.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=h)
    # Health traffic carries no protected Cloudflare credential. Bypass the
    # Gateway's credential-injection proxy for loopback and live-DNS checks;
    # Cloudflare.api deliberately retains the protected default proxy.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(req, timeout=30) as response:
        return response.read(), response.headers


def public_addresses(host):
    # Resolve through an actual public recursive resolver, not a pinned edge IP.
    # This makes monitoring independent of home-router delegation caches.
    url = 'https://cloudflare-dns.com/dns-query?' + urllib.parse.urlencode({'name': host, 'type': 'A'})
    body, _ = http(url, headers={'Accept': 'application/dns-json'})
    answer = json.loads(body)
    if answer.get('Status') != 0:
        raise RuntimeError('Public DNS lookup failed')
    addresses = [a['data'] for a in answer.get('Answer', []) if a['type'] == 1]
    if not addresses or not all(ipaddress.ip_address(a).is_global for a in addresses):
        raise RuntimeError('Preview DNS must resolve to public addresses')
    return addresses


@contextmanager
def public_dns(hosts):
    addresses = {host: public_addresses(host) for host in hosts}
    original = socket.getaddrinfo
    def lookup(host, *args, **kwargs):
        if host in addresses:
            return [record for address in addresses[host] for record in original(address, *args, **kwargs)]
        return original(host, *args, **kwargs)
    socket.getaddrinfo = lookup
    try:
        yield addresses
    finally:
        socket.getaddrinfo = original


def acceptance(env, public=False, write_request=False):
    """Actual API behavior plus rendered pages; does not claim browser proof."""
    base = env['API_URL'] if public else 'http://127.0.0.1:' + env['API_PORT']
    store = env['STOREFRONT_URL'] if public else 'http://127.0.0.1:' + env['STOREFRONT_PORT']
    def call(path, payload=None):
        data, headers = http(base + path, json.dumps(payload).encode() if payload is not None else None,
            {'Content-Type': 'application/json', 'Origin': env['STOREFRONT_URL'],
             'x-publishable-api-key': env['MEDUSA_PUBLISHABLE_KEY']})
        if headers.get('access-control-allow-origin') != env['STOREFRONT_URL']:
            raise RuntimeError('CORS acceptance failed')
        return json.loads(data)
    token = call('/auth/user/emailpass', {'email': 'chef@admin.com', 'password': 'test'})['token']
    experiences = call('/store/experience-types')['experience_types']
    if not experiences or not call('/store/menus')['menus']:
        raise RuntimeError('Preview seed acceptance failed')
    day = (dt.date.today() + dt.timedelta(days=7)).isoformat()
    slots = call('/store/availability?date=' + day + '&experience_id=' + experiences[0]['id'])
    if not isinstance(slots.get('slots'), list):
        raise RuntimeError('Availability acceptance failed')
    if write_request:
        if not slots['slots']:
            raise RuntimeError('No synthetic request slot available')
        slot = slots['slots'][0]
        call('/store/chef-events', {'slotStart': slot['start'], 'requestedDate': day,
            'requestedTime': slot['time'], 'partySize': 4, 'eventType': experiences[0]['name'],
            'experience_type_id': experiences[0]['id'], 'templateProductId': 'menu_preview',
            'locationType': 'customer_location', 'locationAddress': '123 Synthetic Preview Lane',
            'firstName': 'Preview', 'lastName': 'Check', 'email': 'guest@example.invalid',
            'phone': '+15125550100', 'specialRequirements': 'Synthetic test only',
            'notes': 'Automated preview readiness check. Not a real booking.'})
    for url, marker in [(store + '/', b'<html'), (store + '/request', b'<html'), (base + '/app', b'<html')]:
        body, headers = http(url)
        if marker not in body.lower() or 'noindex' not in headers.get('x-robots-tag', ''):
            raise RuntimeError('Rendered page/noindex acceptance failed')
    # Upload only after public DNS/TLS gates; preserve old URLs across updates.
    if public:
        image = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jMZkAAAAASUVORK5CYII=')
        boundary = 'preview-controller-check'
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="files"; filename="readiness.png"\r\nContent-Type: image/png\r\n\r\n'.encode() + image + f'\r\n--{boundary}--\r\n'.encode())
        uploaded, _ = http(base + '/admin/uploads', body, {'Authorization': 'Bearer ' + token, 'Content-Type': 'multipart/form-data; boundary=' + boundary})
        url = json.loads(uploaded)['files'][0]['url']
        if not url.startswith(base + '/static/') or http(url)[0] != image:
            raise RuntimeError('Public upload acceptance failed')
    return {'admin_auth': True, 'cors': True, 'seed': True, 'availability': True, 'rendered_pages': True, 'public_upload': public, 'synthetic_request': write_request}


def docker_bytes(value):
    match = re.match(r'^(\d+(?:\.\d+)?)\s*(B|kB|KB|MB|GB|TB)', value)
    if not match:
        raise RuntimeError('Unrecognized Docker size; refusing blind disk admission')
    return int(float(match[1]) * {'B': 1, 'kB': 1000, 'KB': 1000, 'MB': 1000**2, 'GB': 1000**3, 'TB': 1000**4}[match[2]])


class Controller:
    def __init__(self, config, state):
        self.config, self.state = config, state
        self.github = GitHub(config['repo'])
        self.entries_path = state / 'environments.json'
        self.entries = json.loads(self.entries_path.read_text()) if self.entries_path.exists() else {}
        self.gc_path = state / 'garbage-collection.json'
        self.gc = json.loads(self.gc_path.read_text()) if self.gc_path.exists() else {'images': {}, 'imports': {}}
        self.cf = None
        if config['max_environments'] not in (1, 2):
            raise ValueError('Only one or two environments supported')
        if not re.fullmatch(r'[a-z0-9.-]+', config['domain']):
            raise ValueError('Invalid domain')
        for key, entry in self.entries.items():
            if not key.isdigit() or entry['slot'] not in (0, 1):
                raise ValueError('Invalid state identity')
        if len({e['slot'] for e in self.entries.values()}) != len(self.entries):
            raise ValueError('Duplicate slot allocation')

    def save(self):
        write_json(self.entries_path, self.entries)

    def folder(self, number):
        return self.state / f'pr-{int(number)}'

    def envpath(self, number):
        return self.folder(number) / 'preview.env'

    def compose(self, number, *args, timeout=1200):
        return command(['docker', 'compose', '--env-file', str(self.envpath(number)), '-f', str(ROOT / 'managed-compose.yaml'), '--profile', 'app', *args], timeout=timeout)

    def current(self, number, sha):
        return self.github.guard(number, sha)

    def allocate(self, number):
        used = {e['slot'] for e in self.entries.values()}
        slot = next(s for s in range(self.config['max_environments']) if s not in used)
        values = {'PREVIEW_ID': f'pr-{int(number)}', 'PREVIEW_BRIDGE': f'cp-{int(number)}',
            'API_PORT': str(19100 + slot), 'STOREFRONT_PORT': str(13100 + slot),
            'API_URL': f'https://api-pr-{int(number)}-preview.{self.config["domain"]}',
            'STOREFRONT_URL': f'https://pr-{int(number)}-preview.{self.config["domain"]}',
            'MEDUSA_IMAGE': 'uninitialized', 'STOREFRONT_IMAGE': 'uninitialized'}
        for key in ('PREVIEW_ADMIN_PASSWORD', 'POSTGRES_PASSWORD', 'JWT_SECRET', 'COOKIE_SECRET'):
            values[key] = secrets.token_hex(32)
        if self.envpath(number).exists():
            raise RuntimeError('Untracked private env exists; refusing overwrite')
        # Persist reservation before any Docker or DNS mutation.
        self.entries[number] = {'slot': slot, 'status': 'allocated', 'sha': None, 'images': []}
        self.save()
        save_env(self.envpath(number), values)

    def configure_admin(self, number, running=False):
        # Trusted operator script, not PR code; no host mounts or DB-table writes.
        mode = ['exec', '-T'] if running else ['run', '--rm', '--no-deps', '-T']
        script = (ROOT / 'preview-admin.cjs').read_text()
        args = ['docker', 'compose', '--env-file', str(self.envpath(number)),
                '-f', str(ROOT / 'managed-compose.yaml'), '--profile', 'app',
                *mode, 'medusa', 'sh', '-c',
                'cat > ./preview-admin.cjs && /app/apps/medusa/node_modules/.bin/medusa exec ./preview-admin.cjs']
        result = subprocess.run(args, input=script, capture_output=True, text=True, timeout=120)
        atomic(self.folder(number) / 'admin-bootstrap.log', result.stdout + result.stderr)
        if result.returncode or 'Standard preview Admin configured' not in result.stdout:
            raise RuntimeError('Preview Admin bootstrap failed; private log retained')
        self.entries[number]['admin_login_version'] = 1
        self.save()

    def sync_ai(self, number, recreate=False):
        path = self.config.get('ai_env_file')
        if not path:
            return
        source = Path(path).expanduser().resolve()
        if not source.is_file() or source.stat().st_mode & 0o077:
            raise RuntimeError('Preview AI configuration must be a private operator file')
        values = load_env(source)
        required = {'CHEF_AI_SCOPE', 'CHEF_AI_PROVIDER', 'CHEF_AI_MODEL',
                    'CHEF_AI_OPENAI_API_KEY', 'CHEF_AI_SCHEDULE_WRITE_ENABLED'}
        if set(values) != required or any(not v for v in values.values()):
            raise RuntimeError('Preview AI configuration is incomplete or contains unapproved keys')
        if values['CHEF_AI_SCOPE'] != 'single_site' or values['CHEF_AI_PROVIDER'] != 'openai':
            raise RuntimeError('Unsupported preview AI scope/provider')
        if values['CHEF_AI_SCHEDULE_WRITE_ENABLED'] not in ('true', 'false'):
            raise RuntimeError('Invalid preview AI write setting')
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        env = load_env(self.envpath(number))
        env['PREVIEW_AI_ENV_FILE'] = str(source)
        save_env(self.envpath(number), env)
        if recreate and self.entries[number].get('ai_config_digest') != digest:
            # Apply routing and env-only changes without migrations or data reset.
            self.compose(number, 'up', '-d', '--no-deps', '--force-recreate', 'medusa')
            self.compose(number, 'up', '-d', '--no-deps', '--force-recreate', 'proxy')
            for _ in range(60):
                try:
                    http('http://127.0.0.1:' + env['API_PORT'] + '/health')
                    break
                except (OSError, urllib.error.URLError):
                    time.sleep(2)
            else:
                raise RuntimeError('Preview API startup after AI configuration timed out')
            acceptance(env)
            self.entries[number]['ai_config_digest'] = digest
            self.save()

    def disk_guard(self):
        free = shutil.disk_usage(self.state).free
        usage = json.loads(command(['docker', 'system', 'df', '-v', '--format', '{{json .}}']))
        # Conservative accounting: shared image layers may count twice. These are
        # stop/admission watermarks, not filesystem hard quotas.
        used = sum(docker_bytes(i['Size']) for i in usage['Images'] if i['Repository'].startswith('chef-preview-'))
        used += sum(docker_bytes(v['Size']) for v in usage['Volumes'] if v['Name'].startswith('chef-preview-'))
        used += sum(docker_bytes(v['Size']) for v in usage['Containers'] if v['Names'].startswith('chef-preview-'))
        if free < self.config.get('min_free_gib', 30) * GIB or used > self.config.get('max_pool_gib', 80) * GIB:
            # Stop writers, preserve data, then fail visibly. No destructive prune.
            for number in self.entries:
                self.compose(number, 'stop')
            raise RuntimeError('Disk watermark exceeded; preview writers stopped, data retained')

    def capacity_guard(self):
        if shutil.disk_usage(self.state).free < self.config.get('min_free_gib', 30) * GIB:
            raise RuntimeError('Disk free-space admission gate blocked')
        self.disk_guard()
        # Account for the old pilot or other unmanaged preview stacks before launch.
        containers = [json.loads(line) for line in command(['docker', 'container', 'ls', '--all', '--format', 'json']).splitlines()]
        allowed = {load_env(self.envpath(n))['PREVIEW_ID'] for n in self.entries if self.envpath(n).exists()}
        for c in containers:
            name = c['Names']
            if name.startswith('chef-preview-') and not any(name.startswith('chef-preview-' + x + '-') for x in allowed):
                raise RuntimeError('Unmanaged preview exists; adopt or retire it before automatic deployment')

    def import_images(self, number, sha, run):
        self.current(number, sha)
        with tempfile.TemporaryDirectory(dir=self.state, prefix='import-') as temp:
            folder = Path(temp)
            images = {}
            for app in ('medusa', 'storefront'):
                dest = folder / app
                command(['gh', 'run', 'download', str(run['id']), '--repo', self.config['repo'], '--name', f'preview-{app}-{sha}', '--dir', str(dest)])
                if (dest / 'source-sha.txt').read_text().strip() != sha:
                    raise RuntimeError('Artifact SHA mismatch')
                archive = dest / f'{app}.tar.gz'
                with archive.open('rb') as stream:
                    digest = hashlib.file_digest(stream, 'sha256').hexdigest()
                if (dest / f'{app}.sha256').read_text().split()[0] != digest:
                    raise RuntimeError('Artifact checksum mismatch')
                self.capacity_guard()
                # Journal intent BEFORE load, so a killed process can rediscover it.
                tag = f'chef-preview-{app}:{sha}'
                self.gc['imports'][tag] = {'pr': number, 'sha': sha}
                write_json(self.gc_path, self.gc)
                command(['docker', 'load', '-i', str(archive)])
                info = json.loads(command(['docker', 'image', 'inspect', f'chef-preview-{app}:{sha}']))[0]
                self.track_images([info['Id']])
                self.entries[number].setdefault('pending_images', []).append(info['Id'])
                self.save()
                del self.gc['imports'][tag]
                write_json(self.gc_path, self.gc)
                if info['Config']['Labels'].get('org.opencontainers.image.revision') != sha:
                    raise RuntimeError('Image revision mismatch')
                images[app] = info['Id']
            self.current(number, sha)
            return images

    def deploy(self, number, sha, run):
        env = load_env(self.envpath(number))
        entry = self.entries[number]
        # Only recorded immutable app IDs can become rollback/prune candidates.
        # A fresh env contains placeholders, and the adopted pilot used tags.
        previous_images = entry.get('candidate_images', []) if entry.get('previous_status') == 'awaiting_public' else entry.get('images', [])
        images = self.import_images(number, sha, run)
        # A previous failed migration may still need the images referenced by its
        # current/previous env. Keep those until acceptance releases pending state.
        entry['pending_images'] = list(dict.fromkeys(entry.get('pending_images', []) + list(images.values())))
        self.save()
        self.current(number, sha)
        # Withdraw links/routing during migrations. A failed migration must not
        # leave old app processes running against a partially migrated schema.
        self.cf.route(number, env, remove=True)
        self.compose(number, 'stop', 'proxy', 'medusa', 'storefront')
        self.compose(number, 'up', '-d', '--wait', 'postgres', 'redis')
        if entry.get('sha'):
            dump = self.folder(number) / 'before-update.sql'
            if entry.get('previous_status') == 'failed' and dump.exists():
                raise RuntimeError('Previous failed update requires DB recovery before another migration')
            with dump.open('wb') as out:
                result = subprocess.run(['docker', 'compose', '--env-file', str(self.envpath(number)), '-f', str(ROOT / 'managed-compose.yaml'), 'exec', '-T', 'postgres', 'pg_dump', '-U', 'preview', 'preview'], stdout=out, stderr=subprocess.PIPE, timeout=120)
            dump.chmod(0o600)
            if result.returncode:
                raise RuntimeError('Database snapshot failed')
        atomic(self.folder(number) / 'previous.env', self.envpath(number).read_text())
        env.update(MEDUSA_IMAGE=images['medusa'], STOREFRONT_IMAGE=images['storefront'])
        save_env(self.envpath(number), env)
        for name, cmd in [('migration', ['db:migrate']), ('seed', ['exec', './src/scripts/preview-seed.js'])]:
            self.current(number, sha)
            args = ['docker', 'compose', '--env-file', str(self.envpath(number)), '-f', str(ROOT / 'managed-compose.yaml'), '--profile', 'app', 'run', '--rm', '--no-deps', 'medusa', '/app/apps/medusa/node_modules/.bin/medusa', *cmd]
            result = subprocess.run(args, capture_output=True, text=True, timeout=600)
            log = result.stdout + result.stderr
            atomic(self.folder(number) / f'{name}.log', log)
            if result.returncode or re.search(r'\b(error|failed|failure)\b', log, re.I):
                raise RuntimeError(f'{name} failed; private log retained')
        self.configure_admin(number)
        self.compose(number, 'create', 'medusa')
        receipt = self.folder(number) / 'bootstrap.json'
        self.compose(number, 'cp', 'medusa:/app/apps/medusa/.medusa/server/preview-emails/bootstrap.json', str(receipt))
        receipt.chmod(0o600)
        env['MEDUSA_PUBLISHABLE_KEY'] = json.loads(receipt.read_text())['publishable_key']
        save_env(self.envpath(number), env)
        self.compose(number, 'up', '-d', 'medusa', 'storefront')
        self.compose(number, 'up', '-d', '--no-deps', '--force-recreate', 'proxy')
        for _ in range(60):
            try:
                http('http://127.0.0.1:' + env['API_PORT'] + '/health')
                http('http://127.0.0.1:' + env['STOREFRONT_PORT'] + '/')
                break
            except (OSError, urllib.error.URLError):
                time.sleep(2)
        else:
            raise RuntimeError('API/storefront startup timed out')
        count_script = 'console.log(require("fs").readdirSync("preview-emails").filter(n => n.endsWith(".json") && n !== "bootstrap.json").length)'
        before_mail = int(self.compose(number, 'exec', '-T', 'medusa', 'node', '-e', count_script).strip())
        acceptance(env, write_request=True)
        for _ in range(15):
            after_mail = int(self.compose(number, 'exec', '-T', 'medusa', 'node', '-e', count_script).strip())
            if after_mail > before_mail:
                break
            time.sleep(1)
        else:
            raise RuntimeError('Synthetic request email was not captured')
        self.current(number, sha)
        entry.update(status='awaiting_public', candidate_sha=sha, candidate_run=run['id'],
                     candidate_images=list(images.values()), pending_since=time.time(),
                     previous_images=list(previous_images))
        self.save()
        self.cf.route(number, env)
        self.finalize(number)

    def finalize(self, number):
        entry = self.entries[number]
        sha = entry['candidate_sha']
        self.current(number, sha)
        env = load_env(self.envpath(number))
        try:
            hosts = [urllib.parse.urlparse(env[k]).hostname for k in ('API_URL', 'STOREFRONT_URL')]
            with public_dns(hosts):
                proof = acceptance(env, public=True)
            proof['dns_resolver'] = 'Cloudflare public DNS-over-HTTPS'
            command(['node', str(ROOT / 'browser-acceptance.cjs'), str(self.envpath(number)), str(self.folder(number) / 'browser.json')], timeout=180, env={**os.environ, 'NODE_USE_ENV_PROXY': '0'})
        except (OSError, ValueError, KeyError, RuntimeError) as error:
            if time.time() - entry['pending_since'] > 1200:
                raise RuntimeError('Public readiness exceeded twenty-minute deadline') from error
            atomic(self.folder(number) / 'public-check-error.txt', type(error).__name__ + ': ' + str(error))
            self.github.comment(number, f'**Preview checks pending** · `{sha[:12]}`. Apps are initialized; public DNS/TLS/browser acceptance has not passed yet. No migration replay is needed.')
            return False
        proof.update(browser_admin_login=True, synthetic_request=True, captured_email=True)
        self.current(number, sha)
        obsolete = entry.get('rollback_images', [])
        entry['rollback_images'] = entry['previous_images']
        entry.pop('pending_images', None)
        entry.update(status='ready', sha=sha, run=entry['candidate_run'], images=entry['candidate_images'], acceptance=proof, updated_at=time.time())
        entry.pop('failed_sha', None)
        self.save()
        self.track_images(obsolete)
        self.prune_images(obsolete)
        self.publish(number, sha, env)
        return True

    def track_images(self, candidates):
        for image in candidates:
            if re.fullmatch(r'sha256:[0-9a-f]{64}', image):
                self.gc['images'].setdefault(image, {'attempts': 0})
        write_json(self.gc_path, self.gc)

    def image_inventory(self):
        # A failed daemon query must never be interpreted as an empty inventory.
        ids = command(['docker', 'image', 'ls', '-aq', '--no-trunc']).split()
        if not ids:
            return {}
        return {i['Id']: i for i in json.loads(command(['docker', 'image', 'inspect', *sorted(set(ids))]))}

    def prune_images(self, candidates=()):
        self.track_images(candidates)
        inventory = self.image_inventory()
        # Recover only exact tags journaled before an import, not arbitrary host images.
        for tag, intent in list(self.gc['imports'].items()):
            for image, info in inventory.items():
                if tag in (info.get('RepoTags') or []):
                    self.track_images([image])
            del self.gc['imports'][tag]
        write_json(self.gc_path, self.gc)
        referenced = {image for e in self.entries.values()
                      for key in ('images', 'rollback_images', 'pending_images', 'candidate_images', 'previous_images')
                      for image in e.get(key, [])}
        failures = []
        for image, receipt in list(self.gc['images'].items()):
            if image in referenced:
                continue
            if image not in inventory:
                del self.gc['images'][image]
                continue
            try:
                # Never force removal, including when a stopped foreign container uses it.
                tags = inventory[image].get('RepoTags') or []
                if any(not re.fullmatch(r'chef-preview-(medusa|storefront):[0-9a-f]{40}', tag) for tag in tags):
                    raise RuntimeError('Image has an unowned tag; operator review required')
                users = command(['docker', 'ps', '-aq', '--filter', f'ancestor={image}']).strip()
                if users:
                    raise RuntimeError('Image is referenced by a container')
                # Docker refuses ID deletion with multiple tags; untag exact owned refs.
                for tag in tags:
                    command(['docker', 'image', 'rm', tag])
                if image in self.image_inventory():
                    command(['docker', 'image', 'rm', image])
                if image in self.image_inventory():
                    raise RuntimeError('Image remains after deletion')
                del self.gc['images'][image]
            except (RuntimeError, OSError, subprocess.SubprocessError):
                receipt['attempts'] += 1
                receipt['last_failure'] = time.time()
                failures.append(image)
            write_json(self.gc_path, self.gc)
        write_json(self.gc_path, self.gc)
        return failures

    def collect_garbage(self):
        # Caller holds controller.lock. No active controller import can exist here.
        for path in self.state.glob('import-*'):
            if path.is_dir() and not path.is_symlink():
                shutil.rmtree(path)
        for number, entry in self.entries.items():
            if entry.get('status') == 'failed' and entry.get('pending_images'):
                # No importer is running under this lock. Failed imports that never
                # reached an env file are not migration recovery images. Journal
                # before releasing protection, including legacy accumulated state.
                self.track_images(entry['pending_images'])
                recovery = load_env(self.envpath(number))
                recovery_images = {recovery.get(k) for k in ('MEDUSA_IMAGE', 'STOREFRONT_IMAGE')}
                previous = self.folder(number) / 'previous.env'
                if previous.exists():
                    recovery = load_env(previous)
                    recovery_images.update(recovery.get(k) for k in ('MEDUSA_IMAGE', 'STOREFRONT_IMAGE'))
                entry['pending_images'] = [image for image in entry['pending_images'] if image in recovery_images]
                self.save()
            self.track_images(image for field in ('images', 'rollback_images', 'pending_images', 'candidate_images', 'previous_images') for image in entry.get(field, []))
        failures = self.prune_images()
        inventory = self.image_inventory()
        untracked = [image for image, info in inventory.items() if image not in self.gc['images']
                     and any(re.fullmatch(r'chef-preview-(medusa|storefront):[0-9a-f]{40}', tag)
                             for tag in (info.get('RepoTags') or []))]
        # Single overwritten report, not an ever-growing event log.
        report = {'checked_at': time.time(), 'tracked_images': len(self.gc['images']),
                  'failed_images': failures, 'untracked_preview_images': untracked,
                  'status': 'needs_attention' if failures or untracked else 'ok'}
        write_json(self.state / 'gc-status.json', report)
        return report

    def verify_project_removed(self, env):
        project = 'chef-preview-' + env['PREVIEW_ID']
        for kind, args in (('containers', ['ps', '-aq']), ('volumes', ['volume', 'ls', '-q']), ('networks', ['network', 'ls', '-q'])):
            if command(['docker', *args, '--filter', f'label=com.docker.compose.project={project}']).strip():
                raise RuntimeError(f'Retirement incomplete: project {kind} remain')

    def publish(self, number, sha, env):
        self.current(number, sha)
        self.github.deployment(number, sha, 'success', {'storefront': env['STOREFRONT_URL'], 'admin': env['API_URL'] + '/app'})
        self.github.comment(number, f'**Preview ready** · `{sha[:12]}`\n\n[Storefront]({env["STOREFRONT_URL"]}) · [Admin]({env["API_URL"]}/app)\n\nSynthetic data only. Admin credentials are delivered privately, never in this comment.')


    def retire(self, number):
        pr = self.github.pr(number)
        # Draft/permission changes stop exposure but do not authorize deleting data.
        if pr['state'] != 'closed':
            raise RuntimeError('Refusing retirement of an open PR')
        entry = self.entries[number]
        env = entry.get('retirement_env') or load_env(self.envpath(number))
        self.cf.route(number, env, remove=True, delete_dns=True)
        if self.github.pr(number)['state'] != 'closed':
            self.cf.route(number, env)
            raise RuntimeError('PR reopened during retirement; data preserved')
        # Keep only routing/project identity, never credentials, for crash recovery.
        entry['retirement_env'] = {k: env[k] for k in ('PREVIEW_ID', 'API_PORT', 'STOREFRONT_PORT', 'API_URL', 'STOREFRONT_URL')}
        self.save()
        if self.envpath(number).exists():
            self.compose(number, 'down', '--volumes', '--remove-orphans')
        self.verify_project_removed(env)
        self.track_images(image for field in ('images', 'rollback_images', 'pending_images', 'candidate_images', 'previous_images') for image in entry.get(field, []))
        # Remove data before forgetting the entry. A crash here remains retryable.
        if self.folder(number).exists():
            shutil.rmtree(self.folder(number))
        self.github.deactivate_previews(number)
        self.github.comment(number, '**Preview retired** · PR closed or merged. Containers, volumes and private files removed; shared/in-use image cleanup is tracked separately.')
        del self.entries[number]
        self.save()
        self.prune_images()

    def fail(self, number, sha, error):
        # Never publish tokens, subprocess output or application payloads.
        entry = self.entries[number]
        entry.update(status='failed', failed_sha=sha, error_type=type(error).__name__)
        self.save()
        atomic(self.folder(number) / 'controller-error.txt', str(error))
        self.cf.route(number, load_env(self.envpath(number)), remove=True)
        self.compose(number, 'stop', 'proxy', 'medusa', 'storefront')
        self.github.deactivate_previews(number)
        self.github.comment(number, f'**Preview failed** · `{sha[:12]}`. Public routing is withdrawn; data is preserved. Operator diagnostics are private.')

    def reconcile(self, apply=False):
        prs = self.github.pages(f'repos/{self.config["repo"]}/pulls?state=open')
        if self.config.get('only_prs'):
            prs = [p for p in prs if p['number'] in self.config['only_prs']]
        selected, queued = choose(prs, self.entries, self.config['max_environments'], self.config['repo'])
        if not apply:
            return {'selected': selected, 'queued': queued, 'tracked': self.entries}
        if not self.config.get('enabled'):
            raise RuntimeError('Controller is disabled in operator config')
        self.cf = Cloudflare(self.config)
        # Do not infer a close from a list omission or a failed API call.
        for number in list(self.entries):
            pr = self.github.pr(number)
            if pr['state'] == 'closed':
                self.retire(number)
            elif self.entries[number].get('retirement_env'):
                raise RuntimeError('PR reopened after retirement began; operator recovery required')
            elif self.entries[number].get('status') == 'deploying':
                env = load_env(self.envpath(number))
                self.cf.route(number, env, remove=True)
                self.compose(number, 'stop', 'proxy', 'medusa', 'storefront')
                self.entries[number].update(status='failed', failed_sha=self.entries[number].get('attempt_sha'), error_type='InterruptedDeployment')
                self.save()
                self.github.deactivate_previews(number)
                self.github.comment(number, '**Preview interrupted** · Routing is withdrawn and data preserved. Operator recovery is required before retrying this head.')
            elif not trusted(pr, self.config['repo']):
                env = load_env(self.envpath(number))
                self.cf.route(number, env, remove=True)
                self.compose(number, 'stop')
                self.github.deactivate_previews(number)
                self.entries[number]['status'] = 'suspended'
                self.save()
        gc_report = self.collect_garbage()
        if self.entries:
            self.disk_guard()
        builds = {}
        deployable = []
        for pr in prs:
            if not trusted(pr, self.config['repo']):
                continue
            number, sha = str(pr['number']), pr['head']['sha']
            self.current(number, sha)
            builds[number] = self.github.build(sha)
            if number in self.entries or builds[number]:
                deployable.append(pr)
            else:
                self.github.comment(number, '**Preview awaiting build** · No successful current-head preview build is available yet.')
        selected, queued = choose(deployable, self.entries, self.config['max_environments'], self.config['repo'])
        by_number = {str(p['number']): p for p in prs}
        for number in queued:
            self.github.comment(number, '**Preview queued** · The two-environment pool is full. A slot becomes available when an active PR closes.')
        for number in selected:
            sha = by_number[number]['head']['sha']
            self.current(number, sha)
            entry = self.entries.get(number, {})
            if entry.get('status') == 'ready' and entry.get('sha') == sha:
                if entry.get('admin_login_version') != 1:
                    self.configure_admin(number, running=True)
                env = load_env(self.envpath(number))
                self.sync_ai(number, recreate=True)
                self.publish(number, sha, env)
                continue
            if entry.get('status') == 'awaiting_public' and entry.get('candidate_sha') == sha:
                try:
                    self.finalize(number)
                except Exception as error:
                    if self.entries[number].get('status') == 'ready':
                        raise
                    self.fail(number, sha, error)
                continue
            if entry.get('failed_sha') == sha:
                continue  # No endless retries of bad migrations; explicit retry required.
            run = builds[number]
            if not run:
                self.github.comment(number, '**Preview awaiting build** · No successful current-head preview build is available yet.')
                continue
            if not entry:
                self.allocate(number)
            try:
                self.sync_ai(number)
                self.capacity_guard()
                self.github.deployment(number, sha, 'in_progress')
                self.entries[number]['previous_status'] = self.entries[number]['status']
                self.entries[number]['attempt_sha'] = sha
                self.entries[number]['status'] = 'deploying'
                self.save()
                self.github.comment(number, f'**Preview deploying** · `{sha[:12]}`. Links appear after acceptance passes.')
                self.deploy(number, sha, run)
            except Exception as e:
                if self.entries[number].get('status') == 'ready':
                    raise
                self.fail(number, sha, e)
        return {'gc': gc_report, 'selected': selected, 'queued': queued, 'statuses': {k: e['status'] for k, e in self.entries.items()}}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--gc-only', action='store_true', help='Inspect storage, or collect with --apply, without deployment/provider calls')
    args = parser.parse_args()
    os.umask(0o077)
    config = json.loads(args.config.read_text())
    state = Path(config['state_dir']).expanduser().resolve()
    state.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (state / 'controller.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        controller = Controller(config, state)
        if args.gc_only:
            if args.apply:
                if not config.get('enabled'):
                    raise RuntimeError('Controller is disabled in operator config')
                result = controller.collect_garbage()
            else:
                result = {'journal': controller.gc, 'image_ids': sorted(controller.image_inventory())}
        else:
            result = controller.reconcile(args.apply)
        print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
