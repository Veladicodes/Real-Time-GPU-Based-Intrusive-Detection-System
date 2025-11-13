"""GPU utility helpers for telemetry collection."""

from __future__ import annotations

import contextlib
import shutil
import subprocess
from dataclasses import dataclass
from typing import Optional


@dataclass(slots=True)
class GPUStats:
    """Container for GPU telemetry."""

    name: str = "Unavailable"
    utilization: float = 0.0
    memory_used_mb: float = 0.0
    memory_total_mb: float = 0.0


def _query_via_pynvml() -> Optional[GPUStats]:
    try:  # pragma: no cover - optional dependency
        import pynvml  # type: ignore
    except Exception:
        return None

    with contextlib.suppress(Exception):
        pynvml.nvmlInit()
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        name = pynvml.nvmlDeviceGetName(handle).decode("utf-8")
        util = pynvml.nvmlDeviceGetUtilizationRates(handle)
        memory = pynvml.nvmlDeviceGetMemoryInfo(handle)
        stats = GPUStats(
            name=name,
            utilization=float(util.gpu),
            memory_used_mb=float(memory.used) / 1_000_000.0,
            memory_total_mb=float(memory.total) / 1_000_000.0,
        )
        pynvml.nvmlShutdown()
        return stats
    return None


def _query_via_nvidia_smi() -> Optional[GPUStats]:
    """Fallback GPU stats using the NVIDIA System Management Interface."""
    if not shutil.which("nvidia-smi"):  # pragma: no cover - depends on runtime
        return None

    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=utilization.gpu,memory.used,memory.total,name",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            check=True,
            timeout=2,
        )
        line = result.stdout.strip().splitlines()[0]
        util_str, mem_used_str, mem_total_str, *name_parts = [segment.strip() for segment in line.split(",")]
        name = ", ".join(name_parts) if name_parts else "NVIDIA GPU"
        return GPUStats(
            name=name,
            utilization=float(util_str),
            memory_used_mb=float(mem_used_str),
            memory_total_mb=float(mem_total_str),
        )
    except Exception:  # pragma: no cover - external command may not exist
        return None


def _query_via_torch() -> Optional[GPUStats]:
    try:  # pragma: no cover - optional dependency
        import torch
    except Exception:
        return None

    if not torch.cuda.is_available():  # pragma: no cover - depends on runtime
        return None

    try:
        device = torch.device("cuda:0")
        name = torch.cuda.get_device_name(device)
        with torch.cuda.device(device):
            memory_allocated = torch.cuda.memory_allocated(device) / 1_000_000.0
            memory_total = torch.cuda.get_device_properties(device).total_memory / 1_000_000.0
        # Torch does not expose real-time utilisation; estimate using stream occupancy if possible
        utilization = 0.0
        with contextlib.suppress(Exception):
            utilization = torch.cuda.utilization(device)  # type: ignore[attr-defined]
        return GPUStats(
            name=name,
            utilization=float(utilization),
            memory_used_mb=float(memory_allocated),
            memory_total_mb=float(memory_total),
        )
    except Exception:  # pragma: no cover - GPU metrics best effort
        return None


def get_gpu_stats() -> GPUStats:
    """Return the best-effort GPU telemetry stats."""
    for provider in (_query_via_pynvml, _query_via_nvidia_smi, _query_via_torch):
        stats = provider()
        if stats is not None:
            return stats
    return GPUStats()


def gpu_available() -> bool:
    """Return True if a GPU device appears to be accessible."""
    stats = get_gpu_stats()
    return stats.name != "Unavailable"

