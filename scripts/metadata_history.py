"""Small reversible JSON metadata journals, without full-manifest snapshots.

Raw hashes identify the input bytes. Replay reconstructs JSON values and checks
canonical semantic hashes; it does NOT reproduce whitespace or original bytes.
No images are read, written, transformed, or deleted by this module.
"""
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile

SCHEMA = "comic-metadata-journal-v1"
SHA256 = re.compile(r"^[a-f0-9]{64}$")


def _reject_constant(value):
    raise ValueError(f"Non-finite JSON number: {value}")


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def _parse(raw):
    if not isinstance(raw, bytes):
        raise ValueError("Metadata input must be JSON bytes")
    try:
        return json.loads(raw.decode("utf-8"), parse_constant=_reject_constant,
                          object_pairs_hook=_unique_object)
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ValueError("Metadata input must contain valid UTF-8 JSON") from error


def _canonical(value):
    def check(item):
        if type(item) is dict:
            if any(type(key) is not str for key in item):
                raise ValueError("JSON object keys must be strings")
            for child in item.values():
                check(child)
        elif type(item) is list:
            for child in item:
                check(child)
        elif type(item) not in (str, int, float, bool, type(None)):
            raise ValueError("Document must contain only valid JSON values")
    check(value)
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True,
                          separators=(",", ":"), allow_nan=False).encode("utf-8")
    except (TypeError, ValueError, UnicodeError) as error:
        raise ValueError("Document must contain only valid JSON values") from error


def _sha(raw):
    return hashlib.sha256(raw).hexdigest()


def _same(left, right):
    # Python considers True == 1; journals must preserve the JSON value types.
    if type(left) is not type(right):
        return False
    if isinstance(left, dict):
        return left.keys() == right.keys() and all(_same(value, right[key]) for key, value in left.items())
    if isinstance(left, list):
        return len(left) == len(right) and all(_same(a, b) for a, b in zip(left, right))
    return left == right


def _diff(before, after, path, operations):
    if type(before) is type(after) and isinstance(before, dict):
        for key in sorted(before.keys() | after.keys()):
            location = path + [key]
            if key not in before:
                operations.append({"op": "add", "path": location, "after": after[key]})
            elif key not in after:
                operations.append({"op": "remove", "path": location, "before": before[key]})
            else:
                _diff(before[key], after[key], location, operations)
    elif type(before) is type(after) and isinstance(before, list) and len(before) == len(after):
        for index, (old, new) in enumerate(zip(before, after)):
            _diff(old, new, path + [index], operations)
    elif not _same(before, after):
        operations.append({"op": "replace", "path": path, "before": before, "after": after})


def record_change(before_bytes, after_bytes, history_dir):
    """Write one immutable semantic journal; return its Path or None for no-op.

    Both inputs must be valid UTF-8 JSON bytes. The journal records exact raw
    SHA-256 values and deterministic canonical JSON SHA-256 values. A duplicate
    transition returns the existing unchanged file; a conflicting file raises.
    """
    before, after = _parse(before_bytes), _parse(after_bytes)
    if before_bytes == after_bytes:
        return None
    operations = []
    _diff(before, after, [], operations)
    journal = {"schema": SCHEMA,
               "before": {"raw_sha256": _sha(before_bytes), "semantic_sha256": _sha(_canonical(before))},
               "after": {"raw_sha256": _sha(after_bytes), "semantic_sha256": _sha(_canonical(after))},
               "operations": operations}
    encoded = _canonical(journal) + b"\n"
    directory = Path(history_dir)
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / f"{journal['before']['raw_sha256']}-{journal['after']['raw_sha256']}.json"

    def check_existing():
        if destination.is_symlink() or destination.read_bytes() != encoded:
            raise ValueError(f"Existing metadata journal is corrupt or conflicts: {destination}")

    if destination.exists() or destination.is_symlink():
        check_existing()
        return destination
    # Atomic exclusive publication avoids both overwrite races and partial
    # journals. Temporary bytes are in the same filesystem and always removed.
    descriptor, temporary = tempfile.mkstemp(prefix=".metadata-journal-", dir=directory)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(temporary, destination)
        except FileExistsError:
            check_existing()
    finally:
        Path(temporary).unlink(missing_ok=True)
    return destination


