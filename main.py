import asyncio
import json
import os
import urllib.request
from contextlib import asynccontextmanager
from datetime import datetime

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

API_BASE = os.getenv("API_BASE_URL", "https://dashboard.birivibe.com")

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(title="Llama Dashboard (Railway Proxy)", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Proxy all /api/* to NAS backend
@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_api(path: str, request: Request):
    url = f"{API_BASE}/api/{path}"
    body = await request.body()
    headers = dict(request.headers)
    headers.pop("host", None)

    async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
        method = request.method.lower()
        resp = await client.request(
            method, url, content=body, headers=headers
        )
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            media_type=resp.headers.get("content-type"),
        )

# Serve static frontend
app.mount("/", StaticFiles(directory="static", html=True), name="static")
