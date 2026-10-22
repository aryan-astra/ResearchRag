"""The offline safety checks for the optional model downloader."""

import hashlib
import io
import zipfile

import pytest

from scripts.local_model import download, extract_runtime, server_command


def artifact(content):
    return {
        "url": "https://example.test/model",
        "size": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
    }


def test_download_verifies_before_replacing_lfs_pointer(tmp_path, monkeypatch):
    content = b"GGUF model test bytes"
    path = tmp_path / "model.gguf"
    path.write_bytes(b"version https://git-lfs.github.com/spec/v1\noid sha256:test\n")
    monkeypatch.setattr("urllib.request.urlopen", lambda *a, **k: io.BytesIO(content))
    download(artifact(content), path)
    assert path.read_bytes() == content
    assert not path.with_suffix(".gguf.partial").exists()


def test_download_rejects_corruption_and_preserves_existing_file(tmp_path, monkeypatch):
    path = tmp_path / "model.gguf"
    monkeypatch.setattr("urllib.request.urlopen", lambda *a, **k: io.BytesIO(b"corrupt"))
    with pytest.raises(ValueError, match="Checksum"):
        download(artifact(b"expected"), path)
    assert not path.exists()
    assert not path.with_suffix(".gguf.partial").exists()
    path.write_bytes(b"user content")
    with pytest.raises(ValueError, match="Unexpected content"):
        download(artifact(b"expected"), path)
    assert path.read_bytes() == b"user content"


def test_runtime_archive_cannot_escape_destination(tmp_path):
    archive = tmp_path / "runtime.zip"
    with zipfile.ZipFile(archive, "w") as bundle:
        bundle.writestr("../outside.exe", b"unsafe")
    with pytest.raises(ValueError, match="Unsafe path"):
        extract_runtime(archive, tmp_path / "runtime")
    assert not (tmp_path / "outside.exe").exists()


def test_local_server_is_cpu_only_loopback_and_bounded(tmp_path):
    command = server_command(tmp_path / "server", tmp_path / "weights", "local", 11434, 4)
    values = dict(zip(command[1::2], command[2::2]))
    assert values["--n-gpu-layers"] == "0"
    assert values["--host"] == "127.0.0.1"
    assert values["--ctx-size"] == "4096"
    assert values["--parallel"] == "1"
    assert values["--reasoning"] == "off"
    assert values["--cors-origins"] == "localhost"
