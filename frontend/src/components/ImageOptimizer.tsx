import React, { useState, useRef } from 'react';
import {
  Sparkles,
  Upload,
  Download,
  Archive,
  Trash2,
  TrendingDown
} from 'lucide-react';
import JSZip from 'jszip';
import type { OptimizerItem } from '../types';
import { getImageDimensions, formatBytes } from '../utils/imageUtils';

interface ImageOptimizerProps {
  onNotify: (msg: string) => void;
}

export const ImageOptimizer: React.FC<ImageOptimizerProps> = ({ onNotify }) => {
  const [items, setItems] = useState<OptimizerItem[]>([]);
  const [targetFormat, setTargetFormat] = useState<'image/webp' | 'image/jpeg' | 'image/png'>('image/webp');
  const [quality, setQuality] = useState<number>(0.85);
  const [maxWidth, setMaxWidth] = useState<number>(0); // 0 for original
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add files
  const handleAddFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const newItems: OptimizerItem[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      if (!f.type.startsWith('image/')) continue;
      try {
        const dim = await getImageDimensions(f);
        newItems.push({
          id: Math.random().toString(36).substring(2, 9),
          file: f,
          name: f.name,
          originalSize: f.size,
          originalWidth: dim.width,
          originalHeight: dim.height,
          previewUrl: dim.previewUrl,
          status: 'pending',
        });
      } catch (e) {
        console.error(e);
      }
    }

    setItems((prev) => [...prev, ...newItems]);
    onNotify(`${newItems.length}장의 이미지가 추가되었습니다.`);
  };

  // Run Optimization on all pending items
  const handleOptimizeAll = async () => {
    if (items.length === 0) return;
    setIsOptimizing(true);
    onNotify('이미지 압축 및 포맷 변환을 진행 중입니다...');

    const updated = [...items];

    for (let i = 0; i < updated.length; i++) {
      const it = updated[i];
      it.status = 'processing';
      setItems([...updated]);

      try {
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = it.previewUrl;
        });

        let targetW = img.naturalWidth;
        let targetH = img.naturalHeight;

        if (maxWidth > 0 && targetW > maxWidth) {
          const ratio = maxWidth / targetW;
          targetW = maxWidth;
          targetH = Math.round(targetH * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        if (targetFormat === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, targetW, targetH);
        }

        ctx.drawImage(img, 0, 0, targetW, targetH);

        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b || new Blob()), targetFormat, quality);
        });

        it.optimizedBlob = blob;
        it.optimizedSize = blob.size;
        it.optimizedUrl = URL.createObjectURL(blob);
        it.status = 'done';
      } catch (e) {
        console.error(e);
        it.status = 'error';
      }

      setItems([...updated]);
    }

    setIsOptimizing(false);
    onNotify('모든 이미지의 변환 및 최적화가 완료되었습니다!');
  };

  // Download single item
  const handleDownloadItem = (item: OptimizerItem) => {
    if (!item.optimizedUrl) return;
    const ext = targetFormat === 'image/webp' ? 'webp' : targetFormat === 'image/png' ? 'png' : 'jpg';
    const base = item.name.replace(/\.[^/.]+$/, '');
    const a = document.createElement('a');
    a.href = item.optimizedUrl;
    a.download = `${base}_opt.${ext}`;
    a.click();
  };

  // Download all as ZIP
  const handleDownloadAllZip = async () => {
    const doneItems = items.filter((it) => it.optimizedBlob);
    if (doneItems.length === 0) return;

    setIsOptimizing(true);
    const zip = new JSZip();
    const ext = targetFormat === 'image/webp' ? 'webp' : targetFormat === 'image/png' ? 'png' : 'jpg';

    doneItems.forEach((it) => {
      const base = it.name.replace(/\.[^/.]+$/, '');
      zip.file(`${base}_optimized.${ext}`, it.optimizedBlob!);
    });

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gaul_optimized_images_${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    setIsOptimizing(false);
    onNotify('ZIP 파일 다운로드가 완료되었습니다.');
  };

  // Calculate total savings
  const totalOriginal = items.reduce((acc, it) => acc + it.originalSize, 0);
  const totalOptimized = items.reduce((acc, it) => acc + (it.optimizedSize || it.originalSize), 0);
  const hasDone = items.some((it) => it.status === 'done');
  const savedBytes = totalOriginal - totalOptimized;
  const savedPercent = totalOriginal > 0 ? Math.round((savedBytes / totalOriginal) * 100) : 0;

  return (
    <div className="panel-grid">
      {/* Settings */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <Sparkles className="text-primary" size={20} />
            포맷 일괄 변환 & 용량 다이어트
          </h2>
          {items.length > 0 && (
            <button
              className="btn btn-sm btn-danger"
              onClick={() => setItems([])}
              title="비우기"
            >
              <Trash2 size={14} /> 초기화
            </button>
          )}
        </div>

        {/* Dropzone */}
        <div
          className="dropzone"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleAddFiles(e.dataTransfer.files);
          }}
          id="dropzone-optimizer"
        >
          <input
            type="file"
            ref={fileInputRef}
            multiple
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => handleAddFiles(e.target.files)}
          />
          <div className="dropzone-icon">
            <Upload size={24} />
          </div>
          <h3>최적화할 이미지 다중 업로드</h3>
          <p>클릭하거나 여러 장의 이미지를 드래그해 넣으세요</p>
        </div>

        <div style={{ marginTop: '1.5rem' }}>
          <div className="form-group">
            <label className="form-label">변환할 대상 포맷</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              <button
                type="button"
                className={`btn btn-sm ${targetFormat === 'image/webp' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setTargetFormat('image/webp')}
              >
                WebP (추천)
              </button>
              <button
                type="button"
                className={`btn btn-sm ${targetFormat === 'image/jpeg' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setTargetFormat('image/jpeg')}
              >
                JPEG
              </button>
              <button
                type="button"
                className={`btn btn-sm ${targetFormat === 'image/png' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setTargetFormat('image/png')}
              >
                PNG
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">최대 너비 리사이징 (선택)</label>
            <select
              className="form-select"
              value={maxWidth}
              onChange={(e) => setMaxWidth(Number(e.target.value))}
            >
              <option value={0}>원본 해상도 유지</option>
              <option value={1600}>최대 1600px로 축소 (고화질)</option>
              <option value={1200}>최대 1200px로 축소 (표준)</option>
              <option value={1000}>최대 1000px로 축소 (쇼핑몰 최적)</option>
              <option value={860}>최대 860px로 축소 (스마트스토어)</option>
            </select>
          </div>

          {targetFormat !== 'image/png' && (
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>압축 품질 ({Math.round(quality * 100)}%)</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {quality >= 0.85 ? '고화질 권장' : '용량 우선'}
                </span>
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
            onClick={handleOptimizeAll}
            disabled={items.length === 0 || isOptimizing}
            id="btn-run-optimize"
          >
            {isOptimizing ? '고속 최적화 변환 중...' : `⚡ ${items.length}장 일괄 변환 실행`}
          </button>
        </div>
      </div>

      {/* Item List & Savings View */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <TrendingDown className="text-primary" size={20} />
            변환 결과 및 용량 절감 현황
          </h2>
          {hasDone && savedBytes > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--success)' }}>
                총 {savedPercent}% 절감!
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                ({formatBytes(totalOriginal)} → {formatBytes(totalOptimized)})
              </span>
            </div>
          )}
        </div>

        {items.length > 0 ? (
          <div>
            <div style={{ maxHeight: '480px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {items.map((it) => (
                <div
                  key={it.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '8px 12px',
                    background: 'var(--bg-subtle)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-light)',
                  }}
                >
                  <img
                    src={it.previewUrl}
                    alt={it.name}
                    style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      원본: {it.originalWidth}×{it.originalHeight}px ({formatBytes(it.originalSize)})
                      {it.optimizedSize && (
                        <span style={{ color: 'var(--success)', fontWeight: 700, marginLeft: '6px' }}>
                          → {formatBytes(it.optimizedSize)} (
                          {Math.round(((it.originalSize - it.optimizedSize) / it.originalSize) * 100)}% 감소)
                        </span>
                      )}
                    </div>
                  </div>

                  {it.status === 'done' && (
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleDownloadItem(it)}
                      title="저장"
                    >
                      <Download size={14} />
                    </button>
                  )}
                  {it.status === 'processing' && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 700 }}>
                      변환 중...
                    </span>
                  )}
                  {it.status === 'pending' && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>대기 중</span>
                  )}
                </div>
              ))}
            </div>

            {hasDone && (
              <div style={{ marginTop: '1.25rem' }}>
                <button
                  className="btn btn-primary btn-lg"
                  onClick={handleDownloadAllZip}
                  id="btn-download-all-optimized-zip"
                >
                  <Archive size={18} />
                  변환된 전체 이미지 ZIP 일괄 다운로드
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="preview-container">
            <div className="preview-empty-state">
              <div className="preview-empty-icon">📁</div>
              <h3>이미지를 업로드하면 포맷 변환 및 용량 절감이 시작됩니다</h3>
              <p>WebP 포맷으로 변환하면 고화질을 유지하며 최대 80%까지 용량을 줄일 수 있습니다.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
