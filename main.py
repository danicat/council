# Copyright 2026 Daniela Petruzalek
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""FastAPI entrypoint serving the Council of Ancients ADK application."""

from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from google.adk.cli.fast_api import get_fast_api_app

from agents.council_of_ancients.config import load_config

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR / "frontend"

load_dotenv(BASE_DIR / ".env")
load_config()

app: FastAPI = get_fast_api_app(
    agents_dir=str(BASE_DIR / "agents"),
    web=True,
    use_local_storage=False,
    allow_origins=[
        "http://127.0.0.1:8080",
        "http://localhost:8080",
        "http://127.0.0.1:8000",
        "http://localhost:8000",
    ],
)

app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="chamber_static")
app.router.routes = [r for r in app.router.routes if getattr(r, "path", None) != "/"]


@app.get("/", include_in_schema=False)
@app.get("/chamber", include_in_schema=False)
async def chamber_page() -> FileResponse:
    """Serve the interactive Council Chamber frontend."""
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    """Liveness and startup probe endpoint."""
    return {"status": "ok"}
