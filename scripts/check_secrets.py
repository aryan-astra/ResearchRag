"""Check publishable files and reachable Git history without displaying secrets.

Run: python scripts/check_secrets.py --history
This is a focused heuristic guard, not a replacement for GitHub secret scanning.
"""
from __future__ import annotations

import argparse
import re
import subprocess
from pathlib import Path

RULES = {
    "provider credential": re.compile(
        rb"(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}|gsk_[A-Za-z0-9]{20,}|"
        rb"AIza[A-Za-z0-9_-]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|"
        rb"github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16})"
    ),
    "private key": re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "assigned credential": re.compile(
        rb"(?im)^[ \t]*(?:[A-Z][A-Z0-9_]*_)?(?:API_KEY|ACCESS_TOKEN|SECRET_KEY|PASSWORD)"
        rb"[ \t]*[=:][ \t]*[\"']?([A-Za-z0-9_+/=-]{24,})"
    ),
}


def scan(data: bytes) -> list[tuple[str, int]]:
    return [(rule, data[:match.start()].count(b"\n") + 1)
            for rule, pattern in RULES.items() for match in pattern.finditer(data)]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--history", action="store_true")
    args = parser.parse_args()
    root = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
    paths = subprocess.check_output(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"], cwd=root
    ).decode().split("\0")
    found = 0
    for name in sorted(set(paths) - {""}):
        path = root / name
        if not path.is_file():
            continue
        for rule, line in scan(path.read_bytes()):
            print(f"{name}:{line}: possible {rule} (value withheld)")
            found += 1
    blobs = 0
    if args.history:
        objects = subprocess.check_output(["git", "rev-list", "--objects", "--all"], cwd=root)
        with subprocess.Popen(["git", "cat-file", "--batch"], cwd=root,
                              stdin=subprocess.PIPE, stdout=subprocess.PIPE) as batch:
            for entry in objects.splitlines():
                oid, _, name = entry.partition(b" ")
                if not name:
                    continue
                batch.stdin.write(oid + b"\n")
                batch.stdin.flush()
                header = batch.stdout.readline().split()
                data = batch.stdout.read(int(header[2]))
                batch.stdout.read(1)
                if header[1] != b"blob":
                    continue
                blobs += 1
                for rule, line in scan(data):
                    print(f"history {oid[:12].decode()} {name.decode(errors='replace')}:{line}: "
                          f"possible {rule} (value withheld)")
                    found += 1
            batch.stdin.close()
    print(f"Checked publishable files and {blobs} historical blobs; {found} candidate(s).")
    return 1 if found else 0


if __name__ == "__main__":
    raise SystemExit(main())
