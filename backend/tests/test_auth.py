"""Supabase JWT verification: real ES256 signatures with a throwaway key; no network."""

from __future__ import annotations

import json
import time
from types import SimpleNamespace
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from app.core.auth import TokenVerifier, get_token_verifier
from app.core.config import Settings, get_settings
from app.main import create_app

ISSUER = "https://example-project.supabase.co/auth/v1"
KID = "test-key-1"
PRIVATE = ec.generate_private_key(ec.SECP256R1())
OTHER_PRIVATE = ec.generate_private_key(ec.SECP256R1())
USER_ID = "a1111111-1111-4111-8111-111111111111"


class FakeKeys:
    """Stands in for PyJWKClient: returns the public key for KID, like the project's JWKS."""

    def __init__(self, *, fail: Exception | None = None):
        self.fail = fail

    def get_signing_key_from_jwt(self, token: str) -> Any:
        if self.fail:
            raise self.fail
        if jwt.get_unverified_header(token).get("kid") != KID:
            raise jwt.PyJWKClientError("Unable to find a signing key that matches")
        return SimpleNamespace(key=PRIVATE.public_key())


def token(*, key: Any = PRIVATE, alg: str = "ES256", kid: str = KID, **overrides: Any) -> str:
    now = int(time.time())
    claims = {
        "iss": ISSUER,
        "aud": "authenticated",
        "sub": USER_ID,
        "role": "authenticated",
        "email": "fan@example.com",
        "aal": "aal1",
        "session_id": "s-1",
        "iat": now,
        "exp": now + 3600,
        **overrides,
    }
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, key, algorithm=alg, headers={"kid": kid})


@pytest.fixture
def api():
    app = create_app()
    keys = FakeKeys()
    app.dependency_overrides[get_token_verifier] = lambda: TokenVerifier(ISSUER, keys)
    return TestClient(app), keys


def me(client: TestClient, bearer: str | None, scheme: str = "Bearer"):
    headers = {"Authorization": f"{scheme} {bearer}"} if bearer is not None else {}
    return client.get("/api/v1/me", headers=headers)


def test_valid_token_returns_the_user(api):
    client, _ = api
    r = me(client, token())
    assert r.status_code == 200
    assert r.json() == {
        "id": USER_ID,
        "email": "fan@example.com",
        "role": "authenticated",
        "aal": "aal1",
        "session_id": "s-1",
    }


@pytest.mark.parametrize(
    ("label", "make"),
    [
        ("expired", lambda: token(exp=int(time.time()) - 120, iat=int(time.time()) - 4000)),
        ("wrong issuer", lambda: token(iss="https://evil.supabase.co/auth/v1")),
        ("wrong audience", lambda: token(aud="something-else")),
        ("missing sub", lambda: token(sub=None)),
        ("signed by another key", lambda: token(key=OTHER_PRIVATE)),
        ("unknown key id", lambda: token(kid="rotated-away")),
        ("shared-secret HS256", lambda: token(key="x" * 32, alg="HS256")),
        ("unsigned alg=none", lambda: jwt.encode({"sub": USER_ID}, "", algorithm="none")),
        ("garbage", lambda: "not.a.jwt"),
    ],
)
def test_bad_tokens_are_rejected(api, label, make):
    client, _ = api
    bad = make()
    r = me(client, bad)
    assert r.status_code == 401, label
    assert r.json()["detail"]["code"] == "invalid_token"
    assert r.headers["www-authenticate"] == "Bearer"
    assert bad not in r.text  # the token is never echoed back


def test_missing_or_non_bearer_header_is_401(api):
    client, _ = api
    assert me(client, None).status_code == 401
    assert me(client, token(), scheme="Basic").status_code == 401
    assert me(client, "", scheme="Bearer").status_code == 401


def test_signing_keys_unreachable_is_503_not_401(api):
    client, keys = api
    keys.fail = jwt.PyJWKClientConnectionError("timeout")
    r = me(client, token())
    assert r.status_code == 503 and r.json()["detail"]["code"] == "auth_unavailable"


def test_accounts_not_configured_is_503_and_guest_endpoints_still_work():
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings(supabase_url=None)
    client = TestClient(app)
    r = me(client, token())
    assert r.status_code == 503 and r.json()["detail"]["code"] == "auth_not_configured"
    assert client.get("/health").status_code == 200
    assert client.get("/api/v1/replay/games").status_code == 200  # guest demo needs no account


def test_settings_derive_the_issuer():
    s = Settings(supabase_url="https://abc.supabase.co/")
    assert s.auth_configured and s.supabase_issuer == "https://abc.supabase.co/auth/v1"
    assert not Settings().auth_configured


def test_valid_token_without_user_role_is_403(api):
    client, _ = api
    r = me(client, token(role="anon"))
    assert r.status_code == 403 and r.json()["detail"]["code"] == "forbidden"
    r = me(client, token(role="service_role"))
    assert r.status_code == 403


def test_identity_comes_only_from_the_verified_token(api):
    """A client can't claim to be someone else via query params, headers, or a body."""
    client, _ = api
    other = "b2222222-2222-4222-8222-222222222222"
    r = client.get(
        f"/api/v1/me?user_id={other}&sub={other}",
        headers={"Authorization": f"Bearer {token()}", "X-User-Id": other, "X-Supabase-User": other},
    )
    assert r.status_code == 200 and r.json()["id"] == USER_ID
    # Rewriting the payload (sub = other user) without re-signing breaks the signature.
    head, _payload, sig = token().split(".")
    forged_payload = jwt.utils.base64url_encode(
        json.dumps(
            {
                "iss": ISSUER,
                "aud": "authenticated",
                "sub": other,
                "role": "authenticated",
                "iat": int(time.time()),
                "exp": int(time.time()) + 3600,
            }
        ).encode()
    ).decode()
    assert me(client, f"{head}.{forged_payload}.{sig}").status_code == 401


def test_tokens_never_reach_logs(api, caplog):
    client, keys = api
    caplog.set_level("DEBUG")
    good, bad = token(), token(key=OTHER_PRIVATE)
    me(client, good)
    me(client, bad)
    keys.fail = jwt.PyJWKClientConnectionError("timeout")
    me(client, good)
    logged = "\n".join(r.getMessage() for r in caplog.records)
    assert good not in logged and bad not in logged
    assert good.split(".")[2] not in logged  # not even the signature part
