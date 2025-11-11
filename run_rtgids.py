#!/usr/bin/env python3
"""RT-GIDS Tier-0 Orchestrator — Full-Stack Self-Healing Controller (Improved)

Changes:
- verify Docker daemon is running before attempting docker commands
- explicit pnpm detection on Windows (falls back to AppData\Roaming\npm\pnpm.cmd)
- clearer error messages instead of ambiguous WinError 2
- more robust run_cmd that returns stdout/stderr on request
- small log improvements and safer subprocess handling
"""

from __future__ import annotations
import argparse
import os
import sys
import time
import signal
import subprocess
import shutil
import threading
from pathlib import Path
from typing import Dict, Optional, Tuple

try:
    import requests
except Exception:
    requests = None

ROOT = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT / "frontend"
BACKEND_DIR = ROOT / "backend"
REDIS_CONTAINER = "rtgids-redis"
BACKEND_CONTAINER = "rtgids-backend-gpu"
BACKEND_IMAGE = "rtgids-backend:gpu"
DEFAULT_MODELS_PATH = ROOT / "RealTime_IDS" / "models"
DEFAULT_REDIS_DATA = ROOT / "redis-data"
DEFAULT_API_TOKEN = os.getenv("RTGIDS_API_TOKEN", "dev-token-abc")

CHECK_INTERVAL = 8
RETRY_LIMIT = 3


# ---------------------------------------------------------------------------
# Logging / Utilities
# ---------------------------------------------------------------------------
def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] [RT-GIDS] {msg}", flush=True)


def run_cmd(cmd: list[str], cwd: Optional[Path] = None, quiet: bool = False) -> Tuple[int, str, str]:
    """Run a command and optionally return stdout/stderr (decoded)."""
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(cwd) if cwd else None,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            encoding="utf-8",
            errors="replace",
        )
        if not quiet:
            if proc.stdout:
                print(proc.stdout.strip())
            if proc.stderr:
                print(proc.stderr.strip(), file=sys.stderr)
        return proc.returncode, proc.stdout or "", proc.stderr or ""
    except FileNotFoundError as fnf:
        return 2, "", str(fnf)


def check_bin(name: str) -> str:
    """Return path to binary or raise with a helpful message."""
    path = shutil.which(name)
    if not path:
        raise RuntimeError(f"❌ Required command '{name}' not found in PATH. Install it and ensure it's on PATH.")
    return path


# ---------------------------------------------------------------------------
# Docker helpers
# ---------------------------------------------------------------------------
def ensure_docker_running() -> None:
    """Fail fast if Docker daemon is not responding."""
    path = shutil.which("docker")
    if not path:
        raise RuntimeError("❌ 'docker' binary not found on PATH. Install Docker Desktop or Docker Engine.")
    # try a lightweight docker info call
    code, out, err = run_cmd(["docker", "info"], quiet=True)
    if code != 0:
        raise RuntimeError(
            "❌ Docker daemon not running or not accesible. Start Docker Desktop (Windows) or Docker service and retry.\n"
            f"docker info stderr: {err.strip()}"
        )


