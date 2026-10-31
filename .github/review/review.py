#!/usr/bin/env python3
"""Trusted evidence and COMMENT transport for the installed OpenClaw pr-review skill."""

import difflib
import io
import stat
import zipfile
import posixpath
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tempfile
from urllib import error, parse, request

POLICY = "openclaw-v4"
MAX_FILE = 128_000
MAX_CONTEXT = 400_000
MAX_INVESTIGATION = 600_000
MAX_REVIEW = 40_000
SHA = re.compile(r"[0-9a-f]{40}\Z")


class Failure(Exception):
    pass


def require(condition, message):
    if not condition:
        raise Failure(message)


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise Failure("Unexpected HTTP redirect; credentials were not forwarded")


def http_json(url, token, payload=None):
    req = request.Request(
        url,
        data=None if payload is None else json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                 "Accept": "application/vnd.github+json" if url.startswith("https://api.github.com/")
                 else "application/json", "User-Agent": "private-chef-pr-review"},
    )
    try:
        with request.build_opener(NoRedirect).open(req, timeout=300) as response:
            data = response.read(8_000_001)
        require(len(data) <= 8_000_000, "API response too large")
        return json.loads(data)
    except error.HTTPError as exc:
        # Error bodies can echo untrusted source or credentials. Never log them.
        raise Failure(f"API request failed with HTTP {exc.code}") from None


class GitHub:
    def __init__(self, repository, token):
        require(re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository), "Invalid repository")
        self.repository, self.token = repository, token

    def get(self, path):
        return http_json(f"https://api.github.com/repos/{self.repository}/{path}", self.token)

    def pages(self, path, key=None):
        items = []
        for page in range(1, 31):
            value = self.get(f"{path}{'&' if '?' in path else '?'}per_page=100&page={page}")
            batch = value[key] if key else value
            require(isinstance(batch, list), "Unexpected paginated API response")
            items.extend(batch)
            if len(batch) < 100:
                return items
        raise Failure("API pagination limit reached; refusing incomplete identity/deduplication data")

    def review_threads(self, number):
        owner, name = self.repository.split('/')
        query = """query($owner:String!,$name:String!,$number:Int!,$cursor:String){
          repository(owner:$owner,name:$name){pullRequest(number:$number){
            reviewThreads(first:100,after:$cursor){nodes{id isResolved isOutdated path line
              comments(first:1){nodes{id url}}} pageInfo{hasNextPage endCursor}}}}}"""
        records, cursor = [], None
        for _ in range(10):
            response = http_json('https://api.github.com/graphql', self.token,
                {'query': query, 'variables': {'owner': owner, 'name': name, 'number': number, 'cursor': cursor}})
            require(not response.get('errors'), 'Review-thread metadata unavailable')
            page = response['data']['repository']['pullRequest']['reviewThreads']
            records.extend(page['nodes'])
            if not page['pageInfo']['hasNextPage']: return records
            cursor = page['pageInfo']['endCursor']
        raise Failure('Review-thread pagination limit')

    def post_review(self, number, payload):
        return http_json(f"https://api.github.com/repos/{self.repository}/pulls/{number}/reviews",
                         self.token, payload)


def identity(pr, repository):
    require(pr["base"]["repo"]["full_name"].lower() == repository.lower(), "Wrong base repository")
    require(SHA.fullmatch(pr["base"]["sha"]) and SHA.fullmatch(pr["head"]["sha"]), "Invalid SHA")
    return {"repository": repository, "repository_id": pr["base"]["repo"]["id"],
            "number": pr["number"], "base_ref": pr["base"]["ref"],
            "base_sha": pr["base"]["sha"], "head_sha": pr["head"]["sha"],
            "draft": bool(pr["draft"]), "policy": POLICY}


def marker(contract):
    digest = hashlib.sha256(json.dumps(contract, sort_keys=True).encode()).hexdigest()
    return f"<!-- auto-pr-review:{POLICY}:{digest} -->"


def duplicate(reviews, contract, actor_id=None):
    return next((r for r in reviews if (r.get("user", {}).get("id") == actor_id if actor_id is not None else
                     r.get("user", {}).get("login") == "github-actions[bot]"
                     and r.get("user", {}).get("type") == "Bot")
                 and r.get("state") == "COMMENTED" and r.get("commit_id") == contract["head_sha"]
                 and marker(contract) in (r.get("body") or "")), None)


