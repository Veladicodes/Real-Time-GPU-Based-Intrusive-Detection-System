"""GPU helper utilities for diagnostics, telemetry, and safe fallbacks."""

from __future__ import annotations

import contextlib
import shutil
import subprocess
from dataclasses import dataclass
from typing import Optional


# ============================================================
# Unified GPU metrics model
# ============================================================

@dataclass(slots=True)
class GPUStats:
    """Container for GPU telemetry."""

    name: str = "Unavailable"
    utilization: float = 0.0
    memory_used_mb: float = 0.0
    memory_total_mb: float = 0.0


# ============================================================
# Provider 1: NVIDIA Management Library (pynvml)
# ============================================================

def _query_via_pynvml() -> Optional[GPUStats]:
    """Query GPU metrics via pynvml bindings if available."""
    try:
        import pynvml  # type: ignore
    except Exception:
        return None

    try:
        pynvml.nvmlInit()
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        name = pynvml.nvmlDeviceGetName(handle)
        if isinstance(name, bytes):
            name = name.decode("utf-8")

        util = pynvml.nvmlDeviceGetUtilizationRates(handle)
        memory = pynvml.nvmlDeviceGetMemoryInfo(handle)

        stats = GPUStats(
            name=str(name),
            utilization=float(getattr(util, "gpu", 0.0)),
            memory_used_mb=float(memory.used) / 1_048_576.0,
            memory_total_mb=float(memory.total) / 1_048_576.0,
        )
        return stats
    except Exception:
        return None
    finally:
        with contextlib.suppress(Exception):
            pynvml.nvmlShutdown()


# ============================================================
# Provider 2: NVIDIA System Management Interface (nvidia-smi)
# ============================================================

def _query_via_nvidia_smi() -> Optional[GPUStats]:
    """Fallback GPU stats using nvidia-smi CLI."""
    if not shutil.which("nvidia-smi"):
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
        util_str, mem_used_str, mem_total_str, *name_parts = [
            segment.strip() for segment in line.split(",")
        ]
        name = ", ".join(name_parts) if name_parts else "NVIDIA GPU"
        return GPUStats(
            name=name,
            utilization=float(util_str),
            memory_used_mb=float(mem_used_str),
            memory_total_mb=float(mem_total_str),
        )
    except Exception:
        return None


# ============================================================
# Provider 3: PyTorch (fallback)
# ============================================================

def _query_via_torch() -> Optional[GPUStats]:
    """Try to read GPU stats via PyTorch CUDA API."""
    try:
        import torch  # type: ignore
    except Exception:
        return None

    if not torch.cuda.is_available():
        return None

    try:
        device = torch.device("cuda:0")
        name = torch.cuda.get_device_name(device)
        with torch.cuda.device(device):
            mem_used = torch.cuda.memory_allocated(device) / 1_048_576.0
            mem_total = torch.cuda.get_device_properties(device).total_memory / 1_048_576.0
        # Torch doesn’t expose real-time utilization, so set it to 0.0
        return GPUStats(
            name=name,
            utilization=0.0,
            memory_used_mb=float(mem_used),
            memory_total_mb=float(mem_total),
        )
    except Exception:
        return None


# ============================================================
# Public Interface
# ============================================================

def get_gpu_stats() -> GPUStats:
    """Return the best available GPU telemetry (tries multiple backends)."""
    for provider in (_query_via_pynvml, _query_via_nvidia_smi, _query_via_torch):
        stats = provider()
        if stats is not None:
            return stats
    return GPUStats()


def gpu_available() -> bool:
    """Return True if a GPU device appears to be accessible."""
    stats = get_gpu_stats()
    return stats.name != "Unavailable"
