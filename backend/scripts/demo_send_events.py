"""
Demo script to stream model insight events from the backend WebSocket.

Usage:
    python backend/scripts/demo_send_events.py --url ws://localhost:8000/ws/model/insights

Optional environment variables:
    RTGIDS_API_TOKEN - Bearer token (without the leading "api::") defaults to "dev-token-abc".
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from typing import Any

import websockets


def build_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer api::{token}"}


async def listen(uri: str, token: str) -> None:
    headers = build_headers(token)
    async with websockets.connect(uri, extra_headers=headers) as websocket:
        print(f"🔗 Connected to {uri}")
        try:
            while True:
                # Proactively send pings so the server loop continues waiting.
                await websocket.send("ping")
                message = await websocket.recv()
                payload: Any = json.loads(message)
                print(f"📡 {payload}")
                await asyncio.sleep(2.0)
        except websockets.ConnectionClosedOK:
            print("✅ Connection closed gracefully")
        except websockets.ConnectionClosedError as exc:
            print(f"⚠️ Connection closed with error: {exc}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Stream model insight WebSocket events.")
    parser.add_argument(
        "--url",
        default="ws://localhost:8000/ws/model/insights",
        help="WebSocket endpoint to connect to.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    token = os.getenv("RTGIDS_API_TOKEN", "dev-token-abc")
    asyncio.run(listen(args.url, token))


if __name__ == "__main__":
    main()

