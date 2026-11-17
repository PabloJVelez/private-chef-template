import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('pilot', Path(__file__).with_name('deploy-pilot.py'))
pilot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pilot)

class HeadGuard(unittest.TestCase):
    def test_rejects_closed_stale_and_fork_heads(self):
        for data in (
            {'state': 'CLOSED', 'headRefOid': 'abc', 'isCrossRepository': False},
            {'state': 'OPEN', 'headRefOid': 'other', 'isCrossRepository': False},
            {'state': 'OPEN', 'headRefOid': 'abc', 'isCrossRepository': True},
        ):
            with self.subTest(data=data), patch.object(pilot, 'gh', return_value=data):
                with self.assertRaises(RuntimeError): pilot.current('41', 'abc')

    def test_accepts_current_open_same_repo_head(self):
        with patch.object(pilot, 'gh', return_value={'state': 'OPEN', 'headRefOid': 'abc', 'isCrossRepository': False}):
            pilot.current('41', 'abc')

if __name__ == '__main__': unittest.main()
