"""Shared review-path, compact source, adaptive reads and untrusted artifact regressions."""
import hashlib
import io
import json
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import Mock, patch
import zipfile
from test_evidence import SourceEvidenceTests
from test_review import API, review
from test_runner import runner, model_result


def archive(files):
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, data in files.items(): z.writestr(name, data)
    return out.getvalue()


class CompactSourceTests(SourceEvidenceTests):
    def test_before_after_test_wiring_does_not_starve_financial_core(self):
        text = ''.join(f'const fixture{i} = {i};\n' for i in range(1200))
        for name in ('aa-tests.ts', 'ab-tests.ts'): self.put(name, text)
        self.base = self.commit('large existing tests')
        for name in ('aa-tests.ts', 'ab-tests.ts'): self.put(name, text + 'wireNewSuite();\n')
        self.put('billing-storage.ts', 'export const paymentGuard = true;\n' * 300)
        with patch.object(review, 'MAX_CONTEXT', 120_000):
            result = self.context(self.commit('billing'))
        self.assertEqual(result['coverage']['omitted_changed_paths'], [])
        files = {f['path']: f for f in result['files']}
        self.assertIn('diff_from_base', files['aa-tests.ts']['before'])
        self.assertIn('+wireNewSuite();', files['aa-tests.ts']['before']['diff_from_base'])
        self.assertIn('paymentGuard', files['billing-storage.ts']['after']['text'])

    def test_budget_skipped_change_is_recovered_by_related_pass(self):
        self.put('zz.ts', 'a' * 29000); self.base = self.commit('base big')
        self.put('zz.ts', 'b' * 29000)
        with patch.object(review, 'MAX_CONTEXT', 80_000):
            result = self.context(self.commit('changed big'))
        self.assertEqual(result['coverage']['omitted_changed_paths'], [])
        self.assertIn('zz.ts', [r['path'] for r in result['files']])

    def test_adaptive_search_and_base_read_stay_in_git(self):
        self.put('src/change.ts', 'const paymentGuard = true;')
        head = self.commit('change')
        bare = self.root / 'objects'; bare.mkdir()
        objects = review.Objects(bare); objects.run('fetch', str(self.source), self.base, head)
        evidence = {'contract': {'base_sha': self.base, 'head_sha': head}}
        result = review.additional_evidence(self.root, evidence, {
            'paths': [{'revision': 'base', 'path': 'docs/requirements.md'}], 'queries': ['paymentGuard']})
        self.assertIn('Full requirements', result['investigation'][0]['sources'][0]['content']['text'])
        self.assertIn('src/change.ts:1:', result['investigation'][0]['searches'][0]['matches'])
        for data in ({'paths': [{'revision': 'head', 'path': '../secret'}]},
                     {'paths': [{'revision': 'main', 'path': 'src/change.ts'}]}, {'command': 'cat /etc/passwd'}):
            with self.assertRaises(review.Failure): review.additional_evidence(self.root, evidence, data)


