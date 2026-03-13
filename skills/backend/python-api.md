# Python API Development — FastAPI Reference

| Field          | Value                                      |
|----------------|--------------------------------------------|
| Version        | 1.0                                        |
| Last Updated   | 2026-03-06                                 |
| Applicability  | Python 3.11+, FastAPI 0.110+, Pydantic v2  |
| Dependencies   | fastapi, uvicorn, pydantic, httpx (testing) |

---

## Project Structure

```
project_root/
├── app/
│   ├── __init__.py
│   ├── main.py              # Application factory, lifespan
│   ├── config.py             # Settings via pydantic-settings
│   ├── dependencies.py       # Shared DI providers
│   ├── exceptions.py         # Custom exceptions + handlers
│   ├── middleware.py          # CORS, logging, timing
│   ├── api/
│   │   ├── __init__.py
│   │   ├── v1/
│   │   │   ├── __init__.py
│   │   │   ├── router.py     # Aggregates all v1 routers
│   │   │   ├── users.py
│   │   │   ├── items.py
│   │   │   └── health.py
│   │   └── v2/               # When needed
│   ├── models/               # Pydantic schemas (request/response)
│   │   ├── __init__.py
│   │   ├── base.py
│   │   ├── users.py
│   │   └── items.py
│   ├── services/             # Business logic layer
│   │   ├── __init__.py
│   │   └── user_service.py
│   ├── repositories/         # Data access layer
│   │   ├── __init__.py
│   │   └── user_repo.py
│   └── core/                 # DB connections, auth utilities
│       ├── __init__.py
│       ├── database.py
│       └── security.py
├── tests/
│   ├── conftest.py
│   ├── test_users.py
│   └── test_items.py
├── alembic/                  # If using SQLAlchemy migrations
├── pyproject.toml
└── Dockerfile
```

---

## Application Factory & Lifespan

```python
# app/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.config import settings
from app.api.v1.router import v1_router
from app.middleware import add_middleware
from app.exceptions import register_exception_handlers

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize DB pool, caches, etc.
    app.state.db_pool = await create_pool(settings.database_url)
    yield
    # Shutdown: close connections
    await app.state.db_pool.close()

def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        docs_url="/api/docs" if settings.debug else None,
        redoc_url="/api/redoc" if settings.debug else None,
        lifespan=lifespan,
    )
    add_middleware(app)
    register_exception_handlers(app)
    app.include_router(v1_router, prefix="/api/v1")
    return app

app = create_app()
```

---

## Configuration with pydantic-settings

```python
# app/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    app_name: str = "MyAPI"
    app_version: str = "1.0.0"
    debug: bool = False
    database_url: str
    redis_url: str | None = None
    cors_origins: list[str] = ["http://localhost:3000"]
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expiry_minutes: int = 30

settings = Settings()
```

---

## Pydantic Models — Request/Response Patterns

```python
# app/models/base.py
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict

class BaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

class TimestampMixin(BaseModel):
    created_at: datetime
    updated_at: datetime

# app/models/users.py
from pydantic import EmailStr, Field

class UserCreate(BaseSchema):
    """Request body for creating a user."""
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, max_length=128)

class UserUpdate(BaseSchema):
    """Partial update — all fields optional."""
    email: EmailStr | None = None
    display_name: str | None = Field(default=None, min_length=1, max_length=100)

class UserResponse(BaseSchema, TimestampMixin):
    """Never expose password hash."""
    id: UUID
    email: EmailStr
    display_name: str

class UserListResponse(BaseSchema):
    items: list[UserResponse]
    total: int
    page: int
    page_size: int
```

**Key conventions:**
- Separate Create, Update, and Response schemas. Never reuse one for all.
- Use `Field(...)` for validation constraints.
- Use `from_attributes=True` (Pydantic v2) when converting from ORM/dataclass objects.
- Use `EmailStr` (requires `email-validator` package).

---

## Dependency Injection

```python
# app/dependencies.py
from typing import Annotated
from fastapi import Depends, Request, HTTPException, status
from app.services.user_service import UserService
from app.core.security import decode_jwt

async def get_db(request: Request):
    """Yield a connection from the pool."""
    async with request.app.state.db_pool.acquire() as conn:
        yield conn

async def get_current_user(
    request: Request,
    db=Depends(get_db),
):
    token = request.headers.get("Authorization", "").removeprefix("Bearer ")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    payload = decode_jwt(token)
    user = await UserService(db).get_by_id(payload["sub"])
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return user

# Type aliases for cleaner route signatures
DB = Annotated[object, Depends(get_db)]
CurrentUser = Annotated[object, Depends(get_current_user)]
```

Usage in routes:

```python
@router.get("/me", response_model=UserResponse)
async def get_me(user: CurrentUser):
    return user
```

---

## Async Patterns

```python
# Prefer async for I/O-bound work
@router.get("/items/{item_id}")
async def get_item(item_id: UUID, db: DB):
    row = await db.fetchrow("SELECT * FROM items WHERE id = $1", item_id)
    if not row:
        raise HTTPException(status_code=404)
    return dict(row)

# Use run_in_executor for CPU-bound or sync libraries
import asyncio
from functools import partial

async def cpu_heavy_task(data: bytes) -> str:
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(None, partial(process_sync, data))
    return result

# Concurrent external calls
async def fetch_multiple(urls: list[str]):
    async with httpx.AsyncClient() as client:
        tasks = [client.get(url) for url in urls]
        responses = await asyncio.gather(*tasks, return_exceptions=True)
    return responses
```

