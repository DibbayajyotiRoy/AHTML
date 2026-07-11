"""Conformance shim for ahtml-py (TASKS.md T4.4 / T2.8).

Exposes the Python SDK over the runner command contract defined in
packages/conformance/src/runner.ts. Exit codes: 0 ok/verified/refused,
3 invalid/not-verified/not-refused, 2 usage error.

    python3 python/tests/shim_py.py <op> <file...>
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import ahtml  # noqa: E402
from ahtml import ActionRefused, run_action  # noqa: E402
from ahtml.sign import import_jwk, verify_snapshot  # noqa: E402
from ahtml.errors import AHTMLError  # noqa: E402


def read(i: int) -> str:
    return Path(sys.argv[2 + i]).read_text()


def main() -> int:
    op = sys.argv[1]
    if op == "canonical-json":
        sys.stdout.write(ahtml.to_json(ahtml.from_json(read(0))))
        return 0
    if op == "to-compact":
        sys.stdout.write(ahtml.to_compact(ahtml.from_json(read(0))))
        return 0
    if op == "parse-compact":
        sys.stdout.write(ahtml.to_json(ahtml.from_compact(read(0))))
        return 0
    if op == "etag":
        sys.stdout.write(ahtml.compute_etag(ahtml.from_json(read(0))))
        return 0
    if op == "diff":
        from ahtml._json import dumps  # JS JSON.stringify-compatible bytes

        sys.stdout.write(dumps(ahtml.diff(ahtml.from_json(read(0)), ahtml.from_json(read(1)))))
        return 0
    if op == "validate":
        try:
            ahtml.validate_strict(json.loads(read(0)))
            return 0
        except (AHTMLError, ValueError, KeyError, TypeError):
            return 3
    if op == "verify":
        snap = json.loads(read(0))
        jws = read(1).strip()
        key = import_jwk(json.loads(read(2)))
        if key is None:
            return 3
        return 0 if verify_snapshot(snap, jws, trusted_keys=[key]).ok else 3
    if op == "action-gate":
        fixture = json.loads(read(0))
        try:
            run_action(fixture["snapshot"], fixture["action"], {}, bearer="tok")
            return 3  # executed without confirmation — MUST-004 violated
        except ActionRefused:
            return 0
    if op == "dryrun-gate":
        fixture = json.loads(read(0))

        def canned(method: str, url: str, body: object, headers: dict) -> tuple:
            return 200, fixture["response"]

        try:
            run_action(
                fixture["snapshot"],
                fixture["action"],
                {},
                bearer="tok",
                confirm=True,
                dry_run=fixture["phase"] == "dry_run",
                http=canned,
            )
            return 0 if fixture["expect"] == "accept" else 3
        except ActionRefused:
            return 0 if fixture["expect"] == "refuse" else 3
    sys.stderr.write(f'unknown op "{op}"\n')
    return 2


if __name__ == "__main__":
    sys.exit(main())