class Objects:
    """Read blobs in a bare repository. No working tree, filters, hooks or submodules."""
    def __init__(self, path):
        self.path = path
        self.env = {"PATH": os.defpath, "HOME": str(path), "LANG": "C.UTF-8",
                    "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null",
                    "GIT_TERMINAL_PROMPT": "0", "GIT_NO_REPLACE_OBJECTS": "1",
                    "GIT_LITERAL_PATHSPECS": "1"}
        self.run("init", "--bare", str(path))

    def run(self, *args, limit=2_000_000):
        with tempfile.TemporaryFile() as output:
            try:
                subprocess.run(["git", "-c", "core.hooksPath=/dev/null", "-C", str(self.path), *args],
                               env=self.env, stdout=output, stderr=subprocess.DEVNULL,
                               check=True, timeout=120)
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
                raise Failure("Git object operation failed; no PR code was executed") from None
            require(output.tell() <= limit, "Git object output exceeds review limit")
            output.seek(0)
            return output.read()

    def blob(self, revision, path):
        entries = self.run("ls-tree", "-z", revision, "--", path).split(b"\0")
        entry = next((e for e in entries if e and e.split(b"\t", 1)[1].decode() == path), None)
        if not entry:
            return None
        mode, kind, oid = entry.split(b"\t", 1)[0].decode().split()
        if kind != "blob" or mode not in ("100644", "100755"):
            return {"omitted": "symlink, submodule or non-regular object"}
        if int(self.run("cat-file", "-s", oid)) > MAX_FILE:
            return {"omitted": "file exceeds bounded read limit"}
        raw = self.run("cat-file", "blob", oid, limit=MAX_FILE)
        try:
            require(b"\0" not in raw, "binary file")
            return {"text": raw.decode("utf-8")}
        except (UnicodeDecodeError, Failure):
            return {"omitted": "binary or non-UTF-8 file"}


def related_paths(path, text, tree):
    """Bounded static discovery only: never resolve host paths or run PR code."""
    candidates = []
    # Relative source imports and Markdown references. Ignore URLs and escapes.
    refs = re.findall(r"(?:from\s*|require\s*\(|import\s*\()?[\"'](\.[^\"'\n]+)[\"']", text)
    if path.endswith(".md"):
        refs += re.findall(r"\]\(([^)#\s]+)(?:#[^)]*)?\)", text)
    for ref in refs:
        if ":" in ref or ref.startswith("/"):
            continue
        target = posixpath.normpath(posixpath.join(posixpath.dirname(path), ref))
        if target == ".." or target.startswith("../"):
            continue
        for suffix in ("", ".ts", ".tsx", ".js", ".cjs", ".json", "/index.ts", "/index.tsx", "/index.js"):
            if target + suffix in tree:
                candidates.append(target + suffix)
                break
    return candidates