def _validate_journal(journal):
    fields = {"schema", "before", "after", "operations"}
    if (not isinstance(journal, dict) or set(journal) != fields
            or journal.get("schema") != SCHEMA):
        raise ValueError("Invalid metadata journal schema")
    for side in ("before", "after"):
        header = journal[side]
        if not isinstance(header, dict) or set(header) != {"raw_sha256", "semantic_sha256"} or any(
                not isinstance(value, str) or not SHA256.fullmatch(value) for value in header.values()):
            raise ValueError("Invalid metadata journal hashes")
    if not isinstance(journal["operations"], list):
        raise ValueError("Invalid metadata journal operations")
    for operation in journal["operations"]:
        fields = {"add": {"op", "path", "after"}, "remove": {"op", "path", "before"},
                  "replace": {"op", "path", "before", "after"}}
        if (not isinstance(operation, dict) or not isinstance(operation.get("op"), str)
                or set(operation) != fields.get(operation.get("op"))):
            raise ValueError("Invalid metadata journal operation")
        path = operation["path"]
        if not isinstance(path, list) or any(
                type(item) not in (str, int) or (type(item) is int and item < 0) for item in path):
            raise ValueError("Invalid metadata journal path")
        if not path and operation["op"] != "replace":
            raise ValueError("Only replacements may address the JSON root")
        _canonical(operation)  # Reject non-JSON values supplied directly by API callers.


def _child(container, key):
    if isinstance(container, dict) and type(key) is str and key in container:
        return container[key]
    if isinstance(container, list) and type(key) is int and 0 <= key < len(container):
        return container[key]
    raise ValueError("Metadata journal path does not address an existing value")


def replay_change(document, journal, reverse=False):
    """Return a new JSON value after forward/reverse replay, verified by hashes.

    Replay verifies semantic content, not original byte formatting. Input values
    and the journal are never mutated. Existing full QA gates remain mandatory
    before publication: replaying metadata does not certify image/source quality.
    """
    if type(reverse) is not bool:
        raise ValueError("reverse must be a boolean")
    _validate_journal(journal)
    start, end = ("after", "before") if reverse else ("before", "after")
    if _sha(_canonical(document)) != journal[start]["semantic_sha256"]:
        raise ValueError("Document does not match starting semantic hash")
    result = copy.deepcopy(document)
    operations = reversed(journal["operations"]) if reverse else journal["operations"]
    for operation in operations:
        kind, path = operation["op"], operation["path"]
        previous, new = operation.get("before"), operation.get("after")
        if reverse:
            kind = {"add": "remove", "remove": "add", "replace": "replace"}[kind]
            previous, new = new, previous
        if not path:
            if not _same(result, previous):
                raise ValueError("Metadata journal previous root value does not match")
            result = copy.deepcopy(new)
            continue
        parent = result
        for key in path[:-1]:
            parent = _child(parent, key)
        key = path[-1]
        if kind == "add":
            if not isinstance(parent, dict) or type(key) is not str or key in parent:
                raise ValueError("Metadata journal addition requires a missing object key")
            parent[key] = copy.deepcopy(new)
        else:
            if not _same(_child(parent, key), previous):
                raise ValueError("Metadata journal previous value does not match")
            if kind == "remove":
                if not isinstance(parent, dict):
                    raise ValueError("Metadata journal removals require object keys")
                del parent[key]
            else:
                parent[key] = copy.deepcopy(new)
    if _sha(_canonical(result)) != journal[end]["semantic_sha256"]:
        raise ValueError("Replayed document does not match final semantic hash")
    return result