# ---------------------------------------------------------------------------
# Docker Lifecycle
# ---------------------------------------------------------------------------
def docker_up(redis: bool = True, backend: bool = True) -> None:
    ensure_docker_running()
    if redis:
        subprocess.run(["docker", "rm", "-f", REDIS_CONTAINER], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        log("Starting Redis container...")
        code, out, err = run_cmd(
            ["docker", "run", "-d", "--name", REDIS_CONTAINER, "-p", "6379:6379", "redis:7"],
            cwd=ROOT,
            quiet=True,
        )
        if code != 0:
            raise RuntimeError(f"Failed to start Redis container: {err.strip() or out.strip()}")
    if backend:
        subprocess.run(["docker", "rm", "-f", BACKEND_CONTAINER], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cmd = [
            "docker",
            "run",
            "-d",
            "-p",
            "8000:8000",
            "--name",
            BACKEND_CONTAINER,
            "-v",
            f"{DEFAULT_MODELS_PATH.resolve()}:/data/models:ro",
            "-v",
            f"{DEFAULT_REDIS_DATA.resolve()}:/data",
            "-e",
            "REDIS_URL=redis://host.docker.internal:6379/0",
            "-e",
            f"RTGIDS_API_TOKEN={DEFAULT_API_TOKEN}",
            BACKEND_IMAGE,
        ]
        # Attempt to add GPU flag only if Docker supports it; keep simple here to avoid hard failure
        # Most modern Docker versions accept --gpus but we avoid adding if unknown
        if shutil.which("nvidia-smi"):
            # hint that GPU might be desired; we append but tolerate failures
            cmd.insert(-1, "--gpus")
            cmd.insert(-1, "all")

        log("Starting backend container...")
        code, out, err = run_cmd(cmd, cwd=ROOT, quiet=True)
        if code != 0:
            raise RuntimeError(f"Failed to start backend container: {err.strip() or out.strip()}")
    log("✅ Containers launched.")


def docker_down() -> None:
    log("Stopping all Docker services...")
    for c in [BACKEND_CONTAINER, REDIS_CONTAINER]:
        subprocess.run(["docker", "rm", "-f", c], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


# ---------------------------------------------------------------------------
# Frontend lifecycle
# ---------------------------------------------------------------------------
def frontend_ready() -> None:
    pkg_lock = FRONTEND_DIR / "pnpm-lock.yaml"
    node_modules = FRONTEND_DIR / "node_modules"
    if not FRONTEND_DIR.exists() or not (FRONTEND_DIR / "package.json").exists():
        raise RuntimeError(f"❌ Frontend directory missing or incomplete at: {FRONTEND_DIR}")
    # If node_modules is missing or stale, install
    if not node_modules.exists() or (pkg_lock.exists() and pkg_lock.stat().st_mtime > node_modules.stat().st_mtime):
        log("⚙️  Frontend dependencies out of date or missing, running pnpm install...")
        pnpm_exec = detect_pnpm_executable()
        code, out, err = run_cmd([pnpm_exec, "install"], cwd=FRONTEND_DIR)
        if code != 0:
            raise RuntimeError(f"pnpm install failed: {err.strip() or out.strip()}")


def detect_pnpm_executable() -> str:
    """Return the pnpm path. On Windows, fall back to common global location."""
    pnpm_path = shutil.which("pnpm")
    if pnpm_path:
        return pnpm_path
    # fallback for Windows user-level install
    fallback = str(Path.home() / "AppData" / "Roaming" / "npm" / "pnpm.cmd")
    if Path(fallback).exists():
        return fallback
    # another possible fallback for npm global bin location
    fallback2 = str(Path.home() / "AppData" / "Roaming" / "npm" / "pnpm")
    if Path(fallback2).exists():
        return fallback2
    raise RuntimeError(
        "❌ pnpm not found. Install pnpm globally with `npm install -g pnpm` and ensure it's available on PATH."
    )


def start_frontend() -> subprocess.Popen:
    frontend_ready()
    pnpm_exec = detect_pnpm_executable()
    log(f"🚀 Launching Next.js frontend using {pnpm_exec} ...")
    flags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    preexec = None if os.name == "nt" else os.setsid
    try:
        return subprocess.Popen([pnpm_exec, "run", "dev"], cwd=str(FRONTEND_DIR), creationflags=flags, preexec_fn=preexec)
    except FileNotFoundError as e:
        raise RuntimeError(f"Failed to launch frontend: {e}. Ensure pnpm is installed and FRONTEND_DIR is correct.")


# ---------------------------------------------------------------------------
# Health / Telemetry
# ---------------------------------------------------------------------------
def ping_backend(url: str = "http://localhost:8000/api/health") -> bool:
    if not requests:
        return False
    try:
        r = requests.get(url, timeout=5)
        return r.status_code == 200
    except Exception:
        return False


def seed_telemetry(label: str = "heartbeat") -> None:
    if not requests:
        return
    payload = {
        "severity": "ALERT",
        "message": f"RT-GIDS {label}",
        "src_ip": "192.168.0.99",
        "dst_ip": "10.0.0.5",
        "proto": "TCP",
        "service": "orchestrator",
    }
    headers = {"Authorization": f"Bearer api::{DEFAULT_API_TOKEN}", "Content-Type": "application/json"}
    try:
        r = requests.post("http://localhost:8000/api/logs/ingest", json=payload, headers=headers, timeout=5)
        if r.status_code == 200:
            log(f"⚡️ Telemetry seeded ({label})")
        else:
            log(f"⚠️ Telemetry seed returned {r.status_code}: {r.text[:200]}")
    except Exception as e:
        log(f"⚠️ Telemetry seed failed: {e}")


def telemetry_loop(stop_event: threading.Event) -> None:
    while not stop_event.is_set():
        seed_telemetry("auto-pulse")
        stop_event.wait(25)


def monitor_system(stop_event: threading.Event) -> None:
    last_state = ""
    while not stop_event.is_set():
        alive = ping_backend()
        if not alive and last_state != "down":
            log("⚠️ Backend unresponsive — initiating recovery (backend container restart)...")
            try:
                docker_up(redis=False, backend=True)
            except Exception as e:
                log(f"⚠️ Recovery attempt failed: {e}")
            time.sleep(8)
        elif alive and last_state != "up":
            log("✅ Backend recovered.")
        last_state = "up" if alive else "down"
        stop_event.wait(CHECK_INTERVAL)


# ---------------------------------------------------------------------------
# Run sequence
# ---------------------------------------------------------------------------
def run(prime: bool = True) -> int:
    log("Initializing full RT-GIDS stack...")
    stop_event = threading.Event()
    processes: Dict[str, subprocess.Popen] = {}
    telemetry_thread = None
    monitor_thread = None

    try:
        # Start docker containers (verifies docker daemon)
        docker_up(redis=True, backend=True)

        log("Waiting for backend to respond on http://localhost:8000/api/health ...")
        for _ in range(30):
            if ping_backend():
                break
            time.sleep(3)
        else:
            raise RuntimeError("Backend did not become ready within the timeout window.")

        if prime:
            seed_telemetry("initial-prime")

        # Start frontend (throws helpful errors if pnpm missing)
        processes["frontend"] = start_frontend()

        telemetry_thread = threading.Thread(target=telemetry_loop, args=(stop_event,), daemon=True)
        monitor_thread = threading.Thread(target=monitor_system, args=(stop_event,), daemon=True)
        telemetry_thread.start()
        monitor_thread.start()

        log("✅ All services operational.")
        log("Frontend → http://localhost:3000")
        log("Backend  → http://localhost:8000")
        log("Press Ctrl+C to stop everything.")
        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        log("🛑 Stopping orchestrator (KeyboardInterrupt)...")
    except Exception as e:
        log(f"❌ Orchestrator fatal error: {e}")
    finally:
        stop_event.set()
        # Stop foreground processes
        for name, proc in processes.items():
            try:
                if proc.poll() is None:
                    log(f"Stopping {name}...")
                    if os.name == "nt":
                        proc.send_signal(signal.CTRL_BREAK_EVENT)
                    else:
                        os.killpg(proc.pid, signal.SIGTERM)
                    proc.wait(timeout=8)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
        # Tear down docker
        try:
            docker_down()
        except Exception as e:
            log(f"⚠️ Failed to teardown Docker containers cleanly: {e}")
        log("RT-GIDS shut down cleanly.")
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="RT-GIDS full-stack orchestrator")
    p.add_argument("--no-prime", dest="prime", action="store_false", help="Skip initial telemetry seeding")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    sys.exit(run(prime=args.prime))
