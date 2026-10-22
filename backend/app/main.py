import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.api.routes import health
from app.core.config import get_settings

log = logging.getLogger("sideline.api")


async def catch_unhandled(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    """Turn a crash into a JSON 500 *inside* the CORS middleware. Without this, Starlette answers from
    outside it, the response has no CORS headers, and browsers report only "Failed to fetch"."""
    try:
        return await call_next(request)
    except Exception:
        log.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={"detail": {"code": "server_error", "message": "Something went wrong on the server."}},
        )


def warm_up() -> None:
    """Load the game catalog, week slates (with every game's precomputed moments) and pregame data before
    serving traffic. From Supabase this takes seconds on a small host; doing it inside the first request
    made that request outlast the app's timeout after every restart or free-tier wake-up. Failures are
    logged and left to the normal lazy loading (and its local-file fallback)."""
    from app.api.routes.week import get_slates
    from app.pregame.season import season_for
    from app.replay.catalog import get_catalog

    started = time.perf_counter()
    try:
        games = get_catalog().list()
        slates = get_slates()
        for season, week in slates:
            season_for(season, week)
        log.info("Warm-up: %d games, %d slates in %.1fs", len(games), len(slates), time.perf_counter() - started)
    except Exception as exc:  # never block startup; never log details (could include connection info)
        log.warning("Warm-up failed (%s); data will load on first use", type(exc).__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    warm_up()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        lifespan=lifespan,
        title=settings.app_name,
        version=settings.version,
        docs_url="/docs" if settings.is_development else None,
        redoc_url=None,
    )
    # Order matters: the last middleware added is the outermost, so CORS wraps the error catcher.
    app.middleware("http")(catch_unhandled)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(api_router)
    return app


app = create_app()
