#!/usr/bin/env python3
"""Zip web/ into a double-click computer copy."""
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
OUT_DIR = ROOT / "dist-computer"
OUT = OUT_DIR / "ATDD-computer-copy-1.2.0.zip"
SKIP_NAMES = {".DS_Store"}


def main():
    if not (WEB / "index.html").is_file():
        raise SystemExit("web/index.html is missing")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    prefix = Path("ATDD-computer-copy-1.2.0")
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(WEB.rglob("*")):
            if not path.is_file() or path.name in SKIP_NAMES:
                continue
            zf.write(path, (prefix / path.relative_to(WEB)).as_posix())
    print(OUT)
    print(OUT.stat().st_size)


if __name__ == "__main__":
    main()
