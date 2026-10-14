"""Reversible metadata-journal regression tests. All writes use temporary dirs."""
import copy
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from metadata_history import record_change, replay_change


def encode(value):
    return json.dumps(value, ensure_ascii=False).encode("utf-8")


class MetadataHistoryTest(unittest.TestCase):
    def journal(self, before, after, directory):
        path = record_change(encode(before), encode(after), directory)
        return path, json.loads(path.read_bytes())

    def test_nested_roundtrip_add_remove_lists_and_escaped_keys(self):
        before = {"a/b~c": {"remove": None, "same": "giữ", "replace": True},
                  "pages": [{"review": "pending", "x": [1, 2]}, {"keep": "yes"}]}
        after = {"a/b~c": {"add": ["new"], "same": "giữ", "replace": 1},
                 "pages": [{"review": "PASS", "x": [1, 2, 3]}, {"keep": "yes", "flag": False}]}
        with tempfile.TemporaryDirectory() as directory:
            _, journal = self.journal(before, after, directory)
            snapshot = copy.deepcopy(before)
            self.assertEqual(replay_change(before, journal), after)
            self.assertEqual(before, snapshot)
            self.assertEqual(replay_change(after, journal, reverse=True), before)
            self.assertEqual({op["op"] for op in journal["operations"]}, {"add", "remove", "replace"})
            self.assertTrue(any(op["path"] == ["a/b~c", "replace"] for op in journal["operations"]))
            self.assertTrue(any(op["path"] == ["pages", 0, "review"] for op in journal["operations"]))
            self.assertTrue(any(op["path"] == ["pages", 0, "x"] and op["op"] == "replace"
                                for op in journal["operations"]))

    def test_root_replacements_and_list_index_recursion(self):
        for before, after in [(None, {"x": 1}), ([1, {"x": True}], [2, {"x": False}]),
                              ([1], []), ({}, []), ("old", "new")]:
            with self.subTest(before=before), tempfile.TemporaryDirectory() as directory:
                _, journal = self.journal(before, after, directory)
                self.assertEqual(replay_change(before, journal), after)
                self.assertEqual(replay_change(after, journal, reverse=True), before)

    def test_exact_noop_creates_no_history(self):
        with tempfile.TemporaryDirectory() as directory:
            history = Path(directory) / "not-created"
            self.assertIsNone(record_change(b'{"x":1}', b'{"x":1}', history))
            self.assertFalse(history.exists())

    def test_format_only_tracks_raw_hashes_without_claiming_exact_reconstruction(self):
        before = b'{"x":1,"y":2}'
        after = b'{ "y": 2, "x": 1 }\n'
        with tempfile.TemporaryDirectory() as directory:
            path = record_change(before, after, directory)
            journal = json.loads(path.read_bytes())
            self.assertNotEqual(journal["before"]["raw_sha256"], journal["after"]["raw_sha256"])
            self.assertEqual(journal["before"]["semantic_sha256"], journal["after"]["semantic_sha256"])
            self.assertEqual(journal["operations"], [])
            self.assertEqual(replay_change(json.loads(before), journal), json.loads(after))

    def test_duplicate_safe_immutable_journal_and_conflicting_existing_file(self):
        before, after = encode({"x": 1}), encode({"x": 2})
        with tempfile.TemporaryDirectory() as directory:
            path = record_change(before, after, directory)
            content, stamp = path.read_bytes(), path.stat().st_mtime_ns
            self.assertEqual(record_change(before, after, directory), path)
            self.assertEqual(path.read_bytes(), content)
            self.assertEqual(path.stat().st_mtime_ns, stamp)
            path.write_bytes(b'{"corrupt":true}')
            with self.assertRaisesRegex(ValueError, "conflict|corrupt"):
                record_change(before, after, directory)
            self.assertEqual(path.read_bytes(), b'{"corrupt":true}')

    def test_stale_input_and_tampered_operations_are_rejected_without_input_mutation(self):
        before, after = {"keep": [1, 2], "x": "old"}, {"keep": [1, 2], "x": "new"}
        with tempfile.TemporaryDirectory() as directory:
            _, journal = self.journal(before, after, directory)
            with self.assertRaisesRegex(ValueError, "starting semantic hash"):
                replay_change({"x": "stale"}, journal)
            for mutate in [lambda j: j["operations"][0].update(after="tampered"),
                           lambda j: j["operations"][0].update(before="incorrect"),
                           lambda j: j["operations"][0].update(path=["missing"]),
                           lambda j: j["after"].update(semantic_sha256="0" * 64),
                           lambda j: j["operations"].clear()]:
                changed = copy.deepcopy(journal)
                mutate(changed)
                untouched = copy.deepcopy(before)
                with self.assertRaises(ValueError):
                    replay_change(before, changed)
                self.assertEqual(before, untouched)

    def test_rejects_invalid_paths_and_journal_schema(self):
        with tempfile.TemporaryDirectory() as directory:
            _, journal = self.journal({"pages": [1]}, {"pages": [2]}, directory)
            for path in [["pages", -1], ["pages", True], ["pages", "0"], ["pages", 3], [None], "pages/0"]:
                changed = copy.deepcopy(journal)
                changed["operations"][0]["path"] = path
                with self.subTest(path=path), self.assertRaises(ValueError):
                    replay_change({"pages": [1]}, changed)
            changed = copy.deepcopy(journal)
            changed["schema"] = "unknown"
            with self.assertRaises(ValueError):
                replay_change({"pages": [1]}, changed)

    def test_rejects_non_json_nonfinite_and_duplicate_keys(self):
        with tempfile.TemporaryDirectory() as directory:
            for raw in [b'not JSON', b'{"x":NaN}', b'{"x":1e999}', b'{"x":1,"x":2}', b'\xff', b'{"x":"\\ud800"}']:
                with self.subTest(raw=raw), self.assertRaises(ValueError):
                    record_change(raw, b'{}', directory)
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_concurrent_duplicate_creation_is_atomic_and_leaves_one_journal(self):
        before, after = encode({"x": 1}), encode({"x": 2})
        with tempfile.TemporaryDirectory() as directory, ThreadPoolExecutor(max_workers=4) as pool:
            paths = list(pool.map(lambda _: record_change(before, after, directory), range(12)))
            self.assertTrue(all(path == paths[0] for path in paths))
            self.assertEqual(list(Path(directory).iterdir()), [paths[0]])
            self.assertEqual(replay_change({"x": 1}, json.loads(paths[0].read_bytes())), {"x": 2})

    def test_existing_symlink_is_not_accepted_as_immutable_journal(self):
        with tempfile.TemporaryDirectory() as directory:
            path, _ = self.journal({"x": 1}, {"x": 2}, directory)
            target = Path(directory) / "external.json"
            path.rename(target)
            path.symlink_to(target)
            with self.assertRaisesRegex(ValueError, "conflict|corrupt"):
                record_change(encode({"x": 1}), encode({"x": 2}), directory)
            self.assertTrue(path.is_symlink())

    def test_replay_rejects_python_values_that_are_not_json_values(self):
        with tempfile.TemporaryDirectory() as directory:
            _, journal = self.journal([1], [2], directory)
            for document in [(1,), {1: "x"}, {"x": {1, 2}}]:
                with self.subTest(document=document), self.assertRaises(ValueError):
                    replay_change(document, journal)

    def test_records_correct_raw_hashes_and_one_file_per_transition(self):
        before, after = b'{"x":1}', b'{"x":2}'
        with tempfile.TemporaryDirectory() as directory:
            path = record_change(before, after, directory)
            journal = json.loads(path.read_bytes())
            self.assertEqual(journal["before"]["raw_sha256"], hashlib.sha256(before).hexdigest())
            self.assertEqual(journal["after"]["raw_sha256"], hashlib.sha256(after).hexdigest())
            self.assertEqual(list(Path(directory).iterdir()), [path])


if __name__ == "__main__":
    unittest.main()