def source_context(objects, contract):
    base, head = contract["base_sha"], contract["head_sha"]
    merge = objects.run("merge-base", base, head).decode().strip()
    require(SHA.fullmatch(merge), "Invalid merge-base")
    raw = objects.run("diff", "--no-ext-diff", "--no-textconv", "--no-renames",
                      "--name-only", "-z", merge, head)
    paths = [p.decode("utf-8") for p in raw.split(b"\0") if p]
    require(len(paths) <= 3000, "Over 3000 changed paths; split this PR for automated review")
    tree = set(objects.run("ls-tree", "-r", "--name-only", "-z", head).decode().split("\0"))
    evidence = {"merge_base": merge, "changed_paths": paths, "files": [], "base_guidance": {},
                "related_sources": [], "coverage": {"omitted_changed_paths": [], "omitted_related_paths": []},
                "limitations": ["No PR code or tests executed by the reviewer; hosted execution is separate evidence.",
                                "Related sources are bounded static discovery, not exhaustive consumer analysis.",
                                "Further callers can be inspected through bounded evidence requests."]}
    # Reserve reference space; never spend everything on alphabetical early files.
    guidance = {"AGENTS.md", "REVIEW.md"}
    for path in paths:
        for parent in PurePosixPath(path).parents:
            guidance.update(str(parent / name) for name in ("AGENTS.md", "REVIEW.md"))
    used = len(json.dumps(evidence).encode())
    for path in sorted(guidance):
        value = objects.blob(base, path)
        if value:
            size = len(json.dumps({path: value}).encode())
            if used + size > min(24_000, MAX_CONTEXT // 10):
                evidence["limitations"].append(f"Base guidance omitted due to budget: {path}")
                continue
            evidence["base_guidance"][path] = value
            used += size
    discovered, deferred = [], []
    for path in paths:
        item = {"path": path, "before": objects.blob(merge, path), "after": objects.blob(head, path)}
        # Preserve full head context, but avoid repeating the unchanged base.
        # The complete unified delta retains deletions and exact line anchors.
        before, after = item["before"], item["after"]
        if before and after and "text" in before and "text" in after:
            delta = "".join(difflib.unified_diff(before["text"].splitlines(keepends=True),
                after["text"].splitlines(keepends=True), fromfile="base/" + path,
                tofile="head/" + path, n=5))
            if len(delta.encode()) < len(before["text"].encode()):
                item["before"] = {"diff_from_base": delta, "full_blob_available": True}
        size = len(json.dumps(item).encode())
        if used + size > MAX_CONTEXT * 2 // 3:
            evidence["coverage"]["omitted_changed_paths"].append(path)
            deferred.append(item)
            continue  # A large earlier file must not starve small later files.
        evidence["files"].append(item)
        used += size
        for value in (item["after"], item["before"]):
            if value and "text" in value:
                discovered += [("test" in path, p) for p in related_paths(path, value["text"], tree)]
        if any(value and "omitted" in value for value in (item["before"], item["after"])):
            evidence["coverage"]["omitted_changed_paths"].append(path)
    # Recover deferred changes before optional references, retaining their full delta.
    for item in deferred:
        size = len(json.dumps(item).encode())
        if used + size > MAX_CONTEXT - 16_000: continue
        evidence['files'].append(item)
        used += size
        if not any(v and 'omitted' in v for v in (item['before'], item['after'])):
            evidence['coverage']['omitted_changed_paths'].remove(item['path'])
        for value in (item['after'], item['before']):
            if value and 'text' in value:
                discovered += [('test' in item['path'], p) for p in related_paths(item['path'], value['text'], tree)]
    # Manifests, runtime declarations and module-level guard/migration siblings
    # provide the context missing from imports alone. They remain untrusted data.
    supplemental = ["package.json", ".nvmrc", ".yarnrc.yml"]
    for path in paths:
        for parent in PurePosixPath(path).parents:
            supplemental += [str(parent / "package.json"), str(parent / "medusa-config.ts")]
        match = re.match(r"(.*/src/modules/[^/]+)/", path)
        if match:
            module = match[1]
            supplemental += [module + "/feature-controls.ts", module + "/index.ts", module + "/service.ts"]
            supplemental += sorted(p for p in tree if p.startswith(module + "/migrations/") and p.endswith(".ts"))
    queue = list(dict.fromkeys([p for test, p in discovered if not test] + supplemental +
                              [p for test, p in discovered if test]))
    seen = {f["path"] for f in evidence["files"] if f["path"] not in evidence["coverage"]["omitted_changed_paths"]}
    inspected = 0
    while queue:
        path = queue.pop(0)
        if path in seen or path not in tree:
            continue
        seen.add(path)
        if inspected >= 80:
            evidence["coverage"]["omitted_related_paths"].append(path)
            continue
        inspected += 1
        value = objects.blob(head, path)
        item = {"path": path, "revision": head, "content": value}
        size = len(json.dumps(item).encode())
        if used + size > MAX_CONTEXT - 16_000:
            evidence["coverage"]["omitted_related_paths"].append(path)
            continue
        evidence["related_sources"].append(item)
        used += size
        if value and "text" in value:
            # Config imports register unrelated modules; do not recursively fan out through them.
            if not path.endswith("medusa-config.ts"):
                queue += related_paths(path, value["text"], tree)
        elif value:
            evidence["coverage"]["omitted_related_paths"].append(path)
    if any(evidence["coverage"].values()):
        evidence["limitations"].append("Some source exceeds file/context budget or is non-text; see explicit coverage omissions.")
    require(len(json.dumps(evidence).encode()) <= MAX_CONTEXT, "Source manifest exceeds context budget; split this PR")
    return evidence


def ci_snapshot(api, sha):
    """Authenticated metadata only; never interpret a queue success as tests."""
    require(isinstance(sha, str) and SHA.fullmatch(sha), "Invalid CI revision")
    checks = api.pages(f"commits/{sha}/check-runs?filter=latest", "check_runs")
    statuses = api.pages(f"commits/{sha}/statuses")
    latest = {}
    for status in statuses:  # GitHub returns newest first, one active value per context.
        latest.setdefault(status.get("context"), status)
    result = {
        "checks": [{k: r.get(k) for k in ("id", "name", "status", "conclusion", "details_url", "head_sha")}
                   for r in checks],
        # Legacy status objects have no SHA; provenance is the pinned request.
        "queried_head_sha": sha,
        "statuses": [{k: r.get(k) for k in ("id", "context", "state", "target_url")}
                     for r in latest.values()],
    }
    require(all(r.get("head_sha") == sha for r in checks), "CI metadata revision mismatch")
    result["pending"] = any(r.get("status") != "completed" for r in checks) or any(
        r.get("state") == "pending" for r in latest.values())
    # Artifact deletion/replacement/expiry and workflow reruns also invalidate drafts.
    runs = api.pages(f"actions/runs?head_sha={sha}", "workflow_runs")
    result['artifact_inventory'] = []
    for run in runs[:8]:
        if run.get('head_sha') != sha: continue
        artifacts = api.pages(f"actions/runs/{int(run['id'])}/artifacts", "artifacts")
        result['artifact_inventory'].append({'run_id': run['id'], 'attempt': run.get('run_attempt'),
            'status': run.get('status'), 'conclusion': run.get('conclusion'),
            'artifacts': [{k: a.get(k) for k in ('id', 'digest', 'expired', 'size_in_bytes')} for a in artifacts]})
    result["fingerprint"] = hashlib.sha256(json.dumps(result, sort_keys=True).encode()).hexdigest()
    return result


def artifact_bytes(api, artifact):
    """Bounded signed download; repository token never reaches the storage host."""
    require(type(artifact.get('id')) is int and artifact['id'] > 0, 'Invalid artifact ID')
    require(not artifact.get('expired') and 0 < artifact.get('size_in_bytes', 0) <= 2_000_000,
            'Expired or oversized evidence artifact')
    req = request.Request(f'https://api.github.com/repos/{api.repository}/actions/artifacts/{artifact["id"]}/zip',
        headers={'Authorization': f'Bearer {api.token}', 'User-Agent': 'openclaw-pr-review'})
    class SignedRedirect(request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs): return None
    try:
        request.build_opener(SignedRedirect).open(req, timeout=30).close()
    except error.HTTPError as exc:
        require(exc.code == 302, 'Evidence artifact requires signed redirect')
        location = exc.headers.get('Location', '')
    else:
        raise Failure('Evidence artifact omitted signed redirect')
    host = parse.urlsplit(location)
    require(host.scheme == 'https' and not host.username and not host.password and
            host.port in (None, 443) and host.hostname and
            (host.hostname.endswith('.blob.core.windows.net') or host.hostname.endswith('.githubusercontent.com')),
            'Unexpected evidence artifact host')
    with request.build_opener(NoRedirect).open(location, timeout=60) as response:
        raw = response.read(2_000_001)
    require(len(raw) <= 2_000_000, 'Oversized evidence artifact download')
    require(artifact.get('digest') == 'sha256:' + hashlib.sha256(raw).hexdigest(), 'Evidence digest mismatch')
    return raw


def inspect_artifact(raw, sha):
    """Read untrusted reports, never extract or execute archive contents."""
    result = {'entries': [], 'reports': {}, 'limitations': [], 'head_binding': 'workflow metadata only'}
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            entries = archive.infolist()
            require(len(entries) <= 80 and len({e.filename for e in entries}) == len(entries),
                    'Too many or duplicate archive entries')
            require(sum(e.file_size for e in entries) <= 12_000_000, 'Expanded artifact too large')
            texts = {}
            for entry in entries:
                path = PurePosixPath(entry.filename)
                require(not path.is_absolute() and '..' not in path.parts and '\\' not in entry.filename and
                        not stat.S_ISLNK(entry.external_attr >> 16) and not (entry.flag_bits & 1),
                        'Unsafe archive member')
                require(entry.file_size <= 3_000_000, 'Archive member too large')
                result['entries'].append({'path': entry.filename, 'bytes': entry.file_size, 'crc': entry.CRC})
                if entry.is_dir(): continue
                if path.suffix not in ('.txt', '.json', '.log', '.xml'):
                    result['limitations'].append('Unsupported report: ' + entry.filename); continue
                data = archive.read(entry)
                require(len(data) == entry.file_size and b'\0' not in data, 'Invalid text report')
                text = data.decode('utf-8')
                if path.name == 'head.txt':
                    require(text.strip() == sha, 'Artifact head.txt mismatch')
                    result['head_binding'] = 'workflow metadata and matching head.txt'
                if path.suffix == '.json':
                    obj = json.loads(text)
                    if isinstance(obj, dict) and 'testResults' in obj:
                        totals = ('success', 'numTotalTests', 'numPassedTests', 'numFailedTests',
                                  'numPendingTests', 'numTodoTests', 'numRuntimeErrorTestSuites')
                        summary = {k: obj.get(k) for k in totals}
                        summary['suites'] = []
                        for suite in obj['testResults'][:100]:
                            assertions = suite.get('assertionResults', [])
                            summary['suites'].append({'name': suite.get('name'), 'status': suite.get('status'),
                                'assertion_count': len(assertions),
                                'nonpassing': [{k: a.get(k) for k in ('fullName', 'status', 'failureMessages')}
                                               for a in assertions if a.get('status') != 'passed'][:20]})
                        summary['details'] = 'Passing assertion details omitted; inspect test source. Nonpassing details bounded to 20 per suite; suites to 100.'
                        result['reports'][entry.filename] = summary
                        continue
                texts[entry.filename] = text
                # Logs remain explicitly excerpts, never described as complete execution proof.
                limit = 5000 if path.suffix == '.log' else 10000
                result['reports'][entry.filename] = {'text': text if len(text) <= limit else text[:limit//2] + '\n[...omitted...]\n' + text[-limit//2:],
                    'truncated': len(text) > limit}
            for name, text in texts.items():
                if name.endswith('upgrade-before.json'):
                    after = name.removesuffix('upgrade-before.json') + 'upgrade-after.json'
                    if after in texts:
                        result['parent_row_hashes_equal'] = text == texts[after]
    except (zipfile.BadZipFile, UnicodeDecodeError, ValueError, RuntimeError) as exc:
        raise Failure('Invalid evidence archive/report: ' + type(exc).__name__) from None
    require(len(json.dumps(result).encode()) <= 80_000, 'Parsed artifact evidence exceeds budget')
    return result


def ci_evidence(api, sha, snapshot):
    """Inspect bounded exact-head reports, preserving failures and provenance."""
    result = dict(snapshot, workflow_runs=[], limitations=[])
    runs = api.pages(f"actions/runs?head_sha={sha}", "workflow_runs")
    runs = [r for r in runs if r.get("head_sha") == sha]
    if len(runs) > 8:
        result["limitations"].append("Workflow metadata limited to eight newest exact-head runs.")
    downloaded, report_bytes = 0, 0
    for run in runs[:8]:
        item = {k: run.get(k) for k in ("id", "name", "path", "event", "head_sha", "status", "conclusion", "html_url", "run_attempt")}
        jobs = api.pages(f"actions/runs/{int(run['id'])}/jobs?filter=latest", "jobs")
        item["jobs"] = [{k: j.get(k) for k in ("id", "name", "status", "conclusion", "html_url", "steps")}
                        for j in jobs[:40]]
        if len(jobs) > 40:
            result["limitations"].append("Workflow jobs limited to 40 per run.")
        artifacts = api.pages(f"actions/runs/{int(run['id'])}/artifacts", "artifacts")
        item["artifacts"] = [{k: a.get(k) for k in ("id", "name", "size_in_bytes", "digest", "expired", "workflow_run")}
                             for a in artifacts[:40]]
        if len(artifacts) > 40:
            result["limitations"].append("Artifact metadata limited to 40 per run.")
        item["artifact_contents"] = []
        for artifact in artifacts[:40]:
            if artifact.get('name', '').startswith('openclaw-review-request-'):
                continue  # Queue transport is not application verification.
            if downloaded >= 3:
                result['limitations'].append('Artifact download budget reached'); break
            try:
                provenance = artifact.get('workflow_run') or {}
                require(provenance.get('head_sha') == sha and provenance.get('id') == run['id'],
                        'Evidence artifact workflow/head mismatch')
                downloaded += 1
                raw = artifact_bytes(api, artifact)
                inspected = {'id': artifact['id'], 'digest': artifact['digest'],
                    'inspection': inspect_artifact(raw, sha)}
                size = len(json.dumps(inspected).encode())
                require(report_bytes + size <= 85_000, 'Combined report-content budget exceeded')
                report_bytes += size
                item['artifact_contents'].append(inspected)
            except (Failure, OSError) as exc:
                # Never log transport exception bodies or signed locations.
                result['limitations'].append('Artifact ' + str(artifact.get('id')) + ': ' +
                    (str(exc) if isinstance(exc, Failure) else 'download unavailable'))
        result["workflow_runs"].append(item)
    result["limitations"].append("Artifact reports are inspected where supplied above; excerpts/omissions are explicit. Hosted execution is not reviewer-local execution. Raw workflow logs are not fetched separately.")
    return result


def additional_evidence(directory, evidence, request_data):
    """Model asks for data, never commands/tools. All reads stay in pinned Git objects."""
    require(isinstance(request_data, dict) and set(request_data) <= {'paths', 'queries'}, 'Invalid evidence request')
    paths, queries = request_data.get('paths', []), request_data.get('queries', [])
    require(isinstance(paths, list) and isinstance(queries, list) and 0 < len(paths) + len(queries) <= 8,
            'Evidence request must contain 1..8 reads/searches')
    objects = Objects(directory / 'objects')
    contract = evidence['contract']
    output = {'request': request_data, 'sources': [], 'searches': []}
    for item in paths:
        require(isinstance(item, dict) and set(item) == {'revision', 'path'} and
                item['revision'] in ('base', 'head'), 'Invalid requested revision')
        path = item['path']
        require(isinstance(path, str) and 0 < len(path) <= 1024 and not path.startswith('/') and
                '..' not in PurePosixPath(path).parts and '\0' not in path, 'Invalid requested path')
        sha = contract[item['revision'] + '_sha']
        output['sources'].append({'path': path, 'revision': sha, 'content': objects.blob(sha, path)})
    for query in queries:
        require(isinstance(query, str) and 0 < len(query) <= 160 and '\0' not in query and '\n' not in query,
                'Invalid literal search')
        try:
            found = objects.run('grep', '-n', '-I', '-F', '--no-textconv', '-e', query,
                                contract['head_sha'], '--', limit=20_000).decode('utf-8')
            output['searches'].append({'query': query, 'matches': found})
        except Failure:
            output['searches'].append({'query': query, 'limitation': 'No results, search failed, or result exceeds 20 KB; narrow the query.'})
    evidence.setdefault('investigation', []).append(output)
    require(len(json.dumps(evidence).encode()) <= MAX_INVESTIGATION, 'Investigation evidence budget exhausted; operator review required')
    return evidence


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=True), encoding="utf-8")


