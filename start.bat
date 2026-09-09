@echo off
chcp 65001 > nul
echo ========================================================
echo   (주)가울 Image Master Pro 웹앱을 시작합니다...
echo ========================================================

:: 1. 백엔드 가상/로컬 환경 확인 및 서버 실행
echo [1/2] 백엔드 API 서버(FastAPI) 시작 중... (Port: 8000)
start "Image Master Pro Backend" cmd /k "python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000"

:: 2. 프론트엔드 개발 서버 시작
echo [2/2] 프론트엔드 웹 UI 시작 중... (Port: 5173)
cd frontend
start http://localhost:5173
npm run dev
