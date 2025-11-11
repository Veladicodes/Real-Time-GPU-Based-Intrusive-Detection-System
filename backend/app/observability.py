from fastapi import Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest

REQUESTS = Counter("rtgids_requests_total", "Total requests", ["endpoint", "method", "status"])
ML_LATENCY = Histogram("rtgids_ml_latency_seconds", "Model inference latency (seconds)")
ML_QUEUE = Gauge("rtgids_ml_queue_size", "Pending inference queue size")
REDIS_BACKLOG = Gauge("rtgids_redis_backlog", "Redis telemetry stream length")


def metrics_response() -> Response:
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
