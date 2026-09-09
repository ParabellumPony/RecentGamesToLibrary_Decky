"""Extract downloaded reference archives inside research, rejecting unsafe paths."""
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1] / "research"
for archive in sorted(root.glob("*.zip")):
    target = root / archive.stem
    if target.exists():
        continue
    with zipfile.ZipFile(archive) as source:
        for entry in source.infolist():
            relative = Path(*Path(entry.filename).parts[1:])
            if str(relative) == ".":
                continue
            destination = (target / relative).resolve()
            if not destination.is_relative_to(target.resolve()):
                raise ValueError(f"Unsafe archive path: {entry.filename}")
            if entry.is_dir():
                destination.mkdir(parents=True, exist_ok=True)
            else:
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(source.read(entry))
    print(f"Extracted {archive.name}")
