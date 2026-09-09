import React, { useState, useRef } from 'react';
import {
  Upload,
  Layers,
  ArrowDown,
  ArrowRight,
  MoveUp,
  MoveDown,
  Trash2,
  Download,
  Archive,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  CheckCircle2,
  Info
} from 'lucide-react';
import type { UploadedImage, StitchSettings, MergeDirection } from '../types';
import { getImageDimensions, stitchImages, sliceAndZipImages, formatBytes } from '../utils/imageUtils';

interface DetailStitcherProps {
  onNotify: (msg: string) => void;
  externalImages?: UploadedImage[];
}

export const DetailStitcher: React.FC<DetailStitcherProps> = ({ onNotify, externalImages }) => {
  const [images, setImages] = useState<UploadedImage[]>(externalImages || []);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  // Settings
  const [direction, setDirection] = useState<MergeDirection>('vertical');
  const [presetWidth, setPresetWidth] = useState<number>(860); // default Naver SmartStore
  const [customWidth, setCustomWidth] = useState<number>(860);
  const [gap, setGap] = useState<number>(0);
  const [backgroundColor, setBackgroundColor] = useState<string>('#ffffff');
  const [sliceHeight, setSliceHeight] = useState<number>(10000);
  const [format, setFormat] = useState<'image/jpeg' | 'image/png' | 'image/webp'>('image/jpeg');
  const [quality, setQuality] = useState<number>(0.92);

  // Result state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [resultCanvas, setResultCanvas] = useState<HTMLCanvasElement | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultDimensions, setResultDimensions] = useState<{ width: number; height: number } | null>(null);

  // Preview zoom
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle files
  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const newItems: UploadedImage[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      if (!f.type.startsWith('image/')) continue;
      try {
        const dim = await getImageDimensions(f);
        newItems.push({
          id: Math.random().toString(36).substring(2, 9),
          name: f.name,
          file: f,
          previewUrl: dim.previewUrl,
          width: dim.width,
          height: dim.height,
        });
      } catch (err) {
        console.error('이미지 로드 오류', err);
      }
    }

    setImages((prev) => [...prev, ...newItems]);
    onNotify(`${newItems.length}개의 이미지가 추가되었습니다.`);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const moveImage = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return;
    setImages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  // Drag & drop reorder
  const handleDragStart = (idx: number) => {
    setDraggedIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === targetIdx) return;
    moveImage(draggedIdx, targetIdx);
    setDraggedIdx(targetIdx);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
  };

  // Stitch Execution
  const handleStitch = async () => {
    if (images.length === 0) return;
    setIsProcessing(true);

    try {
      const settings: StitchSettings = {
        direction,
        presetWidth,
        customWidth: presetWidth === 0 ? 0 : customWidth,
        gap,
        backgroundColor,
        sliceHeight,
        quality,
        format,
      };

      const res = await stitchImages(images, settings);
      setResultCanvas(res.canvas);
      setResultBlob(res.blob);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      const url = URL.createObjectURL(res.blob);
      setResultUrl(url);
      setResultDimensions({ width: res.totalWidth, height: res.totalHeight });
      setZoomLevel(1);
      onNotify('이미지 병합이 완료되었습니다!');
    } catch (err: any) {
      alert(`병합 중 오류가 발생했습니다: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Download single image
  const handleDownloadSingle = () => {
    if (!resultBlob || !resultUrl) return;
    const ext = format === 'image/webp' ? 'webp' : format === 'image/png' ? 'png' : 'jpg';
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = `gaul_detail_${Date.now()}.${ext}`;
    a.click();
  };

  // Download sliced ZIP
  const handleDownloadSlicedZip = async () => {
    if (!resultCanvas) return;
    setIsProcessing(true);
    try {
      const zipBlob = await sliceAndZipImages(resultCanvas, sliceHeight, format, quality);
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gaul_detail_slices_${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      onNotify('슬라이스 분할 압축파일(ZIP)이 다운로드되었습니다.');
    } catch (err: any) {
      alert(`슬라이스 다운로드 실패: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="panel-grid">
      {/* Left Control Panel */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <Layers className="text-primary" size={20} />
            상세페이지 병합 설정
          </h2>
          {images.length > 0 && (
            <button
              className="btn btn-sm btn-danger"
              onClick={() => setImages([])}
              title="전체 비우기"
              id="btn-clear-stitch-images"
            >
              <Trash2 size={14} /> 전체 비우기
            </button>
          )}
        </div>

        {/* Upload Dropzone */}
        <div
          className="dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          id="dropzone-stitch"
        >
          <input
            type="file"
            ref={fileInputRef}
            multiple
            accept="image/png, image/jpeg, image/webp"
            style={{ display: 'none' }}
            onChange={(e) => handleFiles(e.target.files)}
          />
          <div className="dropzone-icon">
            <Upload size={24} />
          </div>
          <h3>상세페이지 이미지 업로드</h3>
          <p>클릭하거나 이미지를 끌어다 놓으세요 (순서대로 병합됩니다)</p>
        </div>

        {/* Image List with Drag Reordering */}
        {images.length > 0 && (
          <div className="form-group" style={{ marginTop: '1.25rem' }}>
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>업로드된 이미지 ({images.length}장) - 드래그하여 순서 변경</span>
            </label>
            <div className="thumb-list">
              {images.map((img, idx) => (
                <div
                  key={img.id}
                  className={`thumb-item ${draggedIdx === idx ? 'dragging' : ''}`}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                >
                  <img src={img.previewUrl} alt={img.name} className="thumb-preview-img" />
                  <div className="thumb-meta">
                    <div className="thumb-name">{img.name}</div>
                    <div className="thumb-dimensions">
                      {img.width} × {img.height}px
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => moveImage(idx, idx - 1)}
                      disabled={idx === 0}
                      title="위로 이동"
                    >
                      <MoveUp size={12} />
                    </button>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => moveImage(idx, idx + 1)}
                      disabled={idx === images.length - 1}
                      title="아래로 이동"
                    >
                      <MoveDown size={12} />
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => removeImage(idx)}
                      title="삭제"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Merge Options */}
        <div style={{ marginTop: '1.5rem' }}>
          <div className="form-group">
            <label className="form-label">병합 방향</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className={`btn ${direction === 'vertical' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setDirection('vertical')}
                id="btn-dir-vertical"
              >
                <ArrowDown size={16} /> 세로 병합 (↓)
              </button>
              <button
                type="button"
                className={`btn ${direction === 'horizontal' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setDirection('horizontal')}
                id="btn-dir-horizontal"
              >
                <ArrowRight size={16} /> 가로 병합 (→)
              </button>
            </div>
          </div>

          {/* Market Width Presets */}
          <div className="form-group">
            <label className="form-label">쇼핑몰 규격 프리셋 (너비)</label>
            <div className="preset-grid">
              <div
                className={`preset-pill ${presetWidth === 860 ? 'active' : ''}`}
                onClick={() => {
                  setPresetWidth(860);
                  setCustomWidth(860);
                }}
              >
                <div className="preset-pill-title">네이버 스마트스토어</div>
                <div className="preset-pill-desc">권장 860px (선명도 최적)</div>
              </div>
              <div
                className={`preset-pill ${presetWidth === 780 ? 'active' : ''}`}
                onClick={() => {
                  setPresetWidth(780);
                  setCustomWidth(780);
                }}
              >
                <div className="preset-pill-title">쿠팡 (Coupang)</div>
                <div className="preset-pill-desc">권장 780px 맞춤</div>
              </div>
              <div
                className={`preset-pill ${presetWidth === 1000 ? 'active' : ''}`}
                onClick={() => {
                  setPresetWidth(1000);
                  setCustomWidth(1000);
                }}
              >
                <div className="preset-pill-title">오픈마켓 / 자사몰</div>
                <div className="preset-pill-desc">1000px 고화질</div>
              </div>
              <div
                className={`preset-pill ${presetWidth === 0 ? 'active' : ''}`}
                onClick={() => setPresetWidth(0)}
              >
                <div className="preset-pill-title">원본 비율 유지</div>
                <div className="preset-pill-desc">Auto (리사이즈 없음)</div>
              </div>
            </div>

            {presetWidth !== 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>직접 너비 입력:</span>
                <input
                  type="number"
                  className="form-input"
                  style={{ width: '120px' }}
                  value={customWidth}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setCustomWidth(v);
                    setPresetWidth(v);
                  }}
                  step={10}
                  min={100}
                />
                <span style={{ fontSize: '0.85rem' }}>px</span>
              </div>
            )}
          </div>

          {/* Additional Options */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">이미지 사이 간격 (Gap)</label>
              <input
                type="number"
                className="form-input"
                value={gap}
                onChange={(e) => setGap(Math.max(0, Number(e.target.value)))}
                min={0}
                max={100}
              />
            </div>
            <div className="form-group">
              <label className="form-label">배경/간격 색상</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  style={{ width: '42px', height: '38px', borderRadius: '8px', cursor: 'pointer' }}
                />
                <input
                  type="text"
                  className="form-input"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">저장 포맷</label>
              <select
                className="form-select"
                value={format}
                onChange={(e) => setFormat(e.target.value as any)}
              >
                <option value="image/jpeg">JPEG (용량 최적화)</option>
                <option value="image/webp">WebP (차세대 고압축)</option>
                <option value="image/png">PNG (무손실 고화질)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">스마트 슬라이스 단위</label>
              <select
                className="form-select"
                value={sliceHeight}
                onChange={(e) => setSliceHeight(Number(e.target.value))}
              >
                <option value={0}>❌ 분할 안 함 (통으로만 다운로드)</option>
                <option value={10000}>10,000px 단위 분할 (쇼핑몰 표준)</option>
                <option value={8000}>8,000px 단위 분할</option>
                <option value={5000}>5,000px 단위 분할 (모바일 최적화)</option>
                <option value={20000}>20,000px 단위 분할</option>
              </select>
            </div>
          </div>

          {format !== 'image/png' && (
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>압축 품질 ({Math.round(quality * 100)}%)</span>
              </label>
              <input
                type="range"
                min="0.5"
                max="1.0"
                step="0.02"
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--primary)' }}
              />
            </div>
          )}

          <button
            className="btn btn-primary btn-lg"
            onClick={handleStitch}
            disabled={images.length === 0 || isProcessing}
            id="btn-run-stitch"
          >
            {isProcessing ? '초고속 병합 처리 중...' : `🚀 이미지 ${images.length}장 병합 실행`}
          </button>
        </div>
      </div>

      {/* Right Result & Preview Panel */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <CheckCircle2 className="text-primary" size={20} />
            병합 결과 및 미리보기
          </h2>
          {resultDimensions && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)' }}>
                {resultDimensions.width} × {resultDimensions.height} px
              </span>
              {resultBlob && (
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  ({formatBytes(resultBlob.size)})
                </span>
              )}
            </div>
          )}
        </div>

        <div className="preview-container">
          {/* Zoom controls */}
          {resultUrl && (
            <div className="preview-toolbar">
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.25))}
                title="확대"
              >
                <ZoomIn size={16} />
              </button>
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => setZoomLevel((z) => Math.max(0.2, z - 0.25))}
                title="축소"
              >
                <ZoomOut size={16} />
              </button>
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => setZoomLevel(1)}
                title="100% 뷰"
              >
                <RotateCcw size={16} />
              </button>
              <span style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', padding: '0 4px' }}>
                {Math.round(zoomLevel * 100)}%
              </span>
            </div>
          )}

          {resultUrl ? (
            <div style={{ overflow: 'auto', maxHeight: '720px', width: '100%', textAlign: 'center' }}>
              <img
                src={resultUrl}
                alt="Merged Result"
                style={{
                  transform: `scale(${zoomLevel})`,
                  transformOrigin: 'top center',
                  transition: 'transform 0.15s ease',
                  boxShadow: 'var(--shadow-xl)',
                  maxWidth: '100%',
                }}
              />
            </div>
          ) : (
            <div className="preview-empty-state">
              <div className="preview-empty-icon">🖼️</div>
              <h3>병합된 이미지가 여기에 표시됩니다</h3>
              <p>좌측에서 이미지를 등록하고 [병합 실행]을 눌러주세요.</p>
            </div>
          )}
        </div>

        {/* Download Action Buttons */}
        {resultUrl && (
          <div style={{ marginTop: '1.25rem', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={handleDownloadSingle}
              id="btn-download-merged"
            >
              <Download size={18} />
              💾 통으로 다운로드 (통합 단일 이미지 - {format.replace('image/', '').toUpperCase()})
            </button>
            {sliceHeight > 0 && resultDimensions && resultDimensions.height > sliceHeight && (
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={handleDownloadSlicedZip}
                id="btn-download-slices-zip"
              >
                <Archive size={18} />
                📦 슬라이스 분할 ZIP ({Math.ceil(resultDimensions.height / sliceHeight)}조각)
              </button>
            )}
          </div>
        )}

        {/* Tip Box */}
        <div
          style={{
            marginTop: '1.25rem',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--primary-light)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.85rem',
          }}
        >
          <Info size={20} color="var(--primary)" />
          <div>
            <strong>통으로 다운받으시려면?</strong> 파란색 <strong>[💾 통으로 다운로드]</strong> 버튼을 누르시면 분할되지 않는 1장의 긴 원본 파일로 즉시 저장됩니다. (쇼핑몰 업로드 용량 제한이 있을 때만 슬라이스 ZIP을 활용하세요)
          </div>
        </div>
      </div>
    </div>
  );
};
