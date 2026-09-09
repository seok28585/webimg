import React, { useState } from 'react';
import {
  Code,
  Search,
  CheckSquare,
  Square,
  ArrowRight,
  AlertCircle,
  ExternalLink,
  Layers
} from 'lucide-react';
import type { ExtractedImageItem, UploadedImage } from '../types';

interface HtmlExtractorProps {
  onNotify: (msg: string) => void;
  onSendToStitcher: (images: UploadedImage[]) => void;
}

export const HtmlExtractor: React.FC<HtmlExtractorProps> = ({ onNotify, onSendToStitcher }) => {
  const [htmlInput, setHtmlInput] = useState<string>('');
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [images, setImages] = useState<ExtractedImageItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Extract from HTML API
  const handleExtract = async () => {
    if (!htmlInput.trim()) {
      setErrorMsg('HTML 코드를 입력해 주세요.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/extract-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: htmlInput,
          base_url: baseUrl.trim() || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error('서버 응답 오류');
      }

      const data = await res.json();
      if (data.images && data.images.length > 0) {
        setImages(
          data.images.map((item: any) => ({
            id: item.id,
            url: item.url,
            alt: item.alt || '',
            selected: true,
          }))
        );
        onNotify(`${data.images.length}개의 이미지를 성공적으로 추출했습니다!`);
      } else {
        setErrorMsg('입력한 HTML에서 이미지(<img>)를 찾을 수 없습니다.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg('이미지 추출 중 오류가 발생했습니다. 백엔드 서버 상태를 확인해 주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle selection
  const toggleSelect = (id: number) => {
    setImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, selected: !img.selected } : img))
    );
  };

  const toggleSelectAll = (select: boolean) => {
    setImages((prev) => prev.map((img) => ({ ...img, selected: select })));
  };

  // Send selected images to Detail Stitcher
  const handleExportToStitcher = async () => {
    const selected = images.filter((img) => img.selected);
    if (selected.length === 0) {
      alert('병합할 이미지를 최소 1개 이상 선택해 주세요.');
      return;
    }

    setIsLoading(true);
    onNotify('선택된 이미지들을 다운로드하여 병합기로 변환 중입니다...');

    try {
      const converted: UploadedImage[] = [];

      for (let i = 0; i < selected.length; i++) {
        const item = selected[i];
        // CORS 프록시를 통해 다운로드
        const proxyUrl = item.url.startsWith('data:')
          ? item.url
          : `/api/proxy-image?url=${encodeURIComponent(item.url)}`;

        const response = await fetch(proxyUrl);
        if (!response.ok) continue;

        const blob = await response.blob();
        const file = new File([blob], `extracted_${i + 1}.jpg`, { type: blob.type || 'image/jpeg' });
        const previewUrl = URL.createObjectURL(blob);

        const imgEl = new Image();
        await new Promise((resolve) => {
          imgEl.onload = resolve;
          imgEl.onerror = resolve;
          imgEl.src = previewUrl;
        });

        converted.push({
          id: Math.random().toString(36).substring(2, 9),
          name: `추출이미지_${i + 1}`,
          file,
          previewUrl,
          width: imgEl.naturalWidth || 800,
          height: imgEl.naturalHeight || 800,
        });
      }

      if (converted.length > 0) {
        onSendToStitcher(converted);
        onNotify(`${converted.length}개 이미지가 병합기로 전송되었습니다!`);
      } else {
        alert('이미지를 다운로드하지 못했습니다. 원본 URL을 확인해 주세요.');
      }
    } catch (err: any) {
      alert(`이미지 변환 중 오류: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedCount = images.filter((img) => img.selected).length;

  return (
    <div className="panel-grid">
      {/* Left Input Panel */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <Code className="text-primary" size={20} />
            HTML 소스 이미지 추출기
          </h2>
        </div>

        <div className="form-group">
          <label className="form-label">
            상세설명 HTML 코드 붙여넣기
          </label>
          <textarea
            className="form-textarea"
            rows={10}
            placeholder={`예시: <p><img src="https://example.com/item1.jpg"></p><p><img src="https://example.com/item2.jpg"></p>`}
            value={htmlInput}
            onChange={(e) => setHtmlInput(e.target.value)}
            id="textarea-html"
          />
        </div>

        <div className="form-group">
          <label className="form-label">기준 웹사이트 URL (선택 사항 - 상대 경로 대응)</label>
          <input
            type="url"
            className="form-input"
            placeholder="https://example.com"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            이미지 경로가 상대경로(/images/...)인 경우 기준 도메인을 입력하면 자동으로 절대 경로로 변환됩니다.
          </span>
        </div>

        {errorMsg && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'hsla(0, 84%, 60%, 0.1)',
              color: 'var(--danger)',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '1rem',
            }}
          >
            <AlertCircle size={16} />
            {errorMsg}
          </div>
        )}

        <button
          className="btn btn-primary btn-lg"
          onClick={handleExtract}
          disabled={isLoading || !htmlInput.trim()}
          id="btn-run-extract"
        >
          {isLoading ? (
            '이미지 태그 분석 중...'
          ) : (
            <>
              <Search size={18} />
              HTML 이미지 전체 추출하기
            </>
          )}
        </button>
      </div>

      {/* Right Gallery & Selection Panel */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <Layers className="text-primary" size={20} />
            추출된 이미지 목록 ({selectedCount}/{images.length}장 선택됨)
          </h2>
          {images.length > 0 && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => toggleSelectAll(true)}
              >
                <CheckSquare size={14} /> 전체 선택
              </button>
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => toggleSelectAll(false)}
              >
                <Square size={14} /> 선택 해제
              </button>
            </div>
          )}
        </div>

        {images.length > 0 ? (
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: '12px',
                maxHeight: '520px',
                overflowY: 'auto',
                padding: '4px',
              }}
            >
              {images.map((img) => {
                const proxySrc = img.url.startsWith('data:')
                  ? img.url
                  : `/api/proxy-image?url=${encodeURIComponent(img.url)}`;

                return (
                  <div
                    key={img.id}
                    onClick={() => toggleSelect(img.id)}
                    style={{
                      position: 'relative',
                      borderRadius: 'var(--radius-md)',
                      overflow: 'hidden',
                      border: img.selected
                        ? '2px solid var(--primary)'
                        : '1px solid var(--border-light)',
                      background: 'var(--bg-subtle)',
                      cursor: 'pointer',
                      aspectRatio: '1',
                      transition: 'all 0.15s ease',
                      boxShadow: img.selected ? '0 0 0 3px var(--primary-glow)' : 'none',
                    }}
                  >
                    <img
                      src={proxySrc}
                      alt={img.alt}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      loading="lazy"
                    />
                    <div
                      style={{
                        position: 'absolute',
                        top: '6px',
                        left: '6px',
                        background: img.selected ? 'var(--primary)' : 'rgba(0,0,0,0.5)',
                        color: '#fff',
                        borderRadius: '4px',
                        padding: '2px 6px',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                      }}
                    >
                      #{img.id}
                    </div>

                    <a
                      href={img.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: 'absolute',
                        bottom: '6px',
                        right: '6px',
                        background: 'rgba(0,0,0,0.6)',
                        color: '#fff',
                        borderRadius: '4px',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      title="원본 링크 열기"
                    >
                      <ExternalLink size={12} />
                    </a>
                  </div>
                );
              })}
            </div>

            {/* Action Bar */}
            <div
              style={{
                marginTop: '1.5rem',
                paddingTop: '1rem',
                borderTop: '1px solid var(--border-light)',
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <button
                className="btn btn-primary btn-lg"
                style={{ flex: 1 }}
                onClick={handleExportToStitcher}
                disabled={selectedCount === 0 || isLoading}
                id="btn-export-to-stitcher"
              >
                <ArrowRight size={18} />
                선택한 {selectedCount}장 상세페이지 병합기로 전송
              </button>
            </div>
          </div>
        ) : (
          <div className="preview-container">
            <div className="preview-empty-state">
              <div className="preview-empty-icon">🔗</div>
              <h3>HTML 코드를 입력하면 이미지가 추출됩니다</h3>
              <p>도매처 또는 타 오픈마켓의 상세설명 HTML 소스를 복사해 붙여넣으세요.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
