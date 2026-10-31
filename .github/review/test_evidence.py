"""Regression coverage for bounded evidence and CI-settled review generation."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from test_review import API, review
from test_runner import runner


class SourceEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source = self.root / 'source'; self.source.mkdir()
        self.git('init', '-b', 'main')
        self.git('config', 'user.name', 'Fixture')
        self.git('config', 'user.email', 'fixture@example.invalid')
        self.put('AGENTS.md', 'Trusted base guidance')
        self.put('package.json', '{"scripts":{"install":"touch CANARY"}}')
        self.put('src/dependency.ts', 'export const allowed = true;')
        self.put('docs/requirements.md', 'Full requirements contract')
        self.base = self.commit('base')

    def git(self, *args):
        return subprocess.check_output(['git', '-c', 'core.hooksPath=/dev/null', '-C', str(self.source), *args],
            env=dict(os.environ, GIT_CONFIG_GLOBAL='/dev/null', GIT_CONFIG_NOSYSTEM='1'),
            stderr=subprocess.DEVNULL).decode().strip()

    def put(self, name, text):
        p = self.source / name; p.parent.mkdir(parents=True, exist_ok=True); p.write_text(text)

    def commit(self, message):
        self.git('add', '.'); self.git('commit', '-m', message)
        return self.git('rev-parse', 'HEAD')

    def context(self, head):
        bare = self.root / 'objects'; bare.mkdir()
        objects = review.Objects(bare)
        objects.run('fetch', str(self.source), self.base, head)
        return review.source_context(objects, {'base_sha': self.base, 'head_sha': head})

    def test_late_cjs_sql_files_and_unchanged_references_fit_without_duplicate_diff(self):
        for n in range(5): self.put(f'large/{n}.ts', '// fixture\n' + 'x' * 21900)
        self.put('scripts/migrations.cjs', '/* retained source */')
        self.put('scripts/parent-fixture.sql', 'select 1;')
        self.put('scripts/parent-hashes.sql', 'select 2;')
        self.put('src/change.ts', 'import {allowed} from "./dependency";')
        self.put('docs/handoff.md', '[contract](requirements.md)')
        self.put('AGENTS.md', 'Untrusted HEAD instructions')
        with patch.object(review, 'MAX_CONTEXT', 200_000):
            result = self.context(self.commit('change'))
        self.assertEqual(result['coverage']['omitted_changed_paths'], [])
        self.assertEqual(len(result['files']), len(result['changed_paths']))
        self.assertTrue(all('diff' not in item for item in result['files']))
        related = {r['path']: r for r in result['related_sources']}
        self.assertIn('src/dependency.ts', related)
        self.assertEqual(related['docs/requirements.md']['content']['text'], 'Full requirements contract')
        self.assertEqual(result['base_guidance']['AGENTS.md']['text'], 'Trusted base guidance')
        self.assertLess(len(json.dumps(result).encode()), 200_000)
        self.assertFalse((self.source / 'CANARY').exists())

    def test_oversized_earlier_change_does_not_hide_small_later_file(self):
        self.put('aaa.ts', 'a' * 25000); self.base = self.commit('large base')
        self.put('aaa.ts', 'b' * 25000); self.put('zzz.sql', 'select 1;')
        with patch.object(review, 'MAX_CONTEXT', 60_000):
            result = self.context(self.commit('change'))
        self.assertIn('aaa.ts', result['coverage']['omitted_changed_paths'])
        self.assertIn('zzz.sql', [f['path'] for f in result['files']])
        self.assertLess(len(json.dumps(result).encode()), 60_000)

    def test_related_refs_cannot_escape_repository_or_load_symlinks(self):
        (self.source / 'src/escape.ts').symlink_to('/etc/passwd')
        self.put('src/change.ts', 'import "./escape"; import "../../outside";')
        result = self.context(self.commit('change'))
        self.assertIn('src/escape.ts', result['coverage']['omitted_changed_paths'])
        self.assertNotIn('outside', [r['path'] for r in result['related_sources']])
        self.assertNotIn('root:x:', json.dumps(result))


class CIWaitTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.store = runner.Store(Path(self.tmp.name) / 'queue.sqlite')
        self.addCleanup(self.store.db.close)
        self.api = API(); self.api.actor_id = 42
        self.contract = runner.review.identity(self.api.pr, self.api.repository)

    def test_pending_check_waits_without_model_or_ledger_claim_then_completes(self):
        self.api.checks[0]['status'] = 'in_progress'; self.api.checks[0]['conclusion'] = None
        job = dict(self.contract, run_id=88, dry_run=False)
        with patch.object(runner, 'generate') as generate, self.assertRaises(runner.WaitingForCI):
            runner.process(self.api, job, Path(self.tmp.name), self.store, 'skill')
        generate.assert_not_called()
        self.assertEqual(self.store.db.execute('SELECT * FROM reviews').fetchall(), [])
        self.assertEqual(self.api.posts, [])
        self.api.checks[0].update(status='completed', conclusion='success')
        self.assertFalse(runner.settled_ci(self.api, self.contract, self.store)['pending'])

    def test_no_ci_or_queue_only_gets_registration_grace_not_fake_test_success(self):
        for checks in ([], [dict(self.api.checks[0], name='queue')]):
            self.api.checks = checks
            self.store.db.execute('DELETE FROM ci_waits'); self.store.db.commit()
            with patch.object(runner.time, 'time', return_value=100), self.assertRaises(runner.WaitingForCI):
                runner.settled_ci(self.api, self.contract, self.store)
            with patch.object(runner.time, 'time', return_value=221):
                result = runner.settled_ci(self.api, self.contract, self.store)
                self.assertEqual([c['name'] for c in result['checks']], [c['name'] for c in checks])

    def test_terminal_failure_cancel_and_skip_are_evidence_not_endless_wait(self):
        for conclusion in ('failure', 'cancelled', 'skipped', 'timed_out'):
            self.api.checks[0]['conclusion'] = conclusion
            self.assertFalse(runner.settled_ci(self.api, self.contract, self.store)['pending'])

    def test_only_newest_legacy_status_controls_wait(self):
        self.api.statuses = [{'id': 2, 'context': 'ci', 'state': 'success'},
                             {'id': 1, 'context': 'ci', 'state': 'pending'}]
        self.assertFalse(runner.settled_ci(self.api, self.contract, self.store)['pending'])
        self.api.statuses[0]['state'] = 'pending'
        with self.assertRaises(runner.WaitingForCI): runner.settled_ci(self.api, self.contract, self.store)

    def test_legacy_status_provenance_comes_from_validated_endpoint(self):
        self.api.checks = []
        self.api.statuses = [{'id': 42, 'context': 'external-ci', 'state': 'success',
                             'target_url': 'https://ci.example.invalid/build/42'}]
        with patch.object(self.api, 'pages', wraps=self.api.pages) as pages:
            result = runner.settled_ci(self.api, self.contract, self.store)
        self.assertEqual(result['queried_head_sha'], self.contract['head_sha'])
        self.assertNotIn('sha', result['statuses'][0])
        self.assertEqual(pages.call_args_list[1].args[0], f"commits/{self.contract['head_sha']}/statuses")
        with patch.object(self.api, 'pages') as pages, self.assertRaisesRegex(runner.Failure, 'Invalid CI revision'):
            runner.review.ci_snapshot(self.api, 'main?ref=other')
        pages.assert_not_called()

    def test_wrong_sha_or_failed_metadata_lookup_never_generates(self):
        self.api.checks[0]['head_sha'] = 'c' * 40
        with self.assertRaisesRegex(runner.Failure, 'revision mismatch'):
            runner.settled_ci(self.api, self.contract, self.store)
        with patch.object(self.api, 'pages', side_effect=runner.Failure('HTTP 403')):
            with self.assertRaisesRegex(runner.Failure, '403'):
                runner.settled_ci(self.api, self.contract, self.store)

    def test_ci_wait_timeout_is_bounded_and_survives_store_restart(self):
        self.api.checks[0]['status'] = 'queued'
        with patch.object(runner.time, 'time', return_value=100), self.assertRaises(runner.WaitingForCI):
            runner.settled_ci(self.api, self.contract, self.store)
        other = runner.Store(Path(self.tmp.name) / 'queue.sqlite')
        try:
            with patch.object(runner.time, 'time', return_value=2801), self.assertRaisesRegex(runner.Failure, '45 minutes'):
                runner.settled_ci(self.api, self.contract, other)
        finally: other.db.close()

    def test_ci_rerun_invalidates_cached_review_and_regenerates(self):
        old = runner.review.ci_snapshot(self.api, self.contract['head_sha'])['fingerprint']
        result = {'contract': self.contract, 'review': 'Review. Merge confidence: 7/10',
                  'model': runner.MODEL, 'thinking': runner.THINKING, 'ci_fingerprint': old}
        self.store.save(runner.review.marker(self.contract), 'ready', result)
        self.api.checks[0]['id'] = 8
        fresh = runner.review.ci_snapshot(self.api, self.contract['head_sha'])['fingerprint']
        with patch.object(runner.review, 'prepare'), patch.object(runner, 'generate',
                return_value=dict(result, ci_fingerprint=fresh)) as generate:
            runner.process(self.api, dict(self.contract, run_id=88, dry_run=False),
                           Path(self.tmp.name), self.store, 'skill')
        generate.assert_called_once()
        self.assertEqual(len(self.api.posts), 1)

    def test_repeated_ci_regeneration_cannot_bypass_daily_cap(self):
        today = runner.dt.datetime.now(runner.dt.timezone.utc).date().isoformat()
        key = runner.review.marker(self.contract)
        self.store.db.executemany('INSERT INTO generation_attempts VALUES (?, ?)', [(key, today)] * 20)
        self.store.db.commit()
        with patch.object(runner, 'generate') as generate, self.assertRaisesRegex(runner.Failure, 'Daily review limit'):
            runner.process(self.api, dict(self.contract, run_id=88, dry_run=False),
                           Path(self.tmp.name), self.store, 'skill')
        generate.assert_not_called()

    def test_ci_change_during_generation_defers_publication(self):
        snapshot = runner.review.ci_snapshot(self.api, self.contract['head_sha'])
        result = {'contract': self.contract, 'review': 'Review. Merge confidence: 7/10',
                  'model': runner.MODEL, 'thinking': runner.THINKING, 'ci_fingerprint': snapshot['fingerprint']}
        def generate(*args):
            self.api.checks[0]['status'] = 'in_progress'
            return result
        with patch.object(runner.review, 'prepare'), patch.object(runner, 'generate', side_effect=generate):
            with self.assertRaises(runner.WaitingForCI):
                runner.process(self.api, dict(self.contract, run_id=88, dry_run=False),
                               Path(self.tmp.name), self.store, 'skill')
        self.assertEqual(self.api.posts, [])
        self.assertEqual(self.store.db.execute('SELECT status FROM reviews').fetchone()[0], 'ready')


class HostedEvidenceTests(unittest.TestCase):
    def test_steps_and_artifact_provenance_are_exact_head_and_bounded_metadata_only(self):
        api = API(); sha = 'b' * 40
        calls = []
        def pages(path, key=None):
            calls.append(path)
            if key == 'workflow_runs':
                return [{'id': 8, 'head_sha': 'a' * 40}, {'id': 9, 'head_sha': sha, 'conclusion': 'success'}]
            if key == 'jobs':
                return [{'id': 10, 'name': 'verify', 'conclusion': 'success',
                         'steps': [{'name': 'PostgreSQL tests', 'conclusion': 'success'}]}]
            if key == 'artifacts':
                return [{'id': 11, 'name': 'reports', 'digest': 'sha256:example',
                         'expired': False, 'size_in_bytes': 200, 'workflow_run': {'head_sha': sha}}]
            raise AssertionError(path)
        api.pages = pages
        r = review.ci_evidence(api, sha, {'pending': False})
        self.assertEqual([run['id'] for run in r['workflow_runs']], [9])
        self.assertEqual(r['workflow_runs'][0]['jobs'][0]['steps'][0]['conclusion'], 'success')
        self.assertEqual(r['workflow_runs'][0]['artifacts'][0]['digest'], 'sha256:example')
        self.assertTrue(all('/zip' not in p and '/logs' not in p for p in calls))
        self.assertIn('not downloaded', r['limitations'][0])