class ArtifactTests(unittest.TestCase):
    def test_jest_failures_skips_head_and_hashes_are_preserved(self):
        raw = archive({'head.txt': 'b'*40, 'postgres.json': json.dumps({
            'success': False, 'numPassedTests': 3, 'numFailedTests': 1, 'numPendingTests': 2,
            'testResults': [{'name': 'payments', 'status': 'failed', 'assertionResults': [
                {'fullName': 'race', 'status': 'failed', 'failureMessages': ['mismatch']}]}]}),
            'upgrade-before.json': '[1]', 'upgrade-after.json': '[2]', 'build.log': 'failure\n'})
        result = review.inspect_artifact(raw, 'b'*40)
        self.assertFalse(result['reports']['postgres.json']['success'])
        self.assertEqual(result['reports']['postgres.json']['numPendingTests'], 2)
        self.assertEqual(result['reports']['postgres.json']['suites'][0]['nonpassing'][0]['fullName'], 'race')
        self.assertFalse(result['parent_row_hashes_equal'])
        self.assertIn('matching head.txt', result['head_binding'])
        with self.assertRaisesRegex(review.Failure, 'head.txt mismatch'):
            review.inspect_artifact(raw, 'a'*40)

    def test_archive_paths_symlinks_duplicates_and_bombs_rejected(self):
        for name in ('../escape.txt', '/secret.txt', 'folder\\escape.txt'):
            with self.subTest(name=name), self.assertRaises(review.Failure):
                review.inspect_artifact(archive({name: 'data'}), 'b'*40)
        out = io.BytesIO()
        with zipfile.ZipFile(out, 'w') as z:
            entry = zipfile.ZipInfo('link.txt'); entry.external_attr = (stat.S_IFLNK | 0o777) << 16
            z.writestr(entry, '/etc/passwd')
        with self.assertRaises(review.Failure): review.inspect_artifact(out.getvalue(), 'b'*40)
        with self.assertRaises(review.Failure):
            review.inspect_artifact(archive({'large.log': 'x' * 3_000_001}), 'b'*40)
        with self.assertRaises(review.Failure):
            review.inspect_artifact(archive({str(i)+'.txt': '' for i in range(81)}), 'b'*40)

    def test_log_excerpts_disclose_truncation_and_scripts_never_run(self):
        result = review.inspect_artifact(archive({'build.log': 'x'*9000, 'run.sh': 'touch CANARY'}), 'b'*40)
        self.assertTrue(result['reports']['build.log']['truncated'])
        self.assertIn('Unsupported report: run.sh', result['limitations'])

    def test_download_strips_auth_and_checks_digest(self):
        raw = archive({'head.txt': 'b'*40}); api = review.GitHub('owner/repo', 'CANARY')
        artifact = {'id': 8, 'expired': False, 'size_in_bytes': len(raw),
                    'digest': 'sha256:' + hashlib.sha256(raw).hexdigest()}
        signed = 'https://fixture.blob.core.windows.net/artifact?signature=secret'
        first, second = Mock(), Mock()
        first.open.side_effect = review.error.HTTPError('https://api.github.com/', 302, '', {'Location': signed}, None)
        response = Mock(); response.read.return_value = raw
        second.open.return_value.__enter__ = Mock(return_value=response)
        second.open.return_value.__exit__ = Mock(return_value=False)
        with patch.object(review.request, 'build_opener', side_effect=[first, second]):
            self.assertEqual(review.artifact_bytes(api, artifact), raw)
        self.assertEqual(second.open.call_args.args, (signed,))
        self.assertNotIn('CANARY', str(second.mock_calls))
        for digest in ('sha256:wrong', None):
            with patch.object(review.request, 'build_opener', side_effect=[first, second]), self.assertRaisesRegex(review.Failure, 'digest mismatch'):
                review.artifact_bytes(api, dict(artifact, digest=digest))
        first.open.side_effect = review.error.HTTPError('https://api.github.com/', 302, '', {'Location': 'https://attacker.invalid/'}, None)
        with patch.object(review.request, 'build_opener', return_value=first), self.assertRaises(review.Failure):
            review.artifact_bytes(api, artifact)

    def test_exact_head_artifact_contents_are_supplied_not_just_metadata(self):
        api = API(); raw = archive({'head.txt': 'b'*40, 'tests-summary.txt': '394 passed'})
        def pages(path, key=None):
            if key == 'workflow_runs': return [{'id': 8, 'head_sha': 'b'*40}]
            if key == 'jobs': return []
            if key == 'artifacts': return [{'id': 9, 'name': 'test-reports', 'digest': 'sha256:digest',
                'workflow_run': {'head_sha': 'b'*40, 'id': 8}}]
            return []
        api.pages = pages
        with patch.object(review, 'artifact_bytes', return_value=raw):
            r = review.ci_evidence(api, 'b'*40, {})
        self.assertIn('394 passed', json.dumps(r['workflow_runs'][0]['artifact_contents']))

    def test_artifact_changes_invalidate_ci_fingerprint(self):
        api = API(); original = api.pages
        artifact = {'id': 9, 'digest': 'old', 'expired': False, 'size_in_bytes': 5}
        def pages(path, key=None):
            if key == 'workflow_runs': return [{'id': 8, 'head_sha': 'b'*40}]
            if key == 'artifacts': return [artifact]
            return original(path, key)
        api.pages = pages
        old = review.ci_snapshot(api, 'b'*40)['fingerprint']
        artifact['expired'] = True
        self.assertNotEqual(old, review.ci_snapshot(api, 'b'*40)['fingerprint'])


class InvestigationTests(unittest.TestCase):
    def files(self, root, omitted=None):
        (root / 'input.json').write_text(json.dumps({'ci_fingerprint': 'snapshot',
            'coverage': {'omitted_changed_paths': omitted or []}}))
        (root / 'contract.json').write_text('{}')

    def test_missing_changed_source_never_gets_scored(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(runner, 'invoke_model') as invoke:
            root = Path(tmp); self.files(root, ['billing.ts'])
            with self.assertRaisesRegex(runner.Failure, 'Incomplete changed-source'):
                runner.generate(root, 'skill')
            invoke.assert_not_called()

    def test_followup_requests_use_same_skill_and_count_every_call(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); self.files(root)
            request = 'EVIDENCE_REQUEST: {"queries":["paymentGuard"]}'
            reserve = Mock()
            with patch.object(runner, 'invoke_model', side_effect=[model_result(request), model_result()]), \
                 patch.object(runner.review, 'additional_evidence', side_effect=lambda d,e,r: dict(e, investigation=[r])) as extra:
                result = runner.generate(root, 'SHARED RUBRIC', reserve_call=reserve)
            reserve.assert_called_once(); extra.assert_called_once()
            self.assertEqual(result['evidence_summary']['investigation_rounds'], 1)
            for message in (root / 'message.txt', root / 'round-1/message.txt'):
                self.assertIn('SHARED RUBRIC', message.read_text())
                self.assertNotIn('supplied-diff/partial-review path', message.read_text())

    def test_exhausted_investigation_or_daily_limit_never_publishes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); self.files(root)
            response = model_result('EVIDENCE_REQUEST: {"queries":["guard"]}')
            with patch.object(runner, 'invoke_model', return_value=response), \
                 patch.object(runner.review, 'additional_evidence', side_effect=lambda d,e,r:e):
                with self.assertRaisesRegex(runner.Failure, 'rounds exhausted'):
                    runner.generate(root, 'skill')
            self.assertFalse((root / 'result.json').exists())

    def test_thread_resolution_pagination_is_collected(self):
        api = review.GitHub('owner/repo', 'secret')
        def response(nodes, more, cursor):
            return {'data': {'repository': {'pullRequest': {'reviewThreads': {
                'nodes': nodes, 'pageInfo': {'hasNextPage': more, 'endCursor': cursor}}}}}}
        with patch.object(review, 'http_json', side_effect=[response([{'isResolved': True}], True, 'next'),
                response([{'isResolved': False}], False, None)]) as query:
            self.assertEqual(api.review_threads(25), [{'isResolved': True}, {'isResolved': False}])
        self.assertEqual(query.call_args.args[2]['variables']['cursor'], 'next')
