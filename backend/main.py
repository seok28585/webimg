import os
import re
from urllib.parse import urljoin, urlparse
from typing import Optional, List

from fastapi import FastAPI, Query, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from bs4 import BeautifulSoup
import httpx

app = FastAPI(title="Image Master Pro API", version="2.0.0")

# CORS 허용 (개발 및 외부 연동 대비)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ExtractRequest(BaseModel):
    html: str
    base_url: Optional[str] = None

class ImageItem(BaseModel):
    id: int
    url: str
    alt: Optional[str] = ""

class ExtractResponse(BaseModel):
    success: bool
    count: int
    images: List[ImageItem]

@app.get("/api/health")
@app.get("/health")
def health_check():
    return {"status": "ok", "service": "Image Master Pro Backend", "version": "2.0.0"}

@app.post("/api/extract-images", response_model=ExtractResponse)
@app.post("/extract-images", response_model=ExtractResponse)
def extract_images(payload: ExtractRequest):
    html = payload.html or ""
    base_url = payload.base_url or ""
    
    soup = BeautifulSoup(html, "html.parser")
    found_urls = []
    seen = set()

    # 1. img 태그 파싱
    for idx, img in enumerate(soup.find_all("img")):
        src = img.get("src") or img.get("data-src") or img.get("data-original") or img.get("data-lazy-src")
        if not src:
            continue
        
        src = src.strip().strip("'\"")
        # protocol-relative url 처리 (//example.com/a.jpg)
        if src.startswith("//"):
            src = "https:" + src
        elif base_url and not bool(urlparse(src).netloc):
            src = urljoin(base_url, src)

        # 유효한 http/https 링크인지 확인
        if (src.startswith("http://") or src.startswith("https://") or src.startswith("data:image/")) and src not in seen:
            seen.add(src)
            alt = img.get("alt", "") or f"이미지 {len(found_urls) + 1}"
            found_urls.append(ImageItem(id=len(found_urls) + 1, url=src, alt=alt))

    # 2. 만약 img 태그가 없거나 regex로 일반 텍스트 내 이미지 링크도 보완 추출
    if not found_urls:
        regex = r'(https?:\/\/[^\s"\'<>]+?\.(?:png|jpe?g|webp|gif|bmp|svg)(?:\?[^\s"\'<>]*)?)'
        matches = re.findall(regex, html, re.IGNORECASE)
        for m in matches:
            if m not in seen:
                seen.add(m)
                found_urls.append(ImageItem(id=len(found_urls) + 1, url=m, alt=f"이미지 {len(found_urls) + 1}"))

    return ExtractResponse(success=True, count=len(found_urls), images=found_urls)

@app.get("/api/proxy-image")
@app.get("/proxy-image")
async def proxy_image(url: str = Query(..., description="CORS 우회를 위한 대상 이미지 URL")):
    if not url.startswith("http://") and not url.startswith("https://"):
        raise HTTPException(status_code=400, detail="유효한 HTTP/HTTPS URL이어야 합니다.")

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Referer": f"{urlparse(url).scheme}://{urlparse(url).netloc}/"
    }

    try:
        client = httpx.AsyncClient(follow_redirects=True, timeout=20.0)
        req = client.build_request("GET", url, headers=headers)
        response = await client.send(req, stream=True)

        if response.status_code != 200:
            await response.aclose()
            await client.aclose()
            raise HTTPException(status_code=response.status_code, detail="이미지를 불러올 수 없습니다.")

        content_type = response.headers.get("content-type", "image/jpeg")

        async def stream_generator():
            try:
                async for chunk in response.aiter_bytes(chunk_size=8192):
                    yield chunk
            finally:
                await response.aclose()
                await client.aclose()

        return StreamingResponse(
            stream_generator(),
            media_type=content_type,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Cache-Control": "public, max-age=86400",
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"이미지 다운로드 실패: {str(e)}")

# Frontend 정적 빌드 배포 지원 (SPA Fallback)
FRONTEND_DIST = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
if os.path.exists(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.join(FRONTEND_DIST, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        index_file = os.path.join(FRONTEND_DIST, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"error": "Frontend build not found"}
