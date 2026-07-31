"""Media path allowlist for Local Agent register/stream."""

from __future__ import annotations

import os
from pathlib import Path

from adapters.media import MediaError

VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}


def media_roots(data_dir: Path) -> list[Path]:
    raw = os.getenv("BML_MEDIA_ROOTS", "").strip()
    roots: list[Path] = []
    if raw:
        for part in raw.split(os.pathsep):
            part = part.strip()
            if part:
                roots.append(Path(part).expanduser().resolve())
    else:
        videos = Path.home() / "Videos"
        if videos.exists():
            roots.append(videos.resolve())
        fixtures = Path(__file__).resolve().parents[3] / "validation" / "fixtures"
        roots.append(fixtures.resolve())
    captures = (data_dir / "captures").resolve()
    if captures not in roots:
        roots.append(captures)
    return roots


def secrets_dir(data_dir: Path) -> Path:
    return (data_dir / "secrets").resolve()


def assert_allowed_media_path(path: Path, *, data_dir: Path) -> Path:
    resolved = path.expanduser().resolve()
    if not resolved.is_file():
        raise MediaError(f"File not found: {path}")
    if resolved.suffix.lower() not in VIDEO_EXTENSIONS:
        raise MediaError(f"Unsupported media extension: {resolved.suffix}")
    secrets = secrets_dir(data_dir)
    try:
        resolved.relative_to(secrets)
        raise MediaError("Refusing to register files under secrets directory")
    except ValueError:
        pass
    for root in media_roots(data_dir):
        try:
            resolved.relative_to(root)
            return resolved
        except ValueError:
            continue
    raise MediaError(
        "Path outside BML_MEDIA_ROOTS allowlist. "
        f"Set BML_MEDIA_ROOTS or place video under: {[str(r) for r in media_roots(data_dir)]}"
    )
