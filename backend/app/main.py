import logging
from collections.abc import Awaitable, Callable

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


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
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
