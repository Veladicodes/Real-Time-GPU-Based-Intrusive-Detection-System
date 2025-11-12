"""
Quick helper script to trigger a SHAP explanation job and poll for the result.

Usage:
    python backend/scripts/test_shap.py --base-url http://localhost:8000
"""

from __future__ import annotations

import argparse
import asyncio
import os
from typing import Any, Dict

import httpx


def build_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer api::{token}",
        "Content-Type": "application/json",
    }


async def trigger_and_poll(base_url: str, token: str) -> None:
    headers = build_headers(token)
    async with httpx.AsyncClient(base_url=base_url, headers=headers, timeout=15) as client:
        print("🚀 Submitting SHAP job...")
        response = await client.post(
            "/api/model/shap/explain",
            json={
                "instances": [
                    {
                        "instance_id": "demo-ip-1",
                        "features": {
                            "packet_length": 72,
                            "dst_port": 22,
                            "src_port": 34567,
                            "protocol": 6,
                        },
                    }
                ]
            },
        )
        response.raise_for_status()
        job = response.json()
        job_id = job["id"]
        print(f"🧮 Job queued: {job_id}")

        for attempt in range(20):
            await asyncio.sleep(0.5)
            poll = await client.get(f"/api/model/shap/result/{job_id}")
            if poll.status_code == 200:
                payload: Dict[str, Any] = poll.json()
                if payload.get("completed"):
                    print("✅ SHAP job completed.")
                    print(payload)
                    break
            print(f"⌛ Waiting for completion (attempt {attempt + 1})...")
        else:
            print("⚠️ SHAP job did not complete within the polling window.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Trigger a SHAP explanation and poll results.")
    parser.add_argument("--base-url", default="http://localhost:8000", help="Backend base URL.")
    return parser.parse_args()


def main() -> None:
    token = os.getenv("RTGIDS_API_TOKEN", "dev-token-abc")
    args = parse_args()
    asyncio.run(trigger_and_poll(args.base_url, token))


if __name__ == "__main__":
    main()

