"""Metrics tracking for TPS (Tokens Per Second) and TTFT (Time to First Token)."""
from __future__ import annotations

import time
from typing import Any


class StreamMetricsCollector:
    """Attach to a streaming response to measure TPS and TTFT."""

    def __init__(self, model_id: str):
        self.model_id = model_id
        self._start_time: float = 0.0
        self._first_token_time: float | None = None
        self._end_time: float = 0.0
        self._token_count: int = 0

    def start(self) -> None:
        self._start_time = time.perf_counter()

    def on_chunk(self, chunk: Any) -> None:
        """Call for every streamed chunk."""
        delta = chunk.choices[0].delta if chunk.choices else None
        if delta and delta.content:
            if self._first_token_time is None:
                self._first_token_time = time.perf_counter()
            # Rough token estimate: split on whitespace
            self._token_count += max(1, len(delta.content.split()))

    def finish(self) -> None:
        self._end_time = time.perf_counter()

    @property
    def ttft_ms(self) -> float:
        if self._first_token_time is None:
            return 0.0
        return (self._first_token_time - self._start_time) * 1000

    @property
    def tps(self) -> float:
        elapsed = self._end_time - (self._first_token_time or self._start_time)
        if elapsed <= 0 or self._token_count == 0:
            return 0.0
        return self._token_count / elapsed

    @property
    def elapsed_seconds(self) -> float:
        return self._end_time - self._start_time

    def to_dict(self) -> dict[str, Any]:
        return {
            "model_id": self.model_id,
            "tps": round(self.tps, 2),
            "ttft_ms": round(self.ttft_ms, 2),
            "tokens_generated": self._token_count,
            "elapsed_seconds": round(self.elapsed_seconds, 3),
        }
