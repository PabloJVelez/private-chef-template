"""Failure-oriented storage lifecycle tests; no real Docker or provider calls."""
from test_controller import c, REPO, pr
from pathlib import Path
import json
import tempfile
import unittest
from unittest.mock import Mock, patch

IMAGE = 'sha256:' + 'a'*64
TAG = 'chef-preview-medusa:' + 'b'*40

class GarbageCollection(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.cfg = {'repo': REPO, 'domain': 'example.com', 'max_environments': 2}
        self.ctl = c.Controller(self.cfg, self.root)
        self.ctl.image_inventory = Mock(return_value={IMAGE: {'RepoTags': [TAG]}})

    def test_failed_delete_survives_restart_then_retries(self):
        with patch.object(c, 'command', side_effect=RuntimeError('daemon unavailable')):
            self.assertEqual(self.ctl.prune_images([IMAGE]), [IMAGE])
        restored = c.Controller(self.cfg, self.root)
        self.assertEqual(restored.gc['images'][IMAGE]['attempts'], 1)
        restored.image_inventory = Mock(side_effect=[{IMAGE: {}}, {IMAGE: {}}, {}])
        with patch.object(c, 'command', return_value=''):
            self.assertEqual(restored.prune_images(), [])
        self.assertEqual(restored.gc['images'], {})

    def test_active_and_rollback_and_pending_images_are_protected(self):
        for field in ('images', 'rollback_images', 'pending_images', 'candidate_images', 'previous_images'):
            self.ctl.entries = {'1': {field: [IMAGE]}}
            with patch.object(c, 'command') as cmd:
                self.ctl.prune_images([IMAGE])
            cmd.assert_not_called()

    def test_foreign_tag_and_container_reference_block_deletion(self):
        self.ctl.image_inventory.return_value = {IMAGE: {'RepoTags': ['unrelated:latest']}}
        with patch.object(c, 'command') as cmd:
            self.assertEqual(self.ctl.prune_images([IMAGE]), [IMAGE])
        cmd.assert_not_called()
        self.ctl.image_inventory.return_value = {IMAGE: {'RepoTags': [TAG]}}
        with patch.object(c, 'command', return_value='stopped-container') as cmd:
            self.assertEqual(self.ctl.prune_images(), [IMAGE])
        self.assertEqual(cmd.call_count, 1)

    def test_interrupted_import_discovered_only_from_intent(self):
        self.ctl.gc['imports'][TAG] = {'pr': '1', 'sha': 'b'*40}
        self.ctl.image_inventory.side_effect = [{IMAGE: {'RepoTags': [TAG]}}, {}, {}]
        with patch.object(c, 'command', return_value='') as cmd:
            self.ctl.prune_images()
        self.assertIn(unittest.mock.call(['docker', 'image', 'rm', TAG]), cmd.call_args_list)
        self.assertEqual(self.ctl.gc, {'imports': {}, 'images': {}})

    def test_daemon_failure_does_not_forget_journal(self):
        self.ctl.track_images([IMAGE])
        self.ctl.image_inventory.side_effect = RuntimeError('offline')
        with self.assertRaises(RuntimeError): self.ctl.prune_images()
        self.assertIn(IMAGE, json.loads(self.ctl.gc_path.read_text())['images'])

    def test_success_exit_but_image_still_present_is_retryable(self):
        with patch.object(c, 'command', return_value=''):
            self.assertEqual(self.ctl.prune_images([IMAGE]), [IMAGE])
        self.assertIn(IMAGE, self.ctl.gc['images'])

    def test_abandoned_import_directory_removed_but_other_files_untouched(self):
        (self.root / 'import-abandoned').mkdir()
        (self.root / 'import-abandoned' / 'archive').write_text('test')
        (self.root / 'audit').mkdir()
        (self.root / 'audit' / 'manual-proof').write_text('keep')
        self.ctl.image_inventory.return_value = {}
        self.ctl.collect_garbage()
        self.assertFalse((self.root / 'import-abandoned').exists())
        self.assertTrue((self.root / 'audit' / 'manual-proof').exists())
        self.assertEqual(json.loads((self.root / 'gc-status.json').read_text())['status'], 'ok')

    def setup_retirement(self):
        self.ctl.allocate('1')
        self.ctl.cf = Mock()
        self.ctl.github = Mock()
        self.ctl.github.pr.return_value = pr(1, state='closed')
        self.ctl.compose = Mock()
        self.ctl.image_inventory.return_value = {}

    def test_leftover_volume_blocks_forgetting_and_data_deletion(self):
        self.setup_retirement()
        with patch.object(c, 'command', side_effect=['', 'leftover-volume']):
            with self.assertRaises(RuntimeError): self.ctl.retire('1')
        self.assertIn('1', self.ctl.entries)
        self.assertTrue(self.ctl.envpath('1').exists())

    def test_retry_after_folder_removal_and_publication_failure(self):
        self.setup_retirement()
        self.ctl.github.comment.side_effect = RuntimeError('GitHub offline')
        with patch.object(c, 'command', return_value=''):
            with self.assertRaises(RuntimeError): self.ctl.retire('1')
        self.assertFalse(self.ctl.folder('1').exists())
        self.assertIn('1', self.ctl.entries)
        self.ctl.github.comment.side_effect = None
        with patch.object(c, 'command', return_value=''):
            self.ctl.retire('1')
        self.assertNotIn('1', self.ctl.entries)
        self.ctl.compose.assert_called_once()

    def test_first_import_is_durable_when_second_artifact_fails(self):
        self.ctl.allocate('1')
        self.ctl.current = Mock()
        self.ctl.capacity_guard = Mock()
        sha = 'b'*40
        def run(args, **kwargs):
            if args[:3] == ['gh', 'run', 'download']:
                dest = Path(args[-1])
                if dest.name == 'storefront':
                    raise RuntimeError('second artifact unavailable')
                dest.mkdir(parents=True)
                (dest/'source-sha.txt').write_text(sha)
                (dest/'medusa.tar.gz').write_bytes(b'image')
                (dest/'medusa.sha256').write_text(c.hashlib.sha256(b'image').hexdigest())
            elif args[:2] == ['docker', 'load']:
                persisted = json.loads(self.ctl.gc_path.read_text())
                self.assertIn(TAG, persisted['imports'])
            elif args[:3] == ['docker', 'image', 'inspect']:
                return json.dumps([{'Id': IMAGE, 'Config': {'Labels': {'org.opencontainers.image.revision': sha}}}])
            return ''
        with patch.object(c, 'command', side_effect=run):
            with self.assertRaises(RuntimeError): self.ctl.import_images('1', sha, {'id': 7})
        restored = c.Controller(self.cfg, self.root)
        self.assertIn(IMAGE, restored.gc['images'])
        self.assertIn(IMAGE, restored.entries['1']['pending_images'])
        self.assertFalse(list(self.root.glob('import-*')))