**Rules:**
- Never use `time.sleep()` in async routes. Use `asyncio.sleep()`.
- Never call blocking I/O directly. Wrap with `run_in_executor`.
- Use `asyncio.gather()` for concurrent independent I/O.
- Use `asyncio.TaskGroup()` (Python 3.11+) for structured concurrency with error propagation.

---

## Error Handling

```python
# app/exceptions.py
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
import logging

logger = logging.getLogger(__name__)

class AppError(Exception):
    def __init__(self, message: str, code: str, status_code: int = 400):
        self.message = message
        self.code = code
        self.status_code = status_code

class NotFoundError(AppError):
    def __init__(self, resource: str, identifier: str):
        super().__init__(
            message=f"{resource} '{identifier}' not found",
            code="NOT_FOUND",
            status_code=404,
        )

class ConflictError(AppError):
    def __init__(self, message: str):
        super().__init__(message=message, code="CONFLICT", status_code=409)

def register_exception_handlers(app: FastAPI):
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message}},
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, exc: Exception):
        logger.exception("Unhandled exception", extra={"path": request.url.path})
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "INTERNAL", "message": "Internal server error"}},
        )
```

**Consistent error envelope:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": []
  }
}
```

---

## CORS Configuration

```python
# app/middleware.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings

def add_middleware(app: FastAPI):
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,  # Preflight cache in seconds
    )
```

**Rules:**
- Never use `allow_origins=["*"]` with `allow_credentials=True` (browsers reject this).
- In production, explicitly list allowed origins.
- Set `max_age` to reduce preflight requests.

---

## Health Checks

```python
# app/api/v1/health.py
from fastapi import APIRouter, Request

router = APIRouter(tags=["health"])

@router.get("/health")
async def health():
    """Liveness probe — always returns 200 if the process is running."""
    return {"status": "ok"}

@router.get("/health/ready")
async def readiness(request: Request):
    """Readiness probe — checks downstream dependencies."""
    checks = {}
    try:
        await request.app.state.db_pool.fetchval("SELECT 1")
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "unavailable"

    all_ok = all(v == "ok" for v in checks.values())
    return JSONResponse(
        status_code=200 if all_ok else 503,
        content={"status": "ok" if all_ok else "degraded", "checks": checks},
    )
```

**Conventions:**
- `/health` — lightweight, no dependency checks (liveness).
- `/health/ready` — verifies DB, cache, external services (readiness).
- Exclude health endpoints from auth middleware.

---

## API Versioning

**Preferred approach: URL prefix versioning.**

```python
# app/api/v1/router.py
from fastapi import APIRouter
from app.api.v1 import users, items, health

v1_router = APIRouter()
v1_router.include_router(health.router)
v1_router.include_router(users.router, prefix="/users")
v1_router.include_router(items.router, prefix="/items")
```

Mount in main:
```python
app.include_router(v1_router, prefix="/api/v1")
app.include_router(v2_router, prefix="/api/v2")
```

**Versioning rules:**
- Bump version only for breaking changes (removed fields, changed semantics).
- Additive changes (new optional fields, new endpoints) do NOT require a new version.
- Support at most 2 concurrent versions. Deprecate with `Deprecation` header + sunset date.
- Share service/repository layers across versions; only route/model layers diverge.

---

## Documentation Generation

FastAPI auto-generates OpenAPI (Swagger) docs. Enhance with:

```python
# Per-route documentation
@router.post(
    "/",
    response_model=UserResponse,
    status_code=201,
    summary="Create a new user",
    description="Registers a new user account. Sends verification email.",
    responses={
        409: {"description": "Email already registered"},
        422: {"description": "Validation error"},
    },
)
async def create_user(body: UserCreate, db: DB):
    ...

# Tag metadata in create_app
app = FastAPI(
    openapi_tags=[
        {"name": "users", "description": "User management"},
        {"name": "health", "description": "Service health probes"},
    ],
)
```

**Tips:**
- Disable docs in production: `docs_url=None, redoc_url=None`.
- Export schema: `GET /openapi.json`.
- Use `response_model_exclude_none=True` to omit null fields from responses.
- Add `examples` in Pydantic models via `model_config` or `json_schema_extra`.

---

## Testing Patterns

```python
# tests/conftest.py
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import create_app

@pytest.fixture
def app():
    return create_app()

@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

# tests/test_users.py
@pytest.mark.anyio
async def test_create_user(client):
    resp = await client.post("/api/v1/users", json={
        "email": "a@b.com",
        "display_name": "Test",
        "password": "securepass1",
    })
    assert resp.status_code == 201
    assert resp.json()["email"] == "a@b.com"
```

Use `pytest-anyio` or `pytest-asyncio` for async tests. Override dependencies with `app.dependency_overrides` for mocking.

---

## Quick Reference Checklist

- [ ] `pydantic-settings` for config, `.env` file, never hardcode secrets
- [ ] Separate Create / Update / Response models
- [ ] `Annotated[..., Depends(...)]` for typed DI
- [ ] Lifespan context manager for startup/shutdown
- [ ] Custom exception classes with consistent error envelope
- [ ] CORS configured per environment
- [ ] `/health` and `/health/ready` endpoints
- [ ] URL-prefix versioning (`/api/v1/...`)
- [ ] OpenAPI docs disabled in production
- [ ] Async-first, `run_in_executor` for sync/CPU work
