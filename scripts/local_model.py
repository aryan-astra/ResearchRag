"""Download verified local weights or serve them with a CPU-only llama.cpp runtime."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import shutil
import subprocess
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "models" / "local-model.json"
CACHE = ROOT / "data" / "local-model"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def download(artifact: dict, destination: Path) -> None:
    """Verify both cached and downloaded files; publish only a complete download."""
    if destination.exists():
        if (
            destination.stat().st_size == artifact["size"]
            and sha256(destination) == artifact["sha256"]
        ):
            print(f"Verified {destination.name}", flush=True)
            return
        # A checkout made without Git LFS has a pointer instead of the model bytes.
        if destination.stat().st_size > 1024 or not destination.read_bytes().startswith(
            b"version https://git-lfs.github.com/spec/v1\n"
        ):
            raise ValueError(
                f"Unexpected content at {destination}; move it aside before downloading"
            )
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_suffix(destination.suffix + ".partial")
    print(f"Downloading {destination.name} ({artifact['size'] / 1_000_000:.1f} MB)", flush=True)
    try:
        with (
            urllib.request.urlopen(artifact["url"], timeout=60) as source,
            partial.open("wb") as target,
        ):
            shutil.copyfileobj(source, target, length=1024 * 1024)
        if partial.stat().st_size != artifact["size"] or sha256(partial) != artifact["sha256"]:
            raise ValueError(f"Checksum or size mismatch for {destination.name}")
        os.replace(partial, destination)
    finally:
        partial.unlink(missing_ok=True)


def extract_runtime(archive: Path, destination: Path) -> Path:
    with zipfile.ZipFile(archive) as bundle:
        for member in bundle.infolist():
            if not (destination / member.filename).resolve().is_relative_to(destination.resolve()):
                raise ValueError("Unsafe path in runtime archive")
        bundle.extractall(destination)
    matches = list(destination.rglob("llama-server.exe"))
    if len(matches) != 1:
        raise ValueError("Runtime archive must contain exactly one llama-server.exe")
    return matches[0]


def server_command(executable: Path, model: Path, alias: str, port: int, threads: int) -> list[str]:
    return [
        str(executable),
        "--model",
        str(model),
        "--alias",
        alias,
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
        "--ctx-size",
        "4096",
        "--parallel",
        "1",
        "--n-gpu-layers",
        "0",
        "--threads",
        str(threads),
        "--threads-batch",
        str(threads),
        "--batch-size",
        "256",
        "--ubatch-size",
        "128",
        "--reasoning",
        "off",
        "--cors-origins",
        "localhost",
        "--presence-penalty",
        "2",
        "--top-k",
        "20",
        "--top-p",
        "1",
        "--min-p",
        "0",
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("download", "serve", "verify"))
    parser.add_argument("--port", type=int, default=11434)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument(
        "--runtime", type=Path, help="An existing llama-server executable on any platform"
    )
    args = parser.parse_args()
    if not 1 <= args.port <= 65535 or not 1 <= args.threads <= 256:
        parser.error("Port must be 1–65535 and threads must be 1–256")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    model = ROOT / "models" / manifest["model"]["name"]
    if args.action == "verify":
        if not model.exists() or sha256(model) != manifest["model"]["sha256"]:
            parser.exit(1, "Model missing or checksum mismatch; run the download action.\n")
        print(f"Verified {model.name}")
        return
    download(manifest["model"], model)
    if args.action == "download":
        return
    executable = args.runtime
    if executable is None:
        if platform.system() != "Windows" or platform.machine().lower() not in ("amd64", "x86_64"):
            parser.error(
                "Auto-setup supports Windows x64; pass --runtime /path/to/llama-server elsewhere"
            )
        archive = CACHE / manifest["runtime"]["name"]
        download(manifest["runtime"], archive)
        executable = extract_runtime(archive, CACHE / manifest["runtime"]["version"])
    command = server_command(
        executable.resolve(), model, manifest["model"]["alias"], args.port, args.threads
    )
    print(f"Serving CPU model at http://127.0.0.1:{args.port}/v1 (Ctrl+C to stop)", flush=True)
    try:
        subprocess.run(command, check=True)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