def prepare(api, number, event, directory, ci=None):
    pr = api.get(f"pulls/{number}")
    require(pr["number"] == number, "PR number mismatch")
    contract = identity(pr, api.repository)
    if pr["state"] != "open":
        write_json(directory / "result.json", {"skip": "PR is closed"})
        return
    if "pull_request" in event and identity(event["pull_request"], api.repository) != contract:
        write_json(directory / "result.json", {"skip": "Event revisions are stale; use a new event or manual dispatch"})
        return
    reviews = api.pages(f"pulls/{number}/reviews")
    if duplicate(reviews, contract, getattr(api, "actor_id", None)):
        write_json(directory / "result.json", {"skip": "This revision pair already has a review"})
        return
    object_path = directory / "objects"
    object_path.mkdir()
    objects = Objects(object_path)
    # Public repository: anonymous fetch, no stored GitHub credential. PR ref is
    # fixed from the validated numeric ID; never use a contributor-supplied URL.
    objects.run("fetch", "--no-tags", f"https://github.com/{api.repository}.git",
                f"{contract['base_sha']}:refs/review/base",
                f"refs/pull/{number}/head:refs/review/head", limit=1000)
    require(objects.run("rev-parse", "refs/review/head").decode().strip() == contract["head_sha"],
            "Head moved during fetch; dispatch again")
    evidence = source_context(objects, contract)
    evidence.update({"contract": contract, "title": pr["title"], "description": pr.get("body"),
                     "prior_reviews": [{k: r.get(k) for k in ("body", "commit_id", "state", "html_url")}
                                       for r in reviews]})
    snapshot = ci if ci is not None else ci_snapshot(api, contract["head_sha"])
    require(not snapshot["pending"], "CI is still running; defer review")
    evidence["ci_fingerprint"] = snapshot["fingerprint"]
    evidence["checks"], evidence["statuses"] = snapshot["checks"], snapshot["statuses"]
    try:
        evidence["verification"] = ci_evidence(api, contract["head_sha"], snapshot)
    except Failure:
        evidence["limitations"].append("Hosted job/artifact metadata unavailable.")
    for label, path, key in [
        ("discussion", f"issues/{number}/comments", None),
        ("inline_comments", f"pulls/{number}/comments", None),
    ]:
        try:
            records = api.pages(path, key)
            evidence[label] = [{k: r.get(k) for k in
                                ("body", "path", "line", "commit_id", "html_url", "name",
                                 "status", "conclusion", "state", "context", "description") if k in r}
                               for r in records]
        except Failure:
            evidence["limitations"].append(f"{label} unavailable or exceeds pagination limit.")
    try:
        evidence['review_threads'] = api.review_threads(number)
    except (Failure, OSError, AttributeError):
        evidence['limitations'].append('Resolved-thread metadata unavailable.')
    # Discussion is also untrusted, potentially unbounded data. Disclose omissions.
    for key in ("description", "prior_reviews", "discussion", "inline_comments", "review_threads", "checks", "statuses", "verification"):
        if len(json.dumps(evidence.get(key)).encode()) > (120_000 if key == "verification" else 40_000):
            evidence.pop(key, None)
            evidence["limitations"].append(f"{key} omitted: exceeds 40 KB context budget.")
    write_json(directory / "input.json", evidence)
    write_json(directory / "contract.json", contract)
    require(not evidence.get("coverage", {}).get("omitted_changed_paths"),
            "Incomplete changed-source coverage; operator investigation required, no scored review published")
    print(f"Prepared PR #{number} at {contract['head_sha']} against {contract['base_sha']}")


