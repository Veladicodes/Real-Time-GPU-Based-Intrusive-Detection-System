"""TDD coverage for building a Redis connection URL that authenticates as a
restricted ACL user instead of Redis' default (unrestricted) user.

User journey:
  As the RT-GIDS backend operator, I want the app to connect to Redis as a
  scoped ACL user (RTGIDS_REDIS_USER/RTGIDS_REDIS_PASSWORD) when those are
  configured, so that a compromised backend process cannot run arbitrary Redis
  admin commands against the default user.
"""

from __future__ import annotations

from app.utils.redis_url import build_redis_url


def test_build_redis_url_injects_acl_credentials_when_configured(monkeypatch) -> None:
    monkeypatch.setenv("REDIS_URL", "redis://redis-host:6379/0")
    monkeypatch.setenv("RTGIDS_REDIS_USER", "rtgids-app")
    monkeypatch.setenv("RTGIDS_REDIS_PASSWORD", "s3cret")

    url = build_redis_url()

    assert url == "redis://rtgids-app:s3cret@redis-host:6379/0"


def test_build_redis_url_falls_back_to_plain_url_without_acl_env(monkeypatch) -> None:
    monkeypatch.setenv("REDIS_URL", "redis://redis-host:6379/0")
    monkeypatch.delenv("RTGIDS_REDIS_USER", raising=False)
    monkeypatch.delenv("RTGIDS_REDIS_PASSWORD", raising=False)

    url = build_redis_url()

    assert url == "redis://redis-host:6379/0"


def test_build_redis_url_defaults_to_localhost_when_unset(monkeypatch) -> None:
    monkeypatch.delenv("REDIS_URL", raising=False)
    monkeypatch.delenv("RTGIDS_REDIS_USER", raising=False)
    monkeypatch.delenv("RTGIDS_REDIS_PASSWORD", raising=False)
    monkeypatch.delenv("DOCKER_ENV_MARKER", raising=False)

    url = build_redis_url()

    assert url == "redis://localhost:6379/0"


def test_build_redis_url_does_not_leak_password_in_repr_friendly_way(monkeypatch) -> None:
    # Guard against accidentally reintroducing the credential as a separate
    # plaintext field elsewhere; the URL itself carries the secret by design
    # (that's how redis-py authenticates), but nothing else should duplicate it.
    monkeypatch.setenv("REDIS_URL", "redis://redis-host:6379/0")
    monkeypatch.setenv("RTGIDS_REDIS_USER", "rtgids-app")
    monkeypatch.setenv("RTGIDS_REDIS_PASSWORD", "s3cret")

    url = build_redis_url()

    assert url.count("s3cret") == 1
