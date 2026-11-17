import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('controller', Path(__file__).with_name('controller.py'))
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
REPO = 'owner/repo'
SHA = 'a' * 40

def pr(number, **kwargs):
    value = {'number': number, 'state': 'open', 'draft': False, 'user': {'login': 'owner'},
             'head': {'sha': SHA, 'repo': {'full_name': REPO}}}
    value.update(kwargs)
    return value

class Scheduling(unittest.TestCase):
    def test_two_slots_and_stable_existing_occupant(self):
        selected, queued = c.choose([pr(1), pr(2), pr(3)], {'3': {'slot': 0}}, 2, REPO)
        self.assertEqual(selected, ['3', '1'])
        self.assertEqual(queued, ['2'])

    def test_closed_resources_consume_slot_until_confirmed_retired(self):
        self.assertEqual(c.choose([pr(2), pr(3)], {'1': {}}, 2, REPO), (['2'], ['3']))

    def test_excludes_fork_draft_closed_and_bad_sha(self):
        fork = pr(1); fork['head']['repo']['full_name'] = 'outsider/repo'
        bad = pr(2); bad['head']['sha'] = 'oops'
        self.assertEqual(c.choose([fork, bad, pr(3, draft=True), pr(4, state='closed')], {}, 2, REPO), ([], []))

class GitHubGuards(unittest.TestCase):
    def test_guard_refuses_stale_fork_and_closed(self):
        gh = c.GitHub(REPO)
        for value in [pr(1, state='closed'), pr(1, draft=True), pr(1, head={'sha': 'b'*40, 'repo': {'full_name': REPO}})]:
            gh.pr = Mock(return_value=value)
            with self.assertRaises(RuntimeError): gh.guard('1', SHA)

    def test_author_permission_is_required(self):
        gh = c.GitHub(REPO); gh.pr = Mock(return_value=pr(1))
        gh.api = Mock(return_value={'permission': 'read'})
        with self.assertRaises(RuntimeError): gh.guard('1', SHA)

    def test_failed_newest_build_never_falls_back(self):
        gh = c.GitHub(REPO)
        gh.pages = Mock(return_value=[{'id': 1, 'head_sha': SHA, 'event': 'pull_request', 'status': 'completed', 'conclusion': 'success'},
            {'id': 2, 'head_sha': SHA, 'event': 'pull_request', 'status': 'completed', 'conclusion': 'failure'}])
        self.assertIsNone(gh.build(SHA))

    def test_comment_edits_only_own_marker_and_deduplicates(self):
        gh = c.GitHub(REPO); gh.login = 'operator'; gh.api = Mock()
        gh.pages = Mock(return_value=[{'id': 1, 'user': {'login': 'other'}, 'body': c.MARKER+'\nwrong'},
            {'id': 2, 'user': {'login': 'operator'}, 'body': c.MARKER+'\nready'}])
        gh.comment('1', 'ready'); gh.api.assert_not_called()
        gh.comment('1', 'updated')
        self.assertIn('/comments/2', gh.api.call_args.args[0])

class CloudflareRoutes(unittest.TestCase):
    def make(self):
        cf = object.__new__(c.Cloudflare)
        cf.config = {'account_id': 'a', 'zone_id': 'z', 'tunnel_id': 't', 'domain': 'example.com'}
        cf.token = 'not-real'
        self.config = {'ingress': [{'hostname': 'unrelated.example.com', 'service': 'http://localhost:9999'}, {'service': 'http_status:404'}], 'warp-routing': {'enabled': False}}
        self.records = {}; self.writes = []
        def api(path, data=None, method=None):
            if '?name=' in path: return self.records.get(path.split('=')[1], [])
            if path == cf.tunnel_path:
                if data: self.config = copy.deepcopy(data['config']); self.writes.append(path)
                return {'config': copy.deepcopy(self.config)}
            self.writes.append(path)
            return {}
        cf.api = api
        return cf

    def test_routes_preserve_unrelated_and_terminal_fallback(self):
        cf = self.make()
        cf.route('42', {'API_PORT': '19100', 'STOREFRONT_PORT': '13100'})
        self.assertEqual(self.config['ingress'][0]['hostname'], 'unrelated.example.com')
        self.assertEqual(self.config['ingress'][-1], {'service': 'http_status:404'})
        self.assertFalse(self.config['warp-routing']['enabled'])
        cf.route('42', {'API_PORT': '19100', 'STOREFRONT_PORT': '13100'}, remove=True)
        self.assertEqual(len(self.config['ingress']), 2)

    def test_dns_collision_refuses_before_any_write(self):
        cf = self.make()
        self.records['pr-42-preview.example.com'] = [{'type': 'A', 'content': '1.2.3.4', 'proxied': False}]
        with self.assertRaises(RuntimeError): cf.route('42', {'API_PORT': '19100', 'STOREFRONT_PORT': '13100'})
        self.assertEqual(self.writes, [])

    def test_wrong_tunnel_port_refuses_mutation(self):
        cf = self.make()
        self.config['ingress'].insert(0, {'hostname': 'pr-42-preview.example.com', 'service': 'http://localhost:1'})
        with self.assertRaises(RuntimeError): cf.route('42', {'API_PORT': '19100', 'STOREFRONT_PORT': '13100'})
        self.assertEqual(self.writes, [])

