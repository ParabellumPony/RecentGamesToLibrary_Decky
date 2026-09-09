"""Build and package the plugin inside the project. Python standard library only."""
from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def archive(destination: Path, files: list[Path], prefix: str) -> None:
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as output:
        for source in sorted(set(files)):
            source = source.resolve()
            if not source.is_relative_to(ROOT):
                raise ValueError(f"File outside project: {source}")
            entry = zipfile.ZipInfo(f"{prefix}/{source.relative_to(ROOT).as_posix()}",
                                    date_time=(2026, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            entry.compress_type = zipfile.ZIP_DEFLATED
            output.writestr(entry, source.read_bytes())
    with zipfile.ZipFile(destination) as check:
        if check.testzip():
            raise RuntimeError("Archive integrity check failed")
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()
    destination.with_suffix(destination.suffix + ".sha256").write_text(
        f"{digest}  {destination.name}\n", encoding="utf-8")
    print(f"{destination.relative_to(ROOT)} ({destination.stat().st_size} bytes) SHA256 {digest}")


def main() -> None:
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    slug, version = package["name"], package["version"]
    if not re.fullmatch(r"[a-z0-9-]+", slug) or not re.fullmatch(r"[0-9A-Za-z.-]+", version):
        raise ValueError("Unsafe package name/version")
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Node.js is required to rebuild the plugin")
    cache = ROOT / ".cache"
    cache.mkdir(exist_ok=True)
    env = {**os.environ, "TMP": str(cache), "TEMP": str(cache), "TMPDIR": str(cache)}
    subprocess.run([node, str(ROOT / "node_modules/rollup/dist/bin/rollup"), "-c"],
                   cwd=ROOT, env=env, check=True)
    subprocess.run([node, str(ROOT / "scripts/smoke-bundle.mjs")],
                   cwd=ROOT, env=env, check=True)
    bundle = (ROOT / "dist/index.js").read_text(encoding="utf-8")
    if "export {" not in bundle or "SP_REACT" not in bundle or "DFL" not in bundle:
        raise RuntimeError("Bundle does not look like a Decky ES module")

    manifest = json.loads((ROOT / "plugin.json").read_text(encoding="utf-8"))
    if manifest["api_version"] != 1 or manifest["flags"]:
        raise RuntimeError("Expected an unprivileged Decky API v1 manifest")
    if manifest["author"] != package["author"]:
        raise RuntimeError("Package and Decky manifest authors must agree")

    artifacts = ROOT / "artifacts"
    artifacts.mkdir(exist_ok=True)
    # Explicit allowlist: no caches, research downloads or node_modules.
    runtime = [ROOT / name for name in [
        "plugin.json", "package.json", "dist/index.js", "dist/index.js.map",
        "README.md", "README.ru.md", "CHANGELOG.md", "LICENSE", "THIRD_PARTY_NOTICES.md",
        "docs/INSTALL.md", "docs/TESTING.md", "docs/RESEARCH.md", "docs/PUBLISHING.md",
        "research/README.md", "research/sources.json",
    ]]
    runtime += [p for p in (ROOT / "licenses").rglob("*") if p.is_file()]
    # Include rebuildable corresponding source with the installable release.
    runtime += [ROOT / name for name in ["package-lock.json", "rollup.config.js", "tsconfig.json", ".npmrc", ".gitignore"]]
    for folder in ["src", "scripts", "tests"]:
        runtime += [p for p in (ROOT / folder).glob("*") if p.is_file()]
    archive(artifacts / f"{slug}-v{version}.zip", runtime, slug)
    source = [p for p in runtime if not p.is_relative_to(ROOT / "dist")]
    archive(artifacts / f"{slug}-v{version}-source.zip", source, slug)


if __name__ == "__main__":
    main()
