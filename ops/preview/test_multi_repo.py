"""Shared host admission, namespace ownership and real intake-mode contracts."""
from test_controller import c, REPO, pr
from pathlib import Path
from unittest.mock import Mock, patch
import json
import tempfile
import unittest

class MultiRepo(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.peer = self.root / 'peer'; self.peer.mkdir()
        (self.peer / 'environments.json').write_text('{}')
        self.local = self.root / 'local'; self.local.mkdir()
        self.cfg = {'repo': REPO, 'domain': 'example.com', 'max_environments': 2,
                    'namespace': 'chefv', 'api_port_base': 19200, 'storefront_port_base': 13200,
                    'peer_state_dirs': [str(self.peer)], 'booking_mode': 'request'}
        self.ctl = c.Controller(self.cfg, self.local)

    def peer_entries(self, entries):
        (self.peer / 'environments.json').write_text(json.dumps(entries))

    def test_peer_reservations_count_and_closed_resources_do_not_free_capacity(self):
        self.peer_entries({'4': {'status': 'ready'}, '5': {'status': 'retiring'}})
        self.assertEqual(self.ctl.capacity(), 0)
        with self.assertRaises(RuntimeError): self.ctl.allocate('4')
        self.peer_entries({'4': {'status': 'ready'}})
        self.ctl.allocate('4')
        with self.assertRaises(RuntimeError): self.ctl.allocate('5')
        self.peer_entries({})
        self.ctl.allocate('5')
        self.assertEqual(len(self.ctl.entries), 2)

    def test_missing_corrupt_peer_fails_closed(self):
        (self.peer / 'environments.json').unlink()
        with self.assertRaises(FileNotFoundError): self.ctl.capacity()
        (self.peer / 'environments.json').write_text('invalid')
        with self.assertRaises(ValueError): self.ctl.capacity()

    def test_same_pr_number_has_distinct_urls_ports_and_project(self):
        self.ctl.allocate('45'); env = c.load_env(self.ctl.envpath('45'))
        self.assertEqual(env['PREVIEW_ID'], 'chefv-pr-45')
        self.assertEqual(env['API_PORT'], '19200')
        self.assertEqual(env['STOREFRONT_PORT'], '13200')
        self.assertEqual(env['PREVIEW_BOOKING_MODE'], 'request')
        self.assertEqual(env['STOREFRONT_URL'], 'https://chefv-pr-45-preview.example.com')
        self.assertEqual(c.preview_hosts(self.cfg, '45')[1], 'api-chefv-pr-45-preview.example.com')
        self.assertEqual(c.preview_hosts({'domain':'example.com'}, '45')[0], 'pr-45-preview.example.com')

    def test_gc_does_not_claim_other_repository_images(self):
        image = 'sha256:' + 'a'*64
        self.ctl.image_inventory = Mock(return_value={image: {'RepoTags':['chef-preview-medusa:'+'b'*40]}})
        with patch.object(c, 'command') as cmd:
            report = self.ctl.collect_garbage()
        self.assertEqual(report['status'], 'ok'); cmd.assert_not_called()
        self.ctl.track_images([image])
        with patch.object(c, 'command') as cmd:
            self.assertEqual(self.ctl.prune_images(), [image])
        cmd.assert_not_called()

    def test_peer_containers_allowed_unknown_containers_blocked(self):
        self.ctl.allocate('1'); self.peer_entries({'45': {'slot':0}})
        c.save_env(self.peer / 'pr-45' / 'preview.env', {'PREVIEW_ID':'pr-45'})
        self.ctl.disk_guard = Mock()
        with patch.object(c, 'command', return_value=json.dumps({'Names':'chef-preview-pr-45-medusa-1'})):
            self.ctl.capacity_guard()
        with patch.object(c, 'command', return_value=json.dumps({'Names':'chef-preview-unknown-medusa-1'})):
            with self.assertRaises(RuntimeError): self.ctl.capacity_guard()

    def test_namespace_validation(self):
        for value in ['../other', 'Upper', 'toolongnamespace', 'bad-']:
            with self.assertRaises(ValueError): c.namespace({'namespace':value})

    def test_request_acceptance_uses_existing_intake_without_availability_claim(self):
        self.ctl.allocate('18'); env=c.load_env(self.ctl.envpath('18'))
        env['MEDUSA_PUBLISHABLE_KEY']='synthetic'
        calls=[]
        def http(url, data=None, headers=None):
            calls.append((url, json.loads(data) if data else None))
            response_headers={'access-control-allow-origin':env['STOREFRONT_URL'], 'x-robots-tag':'noindex'}
            if url.endswith('/auth/user/emailpass'): body={'token':'synthetic'}
            elif url.endswith('/store/experience-types'): body={'experience_types':[{'id':'exp','name':'Dinner'}]}
            elif url.endswith('/store/menus'): body={'menus':[{'id':'menu_preview'}]}
            elif url.endswith('/store/chef-events'): body={'chefEvent':{'id':'synthetic'}}
            elif url.endswith(('/','/request','/app')): return b'<html>fixture</html>', response_headers
            else: raise AssertionError(url)
            return json.dumps(body).encode(),response_headers
        with patch.object(c,'http',side_effect=http):
            proof=c.acceptance(env,write_request=True)
        self.assertFalse(proof['availability']); self.assertTrue(proof['synthetic_request'])
        payload=next(data for url,data in calls if url.endswith('/store/chef-events'))
        self.assertNotIn('slotStart',payload);self.assertEqual(payload['requestedTime'],'18:00')
