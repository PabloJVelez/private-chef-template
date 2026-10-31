#!/usr/bin/env python3
"""Trusted evidence and COMMENT transport for the installed OpenClaw pr-review skill."""

import posixpath
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tempfile
from urllib import error, request

POLICY = "openclaw-v3"
MAX_FILE = 32_000
MAX_CONTEXT = 300_000
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
            return {"omitted": "file exceeds 32 KB"}
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
                "limitations": ["Static partial review; no PR code or tests executed by the reviewer.",
                                "Related sources are bounded static discovery, not exhaustive consumer analysis.",
                                "Resolved-thread state is unavailable."]}
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
    discovered = []
    for path in paths:
        item = {"path": path, "before": objects.blob(merge, path), "after": objects.blob(head, path)}
        # Full before/after already describe the change. Do not duplicate them in
        # a diff (especially new files, which previously consumed twice the space).
        size = len(json.dumps(item).encode())
        if used + size > MAX_CONTEXT * 2 // 3:
            evidence["coverage"]["omitted_changed_paths"].append(path)
            continue  # A large earlier file must not starve small later files.
        evidence["files"].append(item)
        used += size
        for value in (item["after"], item["before"]):
            if value and "text" in value:
                discovered += [("test" in path, p) for p in related_paths(path, value["text"], tree)]
        if any(value and "omitted" in value for value in (item["before"], item["after"])):
            evidence["coverage"]["omitted_changed_paths"].append(path)
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
    seen = set(paths)
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
            queue += related_paths(path, value["text"], tree)
        elif value:
            evidence["coverage"]["omitted_related_paths"].append(path)
    if any(evidence["coverage"].values()):
        evidence["limitations"].append("Some source exceeds file/context budget or is non-text; see explicit coverage omissions.")
    require(len(json.dumps(evidence).encode()) <= MAX_CONTEXT, "Source manifest exceeds context budget; split this PR")
    return evidence


def ci_snapshot(api, sha):
    """Authenticated metadata only; never interpret a queue success as tests."""
    checks = api.pages(f"commits/{sha}/check-runs?filter=latest", "check_runs")
    statuses = api.pages(f"commits/{sha}/statuses")
    latest = {}
    for status in statuses:  # GitHub returns newest first, one active value per context.
        latest.setdefault(status.get("context"), status)
    result = {
        "checks": [{k: r.get(k) for k in ("id", "name", "status", "conclusion", "details_url", "head_sha")}
                   for r in checks],
        "statuses": [{k: r.get(k) for k in ("id", "context", "state", "target_url", "sha")}
                     for r in latest.values()],
    }
    require(all(r.get("head_sha") == sha for r in checks) and
            all(r.get("sha") == sha for r in latest.values()), "CI metadata revision mismatch")
    result["pending"] = any(r.get("status") != "completed" for r in checks) or any(
        r.get("state") == "pending" for r in latest.values())
    result["fingerprint"] = hashlib.sha256(json.dumps(result, sort_keys=True).encode()).hexdigest()
    return result


def ci_evidence(api, sha, snapshot):
    """Expose completed job steps and artifact provenance, not author summaries.

    Artifact payloads are not downloaded/extracted and PR code is never executed.
    Metadata can establish hosted execution, not independent test correctness.
    """
    result = dict(snapshot, workflow_runs=[], limitations=[])
    runs = api.pages(f"actions/runs?head_sha={sha}", "workflow_runs")
    runs = [r for r in runs if r.get("head_sha") == sha]
    if len(runs) > 8:
        result["limitations"].append("Workflow metadata limited to eight newest exact-head runs.")
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
        result["workflow_runs"].append(item)
    result["limitations"].append("Job logs and artifact contents were not downloaded; metadata is hosted evidence, not reviewer execution.")
    return result


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
    with tempfile.TemporaryDirectory(prefix="pr-review-objects-") as temp:
        objects = Objects(Path(temp))
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
    # Discussion is also untrusted, potentially unbounded data. Disclose omissions.
    for key in ("description", "prior_reviews", "discussion", "inline_comments", "checks", "statuses", "verification"):
        if len(json.dumps(evidence.get(key)).encode()) > 40_000:
            evidence.pop(key, None)
            evidence["limitations"].append(f"{key} omitted: exceeds 40 KB context budget.")
    write_json(directory / "input.json", evidence)
    write_json(directory / "contract.json", contract)
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
    body = ("## Automated partial review\n\n" + review +
            f"\n\n---\nReviewed head `{contract['head_sha']}` against "
            f"`{contract['base_ref']}` (`{contract['base_sha']}`).\n"
            "Static model review only; PR code and tests were not executed. "
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
