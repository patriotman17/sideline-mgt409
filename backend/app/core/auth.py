"""Supabase login-token (JWT) verification for authenticated endpoints.

Tokens are verified locally against the project's **public** signing keys (JWKS at
``<SUPABASE_URL>/auth/v1/.well-known/jwks.json``, cached), so the backend never holds a
Supabase secret. Checks: signature (asymmetric algorithms only), expiry, issuer, audience
(``authenticated``) and role.

Guest endpoints (replays, Ask AI, predictions) don't use this; only account endpoints do.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Any, Protocol

import jwt
from fastapi import Depends, Header, HTTPException, status
from pydantic import BaseModel

from app.core.config import Settings, get_settings

#: Asymmetric algorithms only: a token signed with a shared secret ("HS256") is always rejected.
ALLOWED_ALGORITHMS = ("ES256", "RS256", "EdDSA")
AUDIENCE = "authenticated"
LEEWAY_SECONDS = 30


class AuthenticatedUser(BaseModel):
    id: str
    email: str | None = None
    role: str
    #: Authenticator assurance level ("aal1" = password).
    aal: str | None = None
    session_id: str | None = None


class InvalidToken(Exception):
    """The token is missing, malformed, expired, or not signed by this project."""


class NotAUser(Exception):
    """A genuine token from this project that isn't a signed-in user's (e.g. role "anon")."""


class AuthUnavailable(Exception):
    """The signing keys couldn't be fetched (network/Supabase outage)."""


class SigningKeySource(Protocol):
    def get_signing_key_from_jwt(self, token: str) -> Any: ...


class TokenVerifier:
    def __init__(self, issuer: str, keys: SigningKeySource):
        self.issuer = issuer
        self._keys = keys

    @classmethod
    def for_project(cls, supabase_url: str) -> TokenVerifier:
        issuer = f"{supabase_url.rstrip('/')}/auth/v1"
        keys = jwt.PyJWKClient(f"{issuer}/.well-known/jwks.json", cache_keys=True, lifespan=600, timeout=5)
        return cls(issuer, keys)

    def verify(self, token: str) -> AuthenticatedUser:
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as exc:
            raise InvalidToken("malformed token") from exc
        alg = header.get("alg")
        if alg not in ALLOWED_ALGORITHMS:
            raise InvalidToken(f"unsupported algorithm {alg!r}")
        try:
            key = self._keys.get_signing_key_from_jwt(token).key
        except jwt.PyJWKClientConnectionError as exc:
            raise AuthUnavailable("couldn't fetch signing keys") from exc
        except jwt.PyJWKClientError as exc:  # unknown kid, no keys
            raise InvalidToken("unknown signing key") from exc
        try:
            claims: dict[str, Any] = jwt.decode(
                token,
                key,
                algorithms=[alg],
                audience=AUDIENCE,
                issuer=self.issuer,
                leeway=LEEWAY_SECONDS,
                options={"require": ["exp", "iat", "sub", "aud", "iss"]},
            )
        except jwt.PyJWTError as exc:
            raise InvalidToken(str(exc)) from exc
        if claims.get("role") != AUDIENCE:
            raise NotAUser("not a signed-in user token")
        return AuthenticatedUser(
            id=str(claims["sub"]),
            email=claims.get("email"),
            role=str(claims["role"]),
            aal=claims.get("aal"),
            session_id=claims.get("session_id"),
        )


@lru_cache(maxsize=4)
def _verifier_for(supabase_url: str) -> TokenVerifier:
    return TokenVerifier.for_project(supabase_url)


def get_token_verifier(settings: Annotated[Settings, Depends(get_settings)]) -> TokenVerifier:
    if not settings.supabase_url:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            {"code": "auth_not_configured", "message": "Accounts aren't configured on this server."},
        )
    return _verifier_for(settings.supabase_url)


def _unauthorized(message: str) -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        {"code": "invalid_token", "message": message},
        headers={"WWW-Authenticate": "Bearer"},
    )


def current_user(
    verifier: Annotated[TokenVerifier, Depends(get_token_verifier)],
    authorization: Annotated[str | None, Header()] = None,
) -> AuthenticatedUser:
    """FastAPI dependency: the signed-in user (identity taken only from the verified token), 401 for a
    missing/invalid/expired token, 403 for a valid token that isn't a user's. Never logs or echoes it."""
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise _unauthorized("Log in to use this endpoint.")
    try:
        return verifier.verify(token.strip())
    except InvalidToken as exc:
        raise _unauthorized("Your session is invalid or has expired. Log in again.") from exc
    except NotAUser as exc:
        # Authenticated as *something*, but not allowed here: 403, not 401.
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            {"code": "forbidden", "message": "This endpoint requires a signed-in account."},
        ) from exc
    except AuthUnavailable as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            {"code": "auth_unavailable", "message": "Couldn't verify your session right now. Try again."},
        ) from exc


CurrentUser = Annotated[AuthenticatedUser, Depends(current_user)]
