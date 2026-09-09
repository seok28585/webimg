import React, { useState, useEffect, useRef } from 'react';
import {
  Image as ImageIcon,
  Upload,
  Download,
  Tag,
  Palette,
  Maximize2,
  Minimize2,
  Check
} from 'lucide-react';
import type { ThumbnailSettings } from '../types';
import { renderThumbnailCanvas, formatBytes } from '../utils/imageUtils';

interface ThumbnailStudioProps {
  onNotify: (msg: string) => void;
}

export const ThumbnailStudio: React.FC<ThumbnailStudioProps> = ({ onNotify }) => {
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [sourceFileName, setSourceFileName] = useState<string>('thumbnail');
  const [sourceFileSize, setSourceFileSize] = useState<number>(0);

  // Canvas Settings
  const [canvasWidth, setCanvasWidth] = useState<number>(1000);
  const [canvasHeight, setCanvasHeight] = useState<number>(1000);
  const [fitMode, setFitMode] = useState<'fit' | 'fill'>('fit');
  const [paddingPercent, setPaddingPercent] = useState<number>(12);
  const [backgroundColor, setBackgroundColor] = useState<string>('#ffffff');

  // Badge Settings
  const [badgeText, setBadgeText] = useState<string>('BEST');
  const [badgeStyle, setBadgeStyle] = useState<'red' | 'blue' | 'black' | 'yellow' | 'green' | 'none'>('red');
  const [badgePosition, setBadgePosition] = useState<'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'>('top-left');

  // Watermark Settings
  const [watermarkText, setWatermarkText] = useState<string>('');
  const [watermarkOpacity, setWatermarkOpacity] = useState<number>(0.7);

  // Format & Quality
  const [format, setFormat] = useState<'image/jpeg' | 'image/png' | 'image/webp'>('image/jpeg');
  const [quality, setQuality] = useState<number>(0.95);

  // Result state
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle image upload
  const handleUpload = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setSourceFileName(file.name.replace(/\.[^/.]+$/, ''));
    setSourceFileSize(file.size);

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setSourceImage(img);
        onNotify('이미지가 성공적으로 로드되었습니다.');
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Live render on setting changes
  useEffect(() => {
    if (!sourceImage) return;

    let isMounted = true;
    const updatePreview = async () => {
      try {
        const settings: ThumbnailSettings = {
          canvasWidth,
          canvasHeight,
          backgroundColor,
          fitMode,
          paddingPercent,
          badgeText,
          badgeStyle,
          badgePosition,
          watermarkText,
          watermarkOpacity,
          quality,
          format,
        };

        const res = await renderThumbnailCanvas(sourceImage, settings);
        if (!isMounted) return;

        setResultBlob(res.blob);
        const url = URL.createObjectURL(res.blob);
        setResultUrl(url);
      } catch (err) {
        console.error('Thumbnail render error:', err);
      }
    };

    const timer = setTimeout(updatePreview, 60);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [
    sourceImage,
    canvasWidth,
    canvasHeight,
    fitMode,
    paddingPercent,
    backgroundColor,
    badgeText,
    badgeStyle,
    badgePosition,
    watermarkText,
    watermarkOpacity,
    quality,
    format,
  ]);

  const handleDownload = () => {
    if (!resultUrl) return;
    const ext = format === 'image/webp' ? 'webp' : format === 'image/png' ? 'png' : 'jpg';
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = `${sourceFileName}_thumb_${canvasWidth}x${canvasHeight}.${ext}`;
    a.click();
    onNotify('썸네일이 성공적으로 다운로드되었습니다.');
  };

  const badgePresets = ['BEST', 'HOT', '특가할인', '무료배송', '신상품', 'MD추천', '당일출고'];

  return (
    <div className="panel-grid">
      {/* Left Settings Panel */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <ImageIcon className="text-primary" size={20} />
            상품 썸네일 & 배너 규격화
          </h2>
        </div>

        {/* Upload Zone */}
        {!sourceImage ? (
          <div
            className="dropzone"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0]);
            }}
            id="dropzone-thumbnail"
          >
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files?.[0]) handleUpload(e.target.files[0]);
              }}
            />
            <div className="dropzone-icon">
              <Upload size={24} />
            </div>
            <h3>대표 상품 이미지 업로드</h3>
            <p>규격화할 상품 사진을 선택하거나 드래그하세요</p>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--bg-subtle)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              marginBottom: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img
                src={sourceImage.src}
                alt="Source"
                style={{ width: '42px', height: '42px', objectFit: 'cover', borderRadius: '6px' }}
              />
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{sourceFileName}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  원본: {sourceImage.naturalWidth} × {sourceImage.naturalHeight}px ({formatBytes(sourceFileSize)})
                </div>
              </div>
            </div>
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              교체
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files?.[0]) handleUpload(e.target.files[0]);
              }}
            />
          </div>
        )}

        {/* 1. Canvas Size Presets */}
        <div className="form-group" style={{ marginTop: '1rem' }}>
          <label className="form-label">캔버스 표준 규격</label>
          <div className="preset-grid">
            <div
              className={`preset-pill ${canvasWidth === 1000 && canvasHeight === 1000 ? 'active' : ''}`}
              onClick={() => {
                setCanvasWidth(1000);
                setCanvasHeight(1000);
              }}
            >
              <div className="preset-pill-title">오픈마켓 표준</div>
              <div className="preset-pill-desc">1000 × 1000 px 정방형</div>
            </div>
            <div
              className={`preset-pill ${canvasWidth === 800 && canvasHeight === 800 ? 'active' : ''}`}
              onClick={() => {
                setCanvasWidth(800);
                setCanvasHeight(800);
              }}
            >
              <div className="preset-pill-title">쿠팡 썸네일</div>
              <div className="preset-pill-desc">800 × 800 px</div>
            </div>
            <div
              className={`preset-pill ${canvasWidth === 640 && canvasHeight === 640 ? 'active' : ''}`}
              onClick={() => {
                setCanvasWidth(640);
                setCanvasHeight(640);
              }}
            >
              <div className="preset-pill-title">스토어팜 기본</div>
              <div className="preset-pill-desc">640 × 640 px</div>
            </div>
            <div
              className={`preset-pill ${canvasWidth === 1200 && canvasHeight === 630 ? 'active' : ''}`}
              onClick={() => {
                setCanvasWidth(1200);
                setCanvasHeight(630);
              }}
            >
              <div className="preset-pill-title">소셜/배너 규격</div>
              <div className="preset-pill-desc">1200 × 630 px (16:9)</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>직접 입력:</span>
            <input
              type="number"
              className="form-input"
              style={{ width: '90px' }}
              value={canvasWidth}
              onChange={(e) => setCanvasWidth(Number(e.target.value))}
              placeholder="가로"
              step={10}
            />
            <span>×</span>
            <input
              type="number"
              className="form-input"
              style={{ width: '90px' }}
              value={canvasHeight}
              onChange={(e) => setCanvasHeight(Number(e.target.value))}
              placeholder="세로"
              step={10}
            />
            <span style={{ fontSize: '0.85rem' }}>px</span>
          </div>
        </div>

        {/* 2. Image Fit & Margin */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label className="form-label">이미지 배치 모드</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                className={`btn btn-sm ${fitMode === 'fit' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setFitMode('fit')}
              >
                <Minimize2 size={14} /> 비율 여백 맞춤
              </button>
              <button
                type="button"
                className={`btn btn-sm ${fitMode === 'fill' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setFitMode('fill')}
              >
                <Maximize2 size={14} /> 꽉 채우기
              </button>
            </div>
          </div>

          {fitMode === 'fit' && (
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>여백 크기 ({paddingPercent}%)</span>
              </label>
              <input
                type="range"
                min="0"
                max="35"
                value={paddingPercent}
                onChange={(e) => setPaddingPercent(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--primary)' }}
              />
            </div>
          )}
        </div>

        {/* 3. Background Color Presets */}
        <div className="form-group">
          <label className="form-label">배경 스타일</label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[
                { name: '화이트', val: '#ffffff' },
                { name: '라이트그레이', val: '#f8f9fa' },
                { name: '웜베이지', val: '#fcfaf6' },
                { name: '소프트블랙', val: '#111827' },
                { name: '투명', val: 'transparent' },
              ].map((c) => (
                <button
                  key={c.val}
                  type="button"
                  onClick={() => setBackgroundColor(c.val)}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: c.val === 'transparent'
                      ? 'repeating-conic-gradient(#cbd5e1 0% 25%, #fff 0% 50%) 50% / 8px 8px'
                      : c.val,
                    border: backgroundColor === c.val ? '2px solid var(--primary)' : '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title={c.name}
                >
                  {backgroundColor === c.val && (
                    <Check size={14} color={c.val === '#ffffff' || c.val === '#f8f9fa' ? '#000' : '#fff'} />
                  )}
                </button>
              ))}
            </div>

            <input
              type="color"
              value={backgroundColor === 'transparent' ? '#ffffff' : backgroundColor}
              onChange={(e) => setBackgroundColor(e.target.value)}
              style={{ width: '34px', height: '34px', borderRadius: '6px', cursor: 'pointer' }}
              title="커스텀 컬러"
            />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {backgroundColor === 'transparent' ? '투명 배경' : backgroundColor}
            </span>
          </div>
        </div>

        {/* 4. Promotion Badge Overlay */}
        <div className="form-group">
          <label className="form-label">
            <Tag size={14} style={{ display: 'inline', marginRight: '4px' }} />
            프로모션 뱃지 오버레이
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              className="form-input"
              placeholder="뱃지 문구 (예: BEST, 무료배송)"
              value={badgeText}
              onChange={(e) => setBadgeText(e.target.value)}
              style={{ flex: 1 }}
            />
            <select
              className="form-select"
              style={{ width: '110px' }}
              value={badgeStyle}
              onChange={(e) => setBadgeStyle(e.target.value as any)}
            >
              <option value="none">뱃지 없음</option>
              <option value="red">레드 뱃지</option>
              <option value="blue">블루 뱃지</option>
              <option value="black">블랙 뱃지</option>
              <option value="yellow">옐로우 뱃지</option>
              <option value="green">그린 뱃지</option>
            </select>
          </div>

          {badgeStyle !== 'none' && (
            <>
              <div className="badge-chips">
                {badgePresets.map((bp) => (
                  <span
                    key={bp}
                    className="badge-chip"
                    style={{
                      background: badgeText === bp ? 'var(--primary)' : 'var(--bg-subtle)',
                      color: badgeText === bp ? '#fff' : 'var(--text-main)',
                      border: '1px solid var(--border-light)',
                    }}
                    onClick={() => setBadgeText(bp)}
                  >
                    {bp}
                  </span>
                ))}
              </div>

              <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>위치:</span>
                <select
                  className="form-select"
                  style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                  value={badgePosition}
                  onChange={(e) => setBadgePosition(e.target.value as any)}
                >
                  <option value="top-left">좌상단 (기본)</option>
                  <option value="top-right">우상단</option>
                  <option value="bottom-left">좌하단</option>
                  <option value="bottom-right">우하단</option>
                </select>
              </div>
            </>
          )}
        </div>

        {/* 5. Watermark / Brand Name */}
        <div className="form-group">
          <label className="form-label">상호명 / 워터마크 (선택)</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              className="form-input"
              placeholder="(주)가울 공식몰"
              value={watermarkText}
              onChange={(e) => setWatermarkText(e.target.value)}
              style={{ flex: 1 }}
            />
            {watermarkText && (
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={watermarkOpacity}
                onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                title="투명도"
                style={{ width: '80px', accentColor: 'var(--primary)' }}
              />
            )}
          </div>
        </div>

        {/* 6. Output Settings */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label className="form-label">저장 포맷</label>
            <select
              className="form-select"
              value={format}
              onChange={(e) => setFormat(e.target.value as any)}
            >
              <option value="image/jpeg">JPEG (쇼핑몰 기본)</option>
              <option value="image/png">PNG (투명배경 지원)</option>
              <option value="image/webp">WebP (초경량)</option>
            </select>
          </div>

          {format !== 'image/png' && (
            <div className="form-group">
              <label className="form-label">품질 ({Math.round(quality * 100)}%)</label>
              <input
                type="range"
                min="0.6"
                max="1.0"
                step="0.02"
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--primary)', marginTop: '8px' }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Right Preview Panel */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <Palette className="text-primary" size={20} />
            실시간 결과 미리보기 ({canvasWidth} × {canvasHeight}px)
          </h2>
          {resultBlob && (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              예상 용량: {formatBytes(resultBlob.size)}
            </span>
          )}
        </div>

        <div className="preview-container">
          {resultUrl ? (
            <div
              style={{
                maxWidth: '480px',
                width: '100%',
                aspectRatio: `${canvasWidth} / ${canvasHeight}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'var(--shadow-lg)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                background: backgroundColor === 'transparent'
                  ? 'repeating-conic-gradient(#cbd5e1 0% 25%, #fff 0% 50%) 50% / 16px 16px'
                  : backgroundColor,
              }}
            >
              <img
                src={resultUrl}
                alt="Thumbnail Result"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
          ) : (
            <div className="preview-empty-state">
              <div className="preview-empty-icon">🎨</div>
              <h3>상품 사진을 등록하면 실시간 미리보기가 생성됩니다</h3>
              <p>마켓 규격에 맞춰 비율을 맞추고, 뱃지와 배경색을 꾸며보세요.</p>
            </div>
          )}
        </div>

        {resultUrl && (
          <div style={{ marginTop: '1.25rem' }}>
            <button
              className="btn btn-primary btn-lg"
              onClick={handleDownload}
              id="btn-download-thumbnail"
            >
              <Download size={18} />
              규격화 썸네일 다운로드 ({canvasWidth}×{canvasHeight} {format.replace('image/', '').toUpperCase()})
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
