#!/usr/bin/env python3
"""Tool-free PR review. Standard library only; never execute or check out PR code."""

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tempfile
from urllib import error, parse, request

POLICY = "v1"
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


def duplicate(reviews, contract):
    return next((r for r in reviews if r.get("user", {}).get("login") == "github-actions[bot]"
                 and r.get("user", {}).get("type") == "Bot"
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


def source_context(objects, contract):
    base, head = contract["base_sha"], contract["head_sha"]
    merge = objects.run("merge-base", base, head).decode().strip()
    require(SHA.fullmatch(merge), "Invalid merge-base")
    # --no-renames represents renames as deletion/addition and accounts for both paths.
    raw = objects.run("diff", "--no-ext-diff", "--no-textconv", "--no-renames",
                      "--name-only", "-z", merge, head)
    paths = [p.decode("utf-8") for p in raw.split(b"\0") if p]
    require(len(paths) <= 3000, "Over 3000 changed paths; split this PR for automated review")
    evidence = {"merge_base": merge, "changed_paths": paths, "files": [], "base_guidance": {},
                "limitations": ["Static partial review; no PR code or tests executed.",
                                "Unchanged consumers and external requirements are not fully inspected.",
                                "Resolved-thread state is unavailable."]}
    guidance = {"AGENTS.md", "REVIEW.md"}
    used = len(json.dumps(evidence).encode())
    for path in paths:
        for parent in PurePosixPath(path).parents:
            guidance.update(str(parent / name) for name in ("AGENTS.md", "REVIEW.md"))
        item = {"path": path, "before": objects.blob(merge, path), "after": objects.blob(head, path)}
        # Skip giant/binary/link objects before asking Git to produce a textual patch.
        if all(value is None or "text" in value for value in (item["before"], item["after"])):
            item["diff"] = objects.run("diff", "--no-ext-diff", "--no-textconv", "--no-renames",
                                       "--unified=5", merge, head, "--", path).decode("utf-8", "replace")
        size = len(json.dumps(item).encode())
        if used + size > MAX_CONTEXT:
            evidence["limitations"].append(f"Source budget reached; {len(paths) - len(evidence['files'])} paths lack source context.")
            break
        evidence["files"].append(item)
        used += size
    for path in sorted(guidance):
        value = objects.blob(base, path)
        if value:
            size = len(json.dumps(value).encode())
            if used + size > MAX_CONTEXT:
                evidence["limitations"].append("Some base guidance omitted due to source budget.")
                break
            evidence["base_guidance"][path] = value
            used += size
    return evidence


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=True), encoding="utf-8")


def prepare(api, number, event, directory):
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
    if duplicate(reviews, contract):
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
    for label, path, key in [
        ("discussion", f"issues/{number}/comments", None),
        ("inline_comments", f"pulls/{number}/comments", None),
        ("checks", f"commits/{contract['head_sha']}/check-runs", "check_runs"),
        ("statuses", f"commits/{contract['head_sha']}/statuses", None),
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
    for key in ("description", "prior_reviews", "discussion", "inline_comments", "checks", "statuses"):
        if len(json.dumps(evidence.get(key)).encode()) > 40_000:
            evidence.pop(key, None)
            evidence["limitations"].append(f"{key} omitted: exceeds 40 KB context budget.")
    write_json(directory / "input.json", evidence)
    write_json(directory / "contract.json", contract)
    print(f"Prepared PR #{number} at {contract['head_sha']} against {contract['base_sha']}")


def response_text(response):
    require(response.get("status") == "completed", "Model response incomplete; nothing will be published")
    parts = []
    for item in response.get("output", []):
        require(item.get("type") in ("message", "reasoning"), "Unexpected model tool output")
        if item.get("type") == "message":
            for content in item.get("content", []):
                require(content.get("type") == "output_text", "Model refused or returned unsupported output")
                parts.append(content["text"])
    text = "\n".join(parts).strip()
    require(0 < len(text.encode()) <= MAX_REVIEW, "Empty or oversized model review")
    return text


def generate(directory):
    if (directory / "result.json").exists():
        print("Review skipped by preparation gate")
        return
    key = os.environ.get("OPENAI_API_KEY", "")
    require(key, "Set OPENAI_API_KEY in the main-only pr-review GitHub environment")
    payload = {"model": os.environ.get("REVIEW_MODEL") or "gpt-5.4-mini-2026-03-17",
               "instructions": Path(__file__).with_name("prompt.md").read_text(),
               "input": (directory / "input.json").read_text(),
               "tools": [], "store": False, "max_output_tokens": 6000}
    # Only evidence and the public prompt go to the model. No credentials in input,
    # no agent runtime, no shell/browser/read tools, no automatic API retries.
    result = http_json("https://api.openai.com/v1/responses", key, payload)
    review = response_text(result)
    require(key not in review, "Unexpected credential in output")
    write_json(directory / "result.json", {
        "contract": json.loads((directory / "contract.json").read_text()),
        "review": review, "model": payload["model"],
    })
    print("Generated bounded review artifact; publication is a separate job")


def publish(api, number, result, run_url):
    if "skip" in result:
        print("Review skipped by preparation gate")
        return
    contract, review = result["contract"], result["review"]
    require(contract["number"] == number and contract["repository"] == api.repository, "Wrong review target")
    require(isinstance(review, str) and 0 < len(review.encode()) <= MAX_REVIEW, "Invalid review text")
    reviews = api.pages(f"pulls/{number}/reviews")
    if duplicate(reviews, contract):
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
        posted = duplicate(api.pages(f"pulls/{number}/reviews"), contract)
        require(posted, "Publication failed or is uncertain. Check remote reviews before rerunning; POST was not retried")
    require(posted.get("html_url"), "Publication returned no review URL")
    print(f"Published COMMENT: {posted['html_url']}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=("prepare", "generate", "publish"))
    parser.add_argument("--directory", type=Path, required=True)
    args = parser.parse_args()
    args.directory.mkdir(parents=True, exist_ok=True)
    if args.phase == "generate":
        generate(args.directory)
        return
    raw_number = os.environ.get("PR_NUMBER", "")
    require(re.fullmatch(r"[1-9][0-9]*", raw_number), "PR_NUMBER must be a positive integer without leading zeros")
    api = GitHub(os.environ["GITHUB_REPOSITORY"], os.environ["GH_TOKEN"])
    if args.phase == "prepare":
        event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
        prepare(api, int(raw_number), event, args.directory)
    else:
        path = args.directory / "result.json"
        require(path.stat().st_size <= 100_000, "Oversized review artifact")
        run_url = f"https://github.com/{api.repository}/actions/runs/{os.environ['GITHUB_RUN_ID']}"
        publish(api, int(raw_number), json.loads(path.read_text()), run_url)


if __name__ == "__main__":
    try:
        main()
    except (Failure, OSError, ValueError, KeyError, TypeError):
        # Tracebacks / HTTP responses may contain PR-controlled strings. Only fixed
        # Failure messages are safe; print other exception types without their data.
        import sys
        exc = sys.exc_info()[1]
        print(str(exc) if isinstance(exc, Failure) else f"Review failed: {type(exc).__name__}", file=sys.stderr)
        sys.exit(1)
