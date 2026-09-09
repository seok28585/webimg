import React, { useState, useEffect } from 'react';
import {
  Layers,
  Code,
  Image as ImageIcon,
  Sparkles,
  Sun,
  Moon,
  ShoppingBag,
} from 'lucide-react';
import { DetailStitcher } from './components/DetailStitcher';
import { HtmlExtractor } from './components/HtmlExtractor';
import { ThumbnailStudio } from './components/ThumbnailStudio';
import { ImageOptimizer } from './components/ImageOptimizer';
import type { UploadedImage } from './types';

type TabType = 'stitcher' | 'html' | 'thumbnail' | 'optimizer';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('stitcher');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [stitcherImages, setStitcherImages] = useState<UploadedImage[]>([]);

  // Theme toggle
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const showNotify = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((cur) => (cur === msg ? null : cur));
    }, 3500);
  };

  const handleSendToStitcher = (images: UploadedImage[]) => {
    setStitcherImages(images);
    setActiveTab('stitcher');
  };

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="app-header">
        <div className="header-inner">
          <div className="brand-wrapper">
            <div className="brand-logo">
              <ShoppingBag size={24} />
            </div>
            <div className="brand-text">
              <h1>(주)가울 Image Master Pro</h1>
              <p>이커머스 상품등록을 위한 고성능 이미지 처리 & 최적화 스튜디오</p>
            </div>
          </div>

          <div className="header-actions">
            <button
              className="btn btn-sm btn-secondary"
              onClick={toggleTheme}
              id="btn-theme-toggle"
              title="테마 전환"
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
              <span>{theme === 'light' ? '다크 모드' : '라이트 모드'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="nav-tabs-wrapper">
        <nav className="nav-tabs">
          <button
            className={`nav-tab-btn ${activeTab === 'stitcher' ? 'active' : ''}`}
            onClick={() => setActiveTab('stitcher')}
            id="tab-btn-stitcher"
          >
            <Layers size={18} />
            상세페이지 병합 & 슬라이스
          </button>
          <button
            className={`nav-tab-btn ${activeTab === 'html' ? 'active' : ''}`}
            onClick={() => setActiveTab('html')}
            id="tab-btn-html"
          >
            <Code size={18} />
            HTML 이미지 추출기
          </button>
          <button
            className={`nav-tab-btn ${activeTab === 'thumbnail' ? 'active' : ''}`}
            onClick={() => setActiveTab('thumbnail')}
            id="tab-btn-thumbnail"
          >
            <ImageIcon size={18} />
            썸네일 & 배너 규격화
          </button>
          <button
            className={`nav-tab-btn ${activeTab === 'optimizer' ? 'active' : ''}`}
            onClick={() => setActiveTab('optimizer')}
            id="tab-btn-optimizer"
          >
            <Sparkles size={18} />
            WebP 포맷 변환 & 압축
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <main className="main-content">
        {activeTab === 'stitcher' && (
          <DetailStitcher onNotify={showNotify} externalImages={stitcherImages} />
        )}
        {activeTab === 'html' && (
          <HtmlExtractor onNotify={showNotify} onSendToStitcher={handleSendToStitcher} />
        )}
        {activeTab === 'thumbnail' && <ThumbnailStudio onNotify={showNotify} />}
        {activeTab === 'optimizer' && <ImageOptimizer onNotify={showNotify} />}
      </main>

      {/* Toast Notification */}
      {toastMsg && (
        <div className="toast-msg">
          <Sparkles size={18} color="var(--primary)" />
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{toastMsg}</span>
        </div>
      )}

      {/* Footer */}
      <footer className="app-footer">
        <p>© 2026 (주)가울 Image Master Pro. All rights reserved. Powered by High-Performance Browser Canvas Engine.</p>
      </footer>
    </div>
  );
};

export default App;
