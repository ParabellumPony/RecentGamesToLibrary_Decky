"""Write provenance for downloaded references, entirely within the project."""
from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parents[1] / "research"
sources = []
for name, repo in [
    ("template", "SteamDeckHomebrew/decky-plugin-template"),
    ("frontend-lib", "SteamDeckHomebrew/decky-frontend-lib"),
    ("tabmaster", "Tormak9970/TabMaster"),
    ("deck-shelves", "santojon/Deck-Shelves"),
]:
    commit = json.loads((root / f"{name}-commit.json").read_text(encoding="utf-8"))
    sources.append({
        "file": f"{name}.zip", "repository": f"https://github.com/{repo}",
        "commit": commit["sha"], "commit_date": commit["commit"]["committer"]["date"],
        "url": f"https://codeload.github.com/{repo}/zip/{commit['sha']}",
    })
steam = json.loads((root / "steamui-files.json").read_text(encoding="utf-8"))
for local, remote in [("steam-shared.js", "chunk~2dcc5aaf7.js"),
                      ("steam-library.js", "library.js"), ("steam-sp.js", "sp.js")]:
    metadata = next(item for item in steam if item["name"] == remote)
    sources.append({"file": local, "url": metadata["download_url"], "git_blob": metadata["sha"]})
sources.append({
    "file": "decky-plugin-loader.py",
    "url": "https://raw.githubusercontent.com/SteamDeckHomebrew/decky-loader/main/backend/decky_loader/plugin/plugin.py",
})
for local, remote in [
    ("decky-router-hook.tsx", "frontend/src/router-hook.tsx"),
    ("decky-plugin-browser.py", "backend/decky_loader/browser.py"),
]:
    sources.append({"file": local,
                    "url": f"https://raw.githubusercontent.com/SteamDeckHomebrew/decky-loader/main/{remote}"})
for source in sources:
    data = (root / source["file"]).read_bytes()
    source.update({"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)})
(root / "sources.json").write_text(json.dumps({
    "accessed": "2026-09-08", "sources": sources,
}, indent=2) + "\n", encoding="utf-8")
print(f"Recorded {len(sources)} downloaded references in research/sources.json")
