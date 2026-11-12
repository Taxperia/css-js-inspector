"""Validate and package only the runtime files. No third-party Python packages required."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parent.parent
RUNTIME = (
    "manifest.json", "background.js", "content/content.js", "inject/main.js",
    "sidepanel/sidepanel.html", "sidepanel/sidepanel.css", "sidepanel/sidepanel.js",
    "icons/icon16.png", "icons/icon32.png", "icons/icon48.png", "icons/icon128.png",
    "privacy.html", "LICENSE",
)


def validate() -> dict:
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["manifest_version"] == 3
    assert re.fullmatch(r"\d+(?:\.\d+){0,3}", manifest["version"])
    assert len(manifest["description"]) <= 132, "Manifest description exceeds 132 characters"
    assert set(manifest["permissions"]) == {"activeTab", "scripting", "sidePanel"}
    assert not manifest.get("host_permissions"), "Do not request required access to all websites"
    assert not manifest.get("content_scripts"), "Default inspection must be user initiated"
    assert set(manifest["optional_host_permissions"]) == {"http://*/*", "https://*/*"}
    for name in RUNTIME:
        path = ROOT / name
        assert path.is_file() and not path.is_symlink(), f"Missing or symlinked runtime file: {name}"
    for size in (16, 32, 48, 128):
        data = (ROOT / f"icons/icon{size}.png").read_bytes()
        assert data[:8] == b"\x89PNG\r\n\x1a\n"
        assert struct.unpack(">II", data[16:24]) == (size, size)
    assert (ROOT / "privacy.html").read_bytes() == (ROOT / "docs/privacy.html").read_bytes(), "Privacy copies differ"
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Node.js is required for JavaScript syntax validation")
    for name in RUNTIME:
        if name.endswith(".js"):
            subprocess.run([node, "--check", str(ROOT / name)], check=True, timeout=20)
    print(f"Validated Manifest V3 {manifest['version']}; description {len(manifest['description'])}/132 characters; {len(RUNTIME)} runtime files")
    return manifest


def package() -> Path:
    manifest = validate()
    output = ROOT / "dist"
    output.mkdir(exist_ok=True)
    archive = output / f"css-js-inspector-{manifest['version']}.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as target:
        for name in sorted(RUNTIME):
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            target.writestr(info, (ROOT / name).read_bytes())
    with zipfile.ZipFile(archive) as target:
        assert target.testzip() is None
        assert set(target.namelist()) == set(RUNTIME)
        for name in RUNTIME:
            assert target.read(name) == (ROOT / name).read_bytes(), f"Archive mismatch: {name}"
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (output / "SHA256SUMS.txt").write_text(f"{digest}  {archive.name}\n", encoding="utf-8")
    print(f"Package: {archive}\nSHA256: {digest}\nSize: {archive.stat().st_size} bytes")
    return archive


if __name__ == "__main__":
    if sys.argv[1:] == ["--check"]:
        validate()
    elif not sys.argv[1:]:
        package()
    else:
        raise SystemExit("Usage: python scripts/package.py [--check]")
