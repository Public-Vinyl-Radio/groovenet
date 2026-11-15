import json

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError as FastAPIRequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

try:
    from pydantic import ConfigDict
except ImportError:
    ConfigDict = None
from typing import Literal

from observability import capture_exception, init_sentry
from optimizer import (
    run_cohesive_blocks_optimizer,
    run_genetic_algorithm,
    run_greedy_algorithm,
)
from ranking import MAX_TRACKS, OrderingRanking
from starlette.concurrency import run_in_threadpool

app = FastAPI()
init_sentry()


@app.middleware("http")
async def capture_unhandled_exceptions(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as error:
        capture_exception(error)
        raise


@app.get("/health")
async def health():
    return {"status": "ok"}


# Custom handler to ensure validation errors return 422 and are logged
@app.exception_handler(FastAPIRequestValidationError)
async def validation_exception_handler(request: Request, exc: FastAPIRequestValidationError):
    # Log the error for debugging
    print(f"Validation error on {request.url}: {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": exc.body},
    )


class Track(BaseModel):
    if ConfigDict is not None and hasattr(BaseModel, "model_validate"):
        model_config = ConfigDict(extra="allow")

    title: str | None = None
    artist: str | None = None
    album: str | None = None
    genres: list[str] | None = None
    styles: list[str] | None = None
    local_tags: str | None = None
    notes: str | None = None
    bpm: float | None = None
    key: str | None = None
    danceability: float | None = None
    mood_happy: float | None = None
    mood_relaxed: float | None = None
    mood_aggressive: float | None = None
    star_rating: float | None = None
    embedding: str | None = None

    if ConfigDict is None or not hasattr(BaseModel, "model_validate"):

        class Config:
            extra = "allow"


class OptimizeRequest(BaseModel):
    tracks: list[Track] = Field(max_length=MAX_TRACKS)
    mode: Literal["genetic", "greedy", "cohesive_blocks"] = "genetic"
    # The app's translation of a ranking profile (#1193). Omitted: today's scoring.
    ranking: OrderingRanking | None = None


def _model_to_dict(model: BaseModel):
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


def run_optimizer(tracks, mode, ranking=None):
    if mode == "genetic":
        return run_genetic_algorithm(tracks, ranking=ranking)
    if mode == "greedy":
        return run_greedy_algorithm(tracks, ranking=ranking)
    if mode == "cohesive_blocks":
        return run_cohesive_blocks_optimizer(tracks, ranking=ranking)
    raise ValueError(f"Unsupported optimizer mode: {mode}")


@app.post("/optimize")
async def optimize(req: OptimizeRequest):
    # Convert Pydantic models to plain dicts
    tracks = [_model_to_dict(t) for t in req.tracks]
    ranked = "profile" if req.ranking is not None else "default"
    print(f"Optimize request mode={req.mode} tracks={len(tracks)} ranking={ranked}", flush=True)

    # Offload CPU‐bound work to a thread
    try:
        optimized = await run_in_threadpool(run_optimizer, tracks, req.mode, req.ranking)
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as e:
        # For example, if your algorithm raises on malformed data
        raise HTTPException(status_code=400, detail=str(e))

    return {"result": optimized, "mode": req.mode}
