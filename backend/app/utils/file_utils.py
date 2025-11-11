"""Utility helpers for working with RT-GIDS log files."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import List, Optional


DEFAULT_LOG_DIR = Path(os.getenv("RTGIDS_LOG_DIR", "D:/CN/RealTime_IDS/logs"))


def ensure_log_dir(log_dir: Path | None = None) -> Path:
    """Ensure the log directory exists and return it."""
    directory = log_dir or DEFAULT_LOG_DIR
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def get_log_files(log_dir: Path | None = None) -> List[Path]:
    """Return all log files sorted by modification time (descending)."""
    directory = ensure_log_dir(log_dir)
    files = [p for p in directory.glob("detection_log_*.txt") if p.is_file()]
    return sorted(files, key=lambda p: p.stat().st_mtime, reverse=True)


def get_latest_log_file(log_dir: Path | None = None) -> Optional[Path]:
    """Return the most recent log file, or None if no logs exist."""
    files = get_log_files(log_dir)
    return files[0] if files else None


async def read_last_lines(
    file_path: Path, limit: int = 200, encoding: str = "utf-8"
) -> List[str]:
    """Asynchronously read the last ``limit`` lines from a file."""
    if limit <= 0:
        return []

    # Reading line-by-line from the end to avoid loading entire file
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _read_last_lines_sync, file_path, limit, encoding)


def _read_last_lines_sync(file_path: Path, limit: int, encoding: str) -> List[str]:
    """Blocking helper to fetch the last N lines efficiently."""
    lines: List[str] = []
    with file_path.open("r", encoding=encoding, errors="ignore") as handle:
        buffer: list[str] = []
        for line in handle:
            buffer.append(line.rstrip("\n"))
            if len(buffer) > limit:
                buffer.pop(0)
        lines.extend(buffer)
    return lines


