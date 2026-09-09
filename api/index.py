import sys
import os

# backend 디렉터리를 sys.path에 추가
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "backend"))

from main import app

# Vercel Serverless Function 진입점
handler = app