def publish(api, number, result, run_url):
    if "skip" in result:
        print("Review skipped by preparation gate")
        return
    contract, review = result["contract"], result["review"]
    require(contract["number"] == number and contract["repository"] == api.repository, "Wrong review target")
    require(isinstance(review, str) and 0 < len(review.encode()) <= MAX_REVIEW, "Invalid review text")
    reviews = api.pages(f"pulls/{number}/reviews")
    if duplicate(reviews, contract, getattr(api, "actor_id", None)):
        print("Already published; no duplicate review")
        return
    # Final live read after pagination, as close as possible to the write.
    pr = api.get(f"pulls/{number}")
    if pr["state"] != "open" or identity(pr, api.repository) != contract:
        print("Review is stale or PR closed; nothing published")
        return
    body = ("## PR review\n\n" + review +
            f"\n\n---\nReviewed head `{contract['head_sha']}` against "
            f"`{contract['base_ref']}` (`{contract['base_sha']}`).\n"
            "Source and hosted-evidence review; PR code/tests were not executed by the reviewer. "
            "This COMMENT does not approve or authorize merging.\n"
            f"[Workflow run]({run_url})\n\n{marker(contract)}")
    try:
        posted = api.post_review(number, {"commit_id": contract["head_sha"], "event": "COMMENT", "body": body})
    except (Failure, OSError):
        # A timeout may mean the write succeeded. Reconcile once; never retry POST.
        posted = duplicate(api.pages(f"pulls/{number}/reviews"), contract, getattr(api, "actor_id", None))
        require(posted, "Publication failed or is uncertain. Check remote reviews before rerunning; POST was not retried")
    require(posted.get("html_url"), "Publication returned no review URL")
    print(f"Published COMMENT: {posted['html_url']}")
    return posted["html_url"]