class Reconciliation(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.cfg = {'repo': REPO, 'domain': 'example.com', 'max_environments': 2, 'enabled': True}
        self.ctl = c.Controller(self.cfg, self.root)
        self.ctl.disk_guard = Mock()
        self.ctl.github = Mock()
        self.ctl.github.pages.return_value = [pr(1)]
        self.ctl.github.pr.return_value = pr(1)
        self.ctl.github.build.return_value = {'id': 10}

    def test_plan_does_not_allocate_or_mutate(self):
        result = self.ctl.reconcile()
        self.assertEqual(result['selected'], ['1'])
        self.assertFalse(self.ctl.entries_path.exists())
        self.ctl.github.comment.assert_not_called()

    def test_api_failure_never_deletes_resources(self):
        self.ctl.github.pages.side_effect = RuntimeError('API unavailable')
        self.ctl.retire = Mock()
        with self.assertRaises(RuntimeError): self.ctl.reconcile(True)
        self.ctl.retire.assert_not_called()

    def test_open_pr_cannot_be_retired(self):
        with self.assertRaises(RuntimeError): self.ctl.retire('1')

    def test_failure_withdraws_route_preserves_state_and_does_not_retry_same_head(self):
        cf = Mock()
        self.ctl.capacity_guard = Mock()
        self.ctl.compose = Mock()
        self.ctl.deploy = Mock(side_effect=RuntimeError('migration failed'))
        with patch.object(c, 'Cloudflare', return_value=cf):
            self.ctl.reconcile(True)
            self.assertEqual(self.ctl.entries['1']['status'], 'failed')
            self.assertTrue(self.ctl.envpath('1').exists())
            self.assertTrue(cf.route.call_args.kwargs['remove'])
            self.ctl.reconcile(True)
        self.assertEqual(self.ctl.deploy.call_count, 1)
        self.assertNotIn('ready', str(self.ctl.github.comment.call_args))

    def test_new_head_retries_failed_environment(self):
        self.ctl.allocate('1')
        self.ctl.entries['1']['failed_sha'] = 'b'*40
        self.ctl.capacity_guard = Mock(); self.ctl.deploy = Mock()
        with patch.object(c, 'Cloudflare', return_value=Mock()): self.ctl.reconcile(True)
        self.ctl.deploy.assert_called_once()

    def test_lost_ready_comment_is_retried_without_redeploying(self):
        self.ctl.allocate('1'); self.ctl.entries['1'].update(status='ready', sha=SHA)
        self.ctl.deploy = Mock()
        with patch.object(c, 'Cloudflare', return_value=Mock()): self.ctl.reconcile(True)
        self.ctl.deploy.assert_not_called()
        self.assertIn('Preview ready', self.ctl.github.comment.call_args.args[1])

    def test_buildless_old_pr_does_not_starve_built_new_pr(self):
        self.ctl.github.pages.return_value = [pr(1), pr(2), pr(3)]
        self.ctl.github.build.side_effect = [None, None, {'id': 10}]
        self.ctl.capacity_guard = Mock(); self.ctl.deploy = Mock()
        with patch.object(c, 'Cloudflare', return_value=Mock()): self.ctl.reconcile(True)
        self.assertEqual(self.ctl.deploy.call_args.args[0], '3')

if __name__ == '__main__': unittest.main()

class ResourceAndCleanup(unittest.TestCase):
    def test_size_parser_and_unknown_units(self):
        self.assertEqual(c.docker_bytes('3.5GB'), 3500000000)
        self.assertEqual(c.docker_bytes('24kB (virtual 1GB)'), 24000)
        with self.assertRaises(RuntimeError): c.docker_bytes('unknown')

    def test_closed_cleanup_deletes_only_its_own_data_and_preserves_shared_images(self):
        with tempfile.TemporaryDirectory() as temp:
            ctl = c.Controller({'repo': REPO, 'domain': 'example.com', 'max_environments': 2}, Path(temp))
            ctl.allocate('1'); ctl.allocate('2')
            ctl.entries['1']['images'] = ['shared', 'unique']
            ctl.entries['2']['images'] = ['shared']
            ctl.cf = Mock(); ctl.github = Mock(); ctl.github.pr.return_value = pr(1, state='closed')
            ctl.compose = Mock()
            with patch.object(c.subprocess, 'run') as run:
                ctl.retire('1')
            self.assertEqual(run.call_args.args[0], ['docker', 'image', 'rm', 'unique'])
            self.assertNotIn('1', ctl.entries)
            self.assertIn('2', ctl.entries)
            self.assertTrue(ctl.envpath('2').exists())
            ctl.compose.assert_called_once_with('1', 'down', '--volumes', '--remove-orphans')

    def test_disk_watermark_stops_writers_without_deleting_data(self):
        with tempfile.TemporaryDirectory() as temp:
            ctl = c.Controller({'repo': REPO, 'domain': 'example.com', 'max_environments': 2}, Path(temp))
            ctl.allocate('1'); ctl.compose = Mock()
            usage = {'Images': [], 'Volumes': [], 'Containers': []}
            with patch.object(c.shutil, 'disk_usage', return_value=Mock(free=1)), patch.object(c, 'command', return_value=json.dumps(usage)):
                with self.assertRaises(RuntimeError): ctl.disk_guard()
            ctl.compose.assert_called_once_with('1', 'stop')
            self.assertTrue(ctl.envpath('1').exists())

class DeploymentOrdering(unittest.TestCase):
    def test_stale_head_after_acceptance_cannot_publish_ready(self):
        with tempfile.TemporaryDirectory() as temp:
            ctl = c.Controller({'repo': REPO, 'domain': 'example.com', 'max_environments': 2}, Path(temp))
            ctl.allocate('1'); ctl.cf = Mock(); ctl.github = Mock(); ctl.compose = Mock()
            ctl.import_images = Mock(return_value={'medusa': 'sha256:a', 'storefront': 'sha256:b'})
            ctl.current = Mock(side_effect=[None, None, None, None, RuntimeError('superseded')])
            c.write_json(ctl.folder('1') / 'bootstrap.json', {'publishable_key': 'pk_test'})
            with patch.object(c, 'command', return_value=''), patch.object(c.subprocess, 'run', return_value=Mock(returncode=0, stdout='', stderr='')), patch.object(c, 'http', return_value=(b'', {})), patch.object(c, 'acceptance', return_value={'ok': True}), patch.object(c, 'public_addresses', return_value=['1.1.1.1']):
                with self.assertRaises(RuntimeError): ctl.deploy('1', SHA, {'id': 1})
            self.assertNotEqual(ctl.entries['1']['status'], 'ready')
            ctl.github.comment.assert_not_called()

    def test_reopened_pr_during_retirement_restores_route_and_keeps_data(self):
        with tempfile.TemporaryDirectory() as temp:
            ctl = c.Controller({'repo': REPO, 'domain': 'example.com', 'max_environments': 2}, Path(temp))
            ctl.allocate('1'); ctl.cf = Mock(); ctl.compose = Mock(); ctl.github = Mock()
            ctl.github.pr.side_effect = [pr(1, state='closed'), pr(1)]
            with self.assertRaises(RuntimeError): ctl.retire('1')
            ctl.compose.assert_not_called()
            self.assertTrue(ctl.envpath('1').exists())
            self.assertFalse(ctl.cf.route.call_args.kwargs.get('remove', False))

class RecoveryAndBuildReceipts(unittest.TestCase):
    def test_successful_workflow_with_skipped_build_is_not_deployable(self):
        gh = c.GitHub(REPO)
        gh.pages = Mock(side_effect=[[{'id': 1, 'head_sha': SHA, 'event': 'pull_request', 'status': 'completed', 'conclusion': 'success'}], []])
        self.assertIsNone(gh.build(SHA))

    def test_missing_or_expired_artifact_is_not_deployable(self):
        gh = c.GitHub(REPO)
        run = {'id': 1, 'head_sha': SHA, 'event': 'pull_request', 'status': 'completed', 'conclusion': 'success'}
        artifacts = [{'name': f'preview-medusa-{SHA}', 'expired': False}, {'name': f'preview-storefront-{SHA}', 'expired': True}]
        gh.pages = Mock(side_effect=[[run], artifacts])
        self.assertIsNone(gh.build(SHA))

    def test_interrupted_attempt_is_quarantined_not_replayed(self):
        with tempfile.TemporaryDirectory() as temp:
            ctl = c.Controller({'repo': REPO, 'domain': 'example.com', 'max_environments': 2, 'enabled': True}, Path(temp))
            ctl.allocate('1'); ctl.entries['1'].update(status='deploying', attempt_sha=SHA)
            ctl.github = Mock(); ctl.github.pages.return_value = [pr(1)]; ctl.github.pr.return_value = pr(1)
            ctl.compose = Mock(); ctl.deploy = Mock(); ctl.disk_guard = Mock()
            with patch.object(c, 'Cloudflare', return_value=Mock()): ctl.reconcile(True)
            ctl.deploy.assert_not_called()
            self.assertEqual(ctl.entries['1']['status'], 'failed')
            self.assertEqual(ctl.entries['1']['failed_sha'], SHA)

class PublicDns(unittest.TestCase):
    def test_private_or_missing_dns_answers_are_rejected(self):
        for answer in [{'Status': 3}, {'Status': 0, 'Answer': [{'type': 1, 'data': '127.0.0.1'}]}]:
            with patch.object(c, 'http', return_value=(json.dumps(answer).encode(), {})):
                with self.assertRaises(RuntimeError): c.public_addresses('pr-1-preview.example.com')

    def test_resolver_is_restored_after_failure(self):
        original = c.socket.getaddrinfo
        with patch.object(c, 'public_addresses', return_value=['1.1.1.1']):
            with self.assertRaises(RuntimeError):
                with c.public_dns(['pr-1-preview.example.com']): raise RuntimeError('probe failed')
        self.assertIs(c.socket.getaddrinfo, original)
