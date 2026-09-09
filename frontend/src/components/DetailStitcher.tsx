import React, { useState, useRef, useEffect } from 'react';
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
  Info,
  Loader2,
} from 'lucide-react';
import type { UploadedImage, StitchSettings, MergeDirection } from '../types';
import {
  getImageDimensions,
  stitchImages,
  sliceAndZipImages,
  formatBytes,
  type StitchResult,
} from '../utils/imageUtils';

interface DetailStitcherProps {
  onNotify: (msg: string) => void;
  externalImages?: UploadedImage[];
}

export const DetailStitcher: React.FC<DetailStitcherProps> = ({ onNotify, externalImages }) => {
  const [images, setImages] = useState<UploadedImage[]>(externalImages || []);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  // External images sync
  useEffect(() => {
    if (externalImages && externalImages.length > 0) {
      setImages(externalImages);
      setStitchResult(null);
    }
  }, [externalImages]);

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
  const [stitchResult, setStitchResult] = useState<StitchResult | null>(null);

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
    setStitchResult(null);
    onNotify(`${newItems.length}개의 이미지가 추가되었습니다.`);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setStitchResult(null);
  };

  const moveImage = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return;
    setImages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setStitchResult(null);
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
      setStitchResult(res);
      setZoomLevel(1);

      if (res.isOverLimit) {
        onNotify(
          `전체 높이가 ${res.totalHeight.toLocaleString()}px로 커서 쇼핑몰 규격에 맞춰 ${res.slices.length}개 조각으로 안전 분할되었습니다!`
        );
      } else {
        onNotify('이미지 병합이 완료되었습니다!');
      }
    } catch (err: any) {
      alert(`병합 중 오류가 발생했습니다: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Download single image
  const handleDownloadSingle = async () => {
    if (!stitchResult) return;
    const ext = format === 'image/webp' ? 'webp' : format === 'image/png' ? 'png' : 'jpg';

    if (stitchResult.blob) {
      const a = document.createElement('a');
      const url = URL.createObjectURL(stitchResult.blob);
      a.href = url;
      a.download = `gaul_detail_${Date.now()}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      // 30,000px를 초과하여 브라우저/쇼핑몰 한계로 분할 ZIP으로 다운로드
      alert(
        `전체 세로 길이(${stitchResult.totalHeight.toLocaleString()}px)가 웹 브라우저 단일 그래픽스 한계(32,767px) 및 네이버/쿠팡 업로드 규격(최대 20,000px)을 초과합니다.\n\n안전하게 분할된 ZIP 압축 파일(${stitchResult.slices.length}조각)로 다운로드됩니다.`
      );
      await handleDownloadSlicedZip();
    }
  };

  // Download sliced ZIP
  const handleDownloadSlicedZip = async () => {
    if (!stitchResult || stitchResult.slices.length === 0) return;
    setIsProcessing(true);
    try {
      const zipBlob = await sliceAndZipImages(stitchResult.slices, format, 'gaul_detail_slice');
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gaul_detail_slices_${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      onNotify(`슬라이스 분할 압축파일(ZIP, ${stitchResult.slices.length}조각)이 다운로드되었습니다.`);
    } catch (err: any) {
      alert(`슬라이스 다운로드 실패: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const totalCalculatedHeight = images.reduce((acc, img) => {
    const targetW = presetWidth > 0 ? presetWidth : customWidth;
    const ratio = targetW > 0 ? targetW / img.width : 1;
    return acc + Math.round(img.height * ratio);
  }, 0);

  return (
    <div className="panel-grid">
      {/* Left Control Panel */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <Layers className="text-primary" size={20} />
            상세페이지 병합 설정
          </h2>
          <span className="card-badge">{images.length}장 등록됨</span>
        </div>

        {/* File Upload Zone */}
        <div
          className="drop-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            multiple
            accept="image/*"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={(e) => handleFiles(e.target.files)}
          />
          <div className="drop-zone-icon">
            <Upload size={36} color="var(--primary)" />
          </div>
          <div className="drop-zone-title">이미지를 드래그하거나 클릭하여 추가</div>
          <div className="drop-zone-desc">JPG, PNG, WebP 등 여러 장을 한 번에 올릴 수 있습니다.</div>
        </div>

        {/* Image Order List */}
        {images.length > 0 && (
          <div style={{ marginTop: '1.25rem' }}>
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>병합 순서 조정 (드래그하여 순서 변경)</span>
              <button
                className="btn btn-sm btn-danger"
                style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                onClick={() => setImages([])}
              >
                전체 삭제
              </button>
            </label>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxHeight: '260px',
                overflowY: 'auto',
                paddingRight: '4px',
              }}
            >
              {images.map((img, idx) => (
                <div
                  key={img.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    background: draggedIdx === idx ? 'var(--primary-light)' : 'var(--bg-subtle)',
                    border: '1px solid var(--border-light)',
                    cursor: 'grab',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <img
                    src={img.previewUrl}
                    alt={img.name}
                    style={{
                      width: '40px',
                      height: '40px',
                      objectFit: 'cover',
                      borderRadius: '4px',
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {img.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {img.width} × {img.height.toLocaleString()}px
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      className="btn btn-sm btn-secondary"
                      style={{ padding: '4px' }}
                      onClick={() => moveImage(idx, idx - 1)}
                      disabled={idx === 0}
                    >
                      <MoveUp size={14} />
                    </button>
                    <button
                      className="btn btn-sm btn-secondary"
                      style={{ padding: '4px' }}
                      onClick={() => moveImage(idx, idx + 1)}
                      disabled={idx === images.length - 1}
                    >
                      <MoveDown size={14} />
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      style={{ padding: '4px' }}
                      onClick={() => removeImage(idx)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stitch Controls */}
        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Direction */}
          <div className="form-group">
            <label className="form-label">병합 방향</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                className={`btn ${direction === 'vertical' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setDirection('vertical')}
              >
                <ArrowDown size={16} /> 세로 병합 (↓)
              </button>
              <button
                className={`btn ${direction === 'horizontal' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setDirection('horizontal')}
              >
                <ArrowRight size={16} /> 가로 병합 (→)
              </button>
            </div>
          </div>

          {/* Width Preset */}
          <div className="form-group">
            <label className="form-label">쇼핑몰 규격 프리셋 (너비)</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                className={`btn btn-sm ${presetWidth === 860 ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => {
                  setPresetWidth(860);
                  setCustomWidth(860);
                }}
              >
                네이버 스마트스토어
                <span style={{ fontSize: '0.7rem', display: 'block', opacity: 0.8 }}>권장 860px (선명도 최적)</span>
              </button>
              <button
                className={`btn btn-sm ${presetWidth === 780 ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => {
                  setPresetWidth(780);
                  setCustomWidth(780);
                }}
              >
                쿠팡 (Coupang)
                <span style={{ fontSize: '0.7rem', display: 'block', opacity: 0.8 }}>권장 780px 맞춤</span>
              </button>
              <button
                className={`btn btn-sm ${presetWidth === 1000 ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => {
                  setPresetWidth(1000);
                  setCustomWidth(1000);
                }}
              >
                오픈마켓 / 자사몰
                <span style={{ fontSize: '0.7rem', display: 'block', opacity: 0.8 }}>1000px 고화질</span>
              </button>
              <button
                className={`btn btn-sm ${presetWidth === 0 ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPresetWidth(0)}
              >
                원본 비율 유지
                <span style={{ fontSize: '0.7rem', display: 'block', opacity: 0.8 }}>Auto (리사이즈 없음)</span>
              </button>
            </div>

            {presetWidth !== 0 && (
              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>직접 너비 입력:</span>
                <input
                  type="number"
                  className="form-input"
                  style={{ width: '120px' }}
                  value={customWidth}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setCustomWidth(val);
                    setPresetWidth(val);
                  }}
                />
                <span style={{ fontSize: '0.8rem' }}>px</span>
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
                <option value={10000}>10,000px 단위 분할 (쇼핑몰 권장)</option>
                <option value={8000}>8,000px 단위 분할</option>
                <option value={5000}>5,000px 단위 분할 (모바일 최적화)</option>
                <option value={20000}>20,000px 단위 분할 (쇼핑몰 상한)</option>
              </select>
            </div>
          </div>

          {/* Quality */}
          {format !== 'image/png' && (
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>압축 품질 ({Math.round(quality * 100)}%)</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>기본 92% 권장</span>
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

          {/* Total Height Warning if huge */}
          {totalCalculatedHeight > 30000 && sliceHeight === 0 && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'hsla(38, 92%, 50%, 0.1)',
                color: 'var(--warning)',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Info size={16} />
              예상 높이({totalCalculatedHeight.toLocaleString()}px)가 브라우저 단일 한계를 초과하여 안전 자동 분할 처리됩니다.
            </div>
          )}

          <button
            className="btn btn-primary btn-lg"
            onClick={handleStitch}
            disabled={images.length === 0 || isProcessing}
            id="btn-run-stitch"
          >
            {isProcessing ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                초고속 병합 처리 중...
              </>
            ) : (
              `🚀 이미지 ${images.length}장 병합 실행`
            )}
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
          {stitchResult && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)' }}>
                {stitchResult.totalWidth} × {stitchResult.totalHeight.toLocaleString()} px
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                ({formatBytes(stitchResult.slices.reduce((acc, s) => acc + s.blob.size, 0))})
              </span>
            </div>
          )}
        </div>

        <div className="preview-container">
          {/* Zoom controls */}
          {stitchResult && (
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

          {stitchResult ? (
            <div
              style={{
                overflow: 'auto',
                maxHeight: '720px',
                width: '100%',
                textAlign: 'center',
                padding: '8px',
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  flexDirection: direction === 'vertical' ? 'column' : 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: `scale(${zoomLevel})`,
                  transformOrigin: 'top center',
                  transition: 'transform 0.15s ease',
                  boxShadow: 'var(--shadow-xl)',
                  margin: '0 auto',
                  lineHeight: 0,
                  fontSize: 0,
                }}
              >
                {stitchResult.slices.map((slice) => (
                  <img
                    key={slice.index}
                    src={slice.previewUrl}
                    alt={`Slice ${slice.index + 1}`}
                    style={{
                      display: 'block',
                      maxWidth: '100%',
                      margin: 0,
                      padding: 0,
                      border: 'none',
                    }}
                  />
                ))}
              </div>
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
        {stitchResult && (
          <div style={{ marginTop: '1.25rem' }}>
            {stitchResult.isOverLimit && (
              <div
                style={{
                  marginBottom: '1rem',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'hsla(38, 92%, 50%, 0.1)',
                  color: 'var(--warning)',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Info size={16} />
                전체 높이({stitchResult.totalHeight.toLocaleString()}px)가 브라우저 단일 그래픽스 한계(30,000px) 및 네이버/쿠팡 권장 규격을 초과하여 {stitchResult.slices.length}개 조각으로 안전 분할되었습니다.
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, minWidth: '220px' }}
                onClick={handleDownloadSingle}
                disabled={isProcessing}
                id="btn-download-merged"
              >
                <Download size={18} />
                {stitchResult.blob
                  ? `💾 통으로 다운로드 (${format.replace('image/', '').toUpperCase()})`
                  : `📦 분할 ZIP 다운로드 (${stitchResult.slices.length}조각 압축)`}
              </button>

              {stitchResult.slices.length > 1 && (
                <button
                  className="btn btn-secondary"
                  style={{ flex: 1, minWidth: '220px' }}
                  onClick={handleDownloadSlicedZip}
                  disabled={isProcessing}
                  id="btn-download-slices-zip"
                >
                  <Archive size={18} />
                  📦 슬라이스 분할 ZIP ({stitchResult.slices.length}조각)
                </button>
              )}
            </div>
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
            <strong>쇼핑몰 등록 가이드:</strong> 네이버 스마트스토어 및 쿠팡은 상품 상세페이지 1장의 권장 높이가 10,000px~20,000px입니다. 너무 긴 이미지는 로딩 속도 저하를 방지하기 위해 <strong>[슬라이스 분할 ZIP]</strong>을 권장합니다.
          </div>
        </div>
      </div>
    </div>
  );
};
