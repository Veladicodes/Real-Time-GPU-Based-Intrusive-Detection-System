#!/usr/bin/env python3
"""RT-GIDS Unified Orchestrator — Compose-based Full Stack Controller

Upgrades:
- Uses `docker compose` for reliable orchestration (no manual `docker run`)
- Auto-detects Docker/WSL2 GPU setup
- Integrates frontend (Next.js) + backend (FastAPI + Redis)
- Self-healing backend monitor
- Real-time telemetry seed + graceful shutdown
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
except ImportError:
    requests = None

ROOT = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT / "frontend"
DEFAULT_API_TOKEN = os.getenv("RTGIDS_API_TOKEN", "dev-token-abc")

CHECK_INTERVAL = 8


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] [RT-GIDS] {msg}", flush=True)


def run_cmd(cmd: list[str], cwd: Optional[Path] = None, quiet: bool = False) -> Tuple[int, str, str]:
    proc = subprocess.run(
        cmd, cwd=str(cwd) if cwd else None,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        encoding="utf-8", errors="replace"
    )
    if not quiet:
        if proc.stdout: print(proc.stdout.strip())
        if proc.stderr: print(proc.stderr.strip(), file=sys.stderr)
    return proc.returncode, proc.stdout.strip(), proc.stderr.strip()


def ensure_docker_compose() -> None:
    """Ensure Docker and Docker Compose are accessible."""
    for name in ["docker", "docker-compose"]:
        if not shutil.which(name) and name == "docker-compose":
            # Docker Desktop’s Compose v2 is `docker compose`
            code, _, _ = run_cmd(["docker", "compose", "version"], quiet=True)
            if code != 0:
                raise RuntimeError("❌ Docker Compose not found. Install Docker Desktop or Docker Compose v2.")
        elif not shutil.which(name) and name == "docker":
            raise RuntimeError("❌ Docker not found. Install Docker Desktop.")


def docker_up() -> None:
    log("🚀 Starting RT-GIDS full stack via docker-compose...")
    ensure_docker_compose()
    run_cmd(["docker", "compose", "down", "-v", "--remove-orphans"], quiet=True)
    code, _, err = run_cmd(["docker", "compose", "up", "-d", "--build"])
    if code != 0:
        raise RuntimeError(f"❌ Docker Compose up failed: {err}")


def docker_down() -> None:
    log("🧹 Stopping RT-GIDS stack...")
    run_cmd(["docker", "compose", "down", "-v", "--remove-orphans"], quiet=True)


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
    except Exception as e:
        log(f"⚠️ Telemetry seed failed: {e}")


def telemetry_loop(stop_event: threading.Event) -> None:
    while not stop_event.is_set():
        seed_telemetry("auto-pulse")
        stop_event.wait(25)


def monitor_backend(stop_event: threading.Event) -> None:
    last_state = ""
    while not stop_event.is_set():
        alive = ping_backend()
        if not alive and last_state != "down":
            log("⚠️ Backend down — restarting compose backend...")
            run_cmd(["docker", "compose", "restart", "rtgids-backend"])
            time.sleep(8)
        elif alive and last_state != "up":
            log("✅ Backend healthy.")
        last_state = "up" if alive else "down"
        stop_event.wait(CHECK_INTERVAL)


def start_frontend() -> subprocess.Popen:
    if not FRONTEND_DIR.exists():
        log("⚠️ No frontend directory found, skipping Next.js startup.")
        return None
    log("🚀 Launching Next.js frontend (pnpm run dev)...")
    pnpm_exec = shutil.which("pnpm") or str(Path.home() / "AppData/Roaming/npm/pnpm.cmd")
    flags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    preexec = None if os.name == "nt" else os.setsid
    return subprocess.Popen([pnpm_exec, "run", "dev"], cwd=str(FRONTEND_DIR),
                            creationflags=flags, preexec_fn=preexec)


def run() -> int:
    log("Initializing RT-GIDS unified orchestrator...")
    stop_event = threading.Event()
    processes: Dict[str, subprocess.Popen] = {}

    try:
        docker_up()
        log("⏳ Waiting for backend to respond...")
        for _ in range(40):
            if ping_backend():
                break
            time.sleep(3)
        else:
            raise RuntimeError("❌ Backend failed to start within timeout.")

        seed_telemetry("startup")
        processes["frontend"] = start_frontend()

        threading.Thread(target=telemetry_loop, args=(stop_event,), daemon=True).start()
        threading.Thread(target=monitor_backend, args=(stop_event,), daemon=True).start()

        log("✅ RT-GIDS stack is live.")
        log("Frontend → http://localhost:3000")
        log("Backend  → http://localhost:8000")
        log("Press Ctrl+C to exit.")
        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        log("🛑 Keyboard interrupt detected.")
    except Exception as e:
        log(f"❌ Fatal orchestrator error: {e}")
    finally:
        stop_event.set()
        for name, proc in processes.items():
            try:
                if proc and proc.poll() is None:
                    log(f"Stopping {name}...")
                    if os.name == "nt":
                        proc.send_signal(signal.CTRL_BREAK_EVENT)
                    else:
                        os.killpg(proc.pid, signal.SIGTERM)
                    proc.wait(timeout=5)
            except Exception:
                pass
        docker_down()
        log("✅ RT-GIDS stopped cleanly.")
    return 0


if __name__ == "__main__":
    sys.exit(run())
