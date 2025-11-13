#!/usr/bin/env python3
"""
Interactive Seed Attack Telemetry Generator for RT-GIDS
Injects synthetic but realistic attack logs directly into Redis.
"""

import asyncio
import json
import random
from datetime import datetime, timezone

try:
    import redis.asyncio as aioredis
except ImportError:
    import aioredis

REDIS_URL = "redis://localhost:6379/0"
LOG_KEY = "logs"

ATTACK_TYPES = [
    {
        "label": "Port Scan",
        "severity": "HIGH",
        "ports": [22, 80, 443, 3389, 8080, 445],
        "proto": "TCP",
    },
    {
        "label": "Brute Force Login",
        "severity": "CRITICAL",
        "ports": [22, 21, 25],
        "proto": "TCP",
    },
    {
        "label": "SQL Injection Probe",
        "severity": "ALERT",
        "ports": [80, 443],
        "proto": "HTTP",
    },
    {
        "label": "SYN Flood",
        "severity": "HIGH",
        "ports": [80, 443, 53],
        "proto": "TCP",
    },
    {
        "label": "Malware C2 Traffic",
        "severity": "CRITICAL",
        "ports": [4444, 1337, 9001],
        "proto": "UDP",
    },
]


def random_ip():
    return ".".join(str(random.randint(1, 254)) for _ in range(4))


async def push_attack(redis, attack):
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "src_ip": random_ip(),
        "dst_port": random.choice(attack["ports"]),
        "proto": attack["proto"],
        "label": attack["label"],
        "severity": attack["severity"],
        "bytes_in": random.randint(50, 5000),
        "bytes_out": random.randint(50, 5000),
        "is_attack": True,
    }

    await redis.lpush(LOG_KEY, json.dumps(payload))


async def main():
    print("\n=== RT-GIDS Attack Seeder ===")
    print("Connected to Redis and ready to inject attacks.\n")

    # User input
    while True:
        try:
            count = int(input("Enter number of attacks to generate: "))
            if count <= 0:
                print("Please enter a positive number.")
                continue
            break
        except ValueError:
            print("Invalid input. Enter a valid number.")

    redis = await aioredis.from_url(
        REDIS_URL,
        encoding="utf-8",
        decode_responses=True
    )
    print(f"\n[Seeder] Connected to Redis at {REDIS_URL}")

    for i in range(count):
        attack = random.choice(ATTACK_TYPES)
        await push_attack(redis, attack)
        if (i + 1) % 50 == 0:
            print(f"[Seeder] Injected {i+1}/{count} events...")
        await asyncio.sleep(0.01)

    print(f"\n[Seeder] Done! Injected total {count} attack events.\n")


if __name__ == "__main__":
    asyncio.run(main())
