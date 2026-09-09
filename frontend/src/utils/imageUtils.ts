import JSZip from 'jszip';
import type { UploadedImage, StitchSettings, ThumbnailSettings } from '../types';

export interface StitchSlice {
  index: number;
  canvas: HTMLCanvasElement;
  blob: Blob;
  previewUrl: string;
  width: number;
  height: number;
  startY: number;
}

export interface StitchResult {
  totalWidth: number;
  totalHeight: number;
  isOverLimit: boolean;
  canvas: HTMLCanvasElement | null;
  blob: Blob | null;
  slices: StitchSlice[];
}

export const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('blob:') && !src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.referrerPolicy = 'no-referrer';
    img.onload = () => resolve(img);
    img.onerror = () => {
      // CORS 실패 시 crossOrigin 없이 재시도
      const fallback = new Image();
      fallback.referrerPolicy = 'no-referrer';
      fallback.onload = () => resolve(fallback);
      fallback.onerror = (e) => reject(new Error(`이미지 로드 실패: ${src} (${e})`));
      fallback.src = src;
    };
    img.src = src;
  });
};

export const getImageDimensions = (file: File): Promise<{ width: number; height: number; previewUrl: string }> => {
  return new Promise((resolve, reject) => {
    const previewUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight, previewUrl });
    };
    img.onerror = () => {
      reject(new Error('이미지 규격 확인 실패'));
    };
    img.src = previewUrl;
  });
};

export const stitchImages = async (
  images: UploadedImage[],
  settings: StitchSettings
): Promise<StitchResult> => {
  if (images.length === 0) {
    throw new Error('병합할 이미지가 없습니다.');
  }

  // 1. 모든 이미지 로드
  const loadedImgs = await Promise.all(images.map((img) => loadImage(img.previewUrl)));

  // 2. 리사이즈 및 레이아웃 배치 계산
  const targetWidth = settings.presetWidth > 0 ? settings.presetWidth : settings.customWidth;
  const isVertical = settings.direction === 'vertical';

  interface SizedImg {
    img: HTMLImageElement;
    w: number;
    h: number;
  }

  const sizedList: SizedImg[] = loadedImgs.map((img) => {
    let w = img.naturalWidth;
    let h = img.naturalHeight;

    if (targetWidth > 0 && isVertical) {
      const ratio = targetWidth / w;
      w = targetWidth;
      h = Math.round(h * ratio);
    }
    return { img, w, h };
  });

  let totalWidth = 0;
  let totalHeight = 0;
  const gap = Math.max(0, settings.gap);

  if (isVertical) {
    totalWidth = Math.max(...sizedList.map((s) => s.w));
    totalHeight = sizedList.reduce((acc, s) => acc + s.h, 0) + gap * (sizedList.length - 1);
  } else {
    totalWidth = sizedList.reduce((acc, s) => acc + s.w, 0) + gap * (sizedList.length - 1);
    totalHeight = Math.max(...sizedList.map((s) => s.h));
  }

  // 배치 좌표 계산
  interface Placement {
    img: HTMLImageElement;
    x: number;
    y: number;
    w: number;
    h: number;
  }
  const placements: Placement[] = [];
  let curX = 0;
  let curY = 0;

  for (const s of sizedList) {
    if (isVertical) {
      const posX = Math.round((totalWidth - s.w) / 2);
      placements.push({ img: s.img, x: posX, y: curY, w: s.w, h: s.h });
      curY += s.h + gap;
    } else {
      const posY = Math.round((totalHeight - s.h) / 2);
      placements.push({ img: s.img, x: curX, y: posY, w: s.w, h: s.h });
      curX += s.w + gap;
    }
  }

  // 브라우저 캔버스 단일 한계 (Chrome: 65,535px, Firefox/일반 GPU 안전 한계: 30,000px)
  const MAX_SAFE_CANVAS_DIM = 30000;
  const shouldChunk = isVertical
    ? (settings.sliceHeight > 0 || totalHeight > MAX_SAFE_CANVAS_DIM)
    : (settings.sliceHeight > 0 || totalWidth > MAX_SAFE_CANVAS_DIM);

  const effectiveChunkSize = settings.sliceHeight > 0
    ? settings.sliceHeight
    : 15000; // 분할 안 함 선택 시에도 30,000px 초과하면 15,000px 단위 안전 청크로 분할

  const slices: StitchSlice[] = [];

  // 청크 렌더링 함수
  const renderVerticalSlice = async (startY: number, sliceH: number, index: number): Promise<StitchSlice> => {
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = totalWidth;
    sliceCanvas.height = sliceH;
    const ctx = sliceCanvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D Context를 생성할 수 없습니다.');

    ctx.fillStyle = settings.backgroundColor || '#ffffff';
    ctx.fillRect(0, 0, totalWidth, sliceH);

    const endY = startY + sliceH;

    for (const p of placements) {
      const pEndY = p.y + p.h;
      if (p.y < endY && pEndY > startY) {
        const intersectTop = Math.max(p.y, startY);
        const intersectBottom = Math.min(pEndY, endY);
        const drawH = intersectBottom - intersectTop;

        const scaleY = p.img.naturalHeight / p.h;
        const sy = (intersectTop - p.y) * scaleY;
        const sh = drawH * scaleY;
        const sx = 0;
        const sw = p.img.naturalWidth;

        const dx = p.x;
        const dy = intersectTop - startY;
        const dw = p.w;
        const dh = drawH;

        ctx.drawImage(p.img, sx, sy, sw, sh, dx, dy, dw, dh);
      }
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      sliceCanvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error('슬라이스 캔버스 Blob 생성 실패'));
        },
        settings.format,
        settings.quality
      );
    });

    return {
      index,
      canvas: sliceCanvas,
      blob,
      previewUrl: URL.createObjectURL(blob),
      width: totalWidth,
      height: sliceH,
      startY,
    };
  };

  if (isVertical && shouldChunk) {
    const numSlices = Math.ceil(totalHeight / effectiveChunkSize);
    for (let i = 0; i < numSlices; i++) {
      const startY = i * effectiveChunkSize;
      const sliceH = Math.min(effectiveChunkSize, totalHeight - startY);
      const s = await renderVerticalSlice(startY, sliceH, i);
      slices.push(s);
    }

    return {
      totalWidth,
      totalHeight,
      isOverLimit: totalHeight > MAX_SAFE_CANVAS_DIM,
      canvas: null,
      blob: null,
      slices,
    };
  } else {
    // 30,000px 이하인 경우 단일 캔버스 렌더링 시도
    try {
      const canvas = document.createElement('canvas');
      canvas.width = totalWidth;
      canvas.height = totalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D Context를 생성할 수 없습니다.');

      ctx.fillStyle = settings.backgroundColor || '#ffffff';
      ctx.fillRect(0, 0, totalWidth, totalHeight);

      for (const p of placements) {
        ctx.drawImage(p.img, p.x, p.y, p.w, p.h);
      }

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error('Canvas Blob 생성 실패'));
          },
          settings.format,
          settings.quality
        );
      });

      slices.push({
        index: 0,
        canvas,
        blob,
        previewUrl: URL.createObjectURL(blob),
        width: totalWidth,
        height: totalHeight,
        startY: 0,
      });

      return {
        totalWidth,
        totalHeight,
        isOverLimit: false,
        canvas,
        blob,
        slices,
      };
    } catch (singleErr) {
      // 만약 브라우저 메모리/VRAM 부족으로 단일 캔버스 Blob 생성이 실패하면 슬라이스 모드로 자동 폴백
      console.warn('단일 캔버스 생성 실패로 자동 슬라이스 분할 모드로 전환합니다:', singleErr);
      const numSlices = Math.ceil(totalHeight / effectiveChunkSize);
      for (let i = 0; i < numSlices; i++) {
        const startY = i * effectiveChunkSize;
        const sliceH = Math.min(effectiveChunkSize, totalHeight - startY);
        const s = await renderVerticalSlice(startY, sliceH, i);
        slices.push(s);
      }

      return {
        totalWidth,
        totalHeight,
        isOverLimit: true,
        canvas: null,
        blob: null,
        slices,
      };
    }
  }
};

export const sliceAndZipImages = async (
  source: HTMLCanvasElement | StitchSlice[],
  sliceHeightOrFormat?: number | string,
  formatOrQuality?: string | number,
  qualityOrPrefix?: number | string,
  filenamePrefix: string = 'detail_slice'
): Promise<Blob> => {
  const zip = new JSZip();

  // 1. StitchSlice[] 배열이 전달된 경우 (초고속 즉시 ZIP 생성)
  if (Array.isArray(source)) {
    const fmt = typeof sliceHeightOrFormat === 'string' ? sliceHeightOrFormat : 'image/jpeg';
    const prefix = typeof formatOrQuality === 'string' ? formatOrQuality : filenamePrefix;
    const ext = fmt === 'image/webp' ? 'webp' : fmt === 'image/png' ? 'png' : 'jpg';

    for (let i = 0; i < source.length; i++) {
      const s = source[i];
      const indexStr = String(i + 1).padStart(2, '0');
      zip.file(`${prefix}_${indexStr}.${ext}`, s.blob);
    }

    return await zip.generateAsync({ type: 'blob' });
  }

  // 2. 단일 HTMLCanvasElement가 전달된 경우
  const sourceCanvas = source;
  const sliceHeight = typeof sliceHeightOrFormat === 'number' ? sliceHeightOrFormat : 10000;
  const format = typeof formatOrQuality === 'string' ? formatOrQuality : 'image/jpeg';
  const quality = typeof qualityOrPrefix === 'number' ? qualityOrPrefix : 0.92;
  const ext = format === 'image/webp' ? 'webp' : format === 'image/png' ? 'png' : 'jpg';

  const totalH = sourceCanvas.height;
  const totalW = sourceCanvas.width;
  const numSlices = Math.ceil(totalH / sliceHeight);

  for (let i = 0; i < numSlices; i++) {
    const currentSliceHeight = Math.min(sliceHeight, totalH - i * sliceHeight);
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = totalW;
    sliceCanvas.height = currentSliceHeight;
    const sliceCtx = sliceCanvas.getContext('2d');

    if (!sliceCtx) continue;

    sliceCtx.fillStyle = '#ffffff';
    sliceCtx.fillRect(0, 0, totalW, currentSliceHeight);

    sliceCtx.drawImage(
      sourceCanvas,
      0,
      i * sliceHeight,
      totalW,
      currentSliceHeight,
      0,
      0,
      totalW,
      currentSliceHeight
    );

    const sliceBlob = await new Promise<Blob>((resolve) => {
      sliceCanvas.toBlob((b) => resolve(b || new Blob()), format, quality);
    });

    const indexStr = String(i + 1).padStart(2, '0');
    zip.file(`${filenamePrefix}_${indexStr}.${ext}`, sliceBlob);
  }

  return await zip.generateAsync({ type: 'blob' });
};

export const renderThumbnailCanvas = async (
  imgElement: HTMLImageElement,
  settings: ThumbnailSettings
): Promise<{ canvas: HTMLCanvasElement; blob: Blob }> => {
  const canvas = document.createElement('canvas');
  canvas.width = settings.canvasWidth;
  canvas.height = settings.canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas Context Error');

  // 1. 배경 채우기
  if (settings.backgroundColor === 'transparent') {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = settings.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // 2. 이미지 피팅 계산
  const cw = canvas.width;
  const ch = canvas.height;
  const iw = imgElement.naturalWidth;
  const ih = imgElement.naturalHeight;

  let dw = cw;
  let dh = ch;
  let dx = 0;
  let dy = 0;

  const pad = settings.paddingPercent / 100;
  const availW = cw * (1 - pad * 2);
  const availH = ch * (1 - pad * 2);

  if (settings.fitMode === 'fit') {
    // 여백 두고 비율 맞춤
    const scale = Math.min(availW / iw, availH / ih);
    dw = Math.round(iw * scale);
    dh = Math.round(ih * scale);
    dx = Math.round((cw - dw) / 2);
    dy = Math.round((ch - dh) / 2);
  } else if (settings.fitMode === 'fill') {
    // 캔버스 꽉 채우기
    const scale = Math.max(cw / iw, ch / ih);
    dw = Math.round(iw * scale);
    dh = Math.round(ih * scale);
    dx = Math.round((cw - dw) / 2);
    dy = Math.round((ch - dh) / 2);
  }

  ctx.drawImage(imgElement, dx, dy, dw, dh);

  // 3. 뱃지 오버레이 그리기
  if (settings.badgeStyle !== 'none' && settings.badgeText.trim()) {
    ctx.save();
    const text = settings.badgeText.trim();
    const fontSize = Math.round(cw * 0.045);
    ctx.font = `bold ${fontSize}px 'Pretendard', sans-serif`;

    const metrics = ctx.measureText(text);
    const badgeW = metrics.width + fontSize * 1.5;
    const badgeH = fontSize * 1.8;
    const badgeRadius = 6;

    let bx = 20;
    let by = 20;
    if (settings.badgePosition === 'top-right') {
      bx = cw - badgeW - 20;
    } else if (settings.badgePosition === 'bottom-left') {
      by = ch - badgeH - 20;
    } else if (settings.badgePosition === 'bottom-right') {
      bx = cw - badgeW - 20;
      by = ch - badgeH - 20;
    }

    // 뱃지 배경색 매핑
    const colors: Record<string, string> = {
      red: '#ef4444',
      blue: '#3b82f6',
      black: '#111827',
      yellow: '#f59e0b',
      green: '#10b981',
    };
    ctx.fillStyle = colors[settings.badgeStyle] || '#ef4444';
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;

    // 라운드 박스 그리기
    ctx.beginPath();
    ctx.roundRect(bx, by, badgeW, badgeH, badgeRadius);
    ctx.fill();

    // 뱃지 텍스트
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + badgeW / 2, by + badgeH / 2);
    ctx.restore();
  }

  // 4. 워터마크 그리기
  if (settings.watermarkText.trim()) {
    ctx.save();
    const wmText = settings.watermarkText.trim();
    const wmFontSize = Math.round(cw * 0.035);
    ctx.font = `600 ${wmFontSize}px 'Pretendard', sans-serif`;
    ctx.fillStyle = `rgba(255, 255, 255, ${settings.watermarkOpacity})`;
    ctx.shadowColor = `rgba(0, 0, 0, ${settings.watermarkOpacity * 0.6})`;
    ctx.shadowBlur = 4;
    ctx.textAlign = 'right';
    ctx.fillText(wmText, cw - 20, ch - 20);
    ctx.restore();
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Thumbnail Blob Failed'));
      },
      settings.format,
      settings.quality
    );
  });

  return { canvas, blob };
};

export const formatBytes = (bytes: number, decimals: number = 1): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

/**
 * HTML 문자열에서 이미지 URL들을 순수 브라우저(클라이언트) 환경에서 추출합니다.
 * 백엔드 서버가 구동되지 않아도 100% 정상 작동합니다.
 */
export const extractImagesFromHtml = (
  html: string,
  baseUrl?: string
): { id: number; url: string; alt: string }[] => {
  if (!html || !html.trim()) return [];

  const foundUrls: { id: number; url: string; alt: string }[] = [];
  const seen = new Set<string>();

  const resolveUrl = (src: string): string => {
    let clean = src.trim();
    if (!clean) return '';
    // 따옴표 및 이스케이프 제거
    clean = clean.replace(/^['"]|['"]$/g, '');

    // 프로토콜 상대 경로 (//example.com/img.jpg)
    if (clean.startsWith('//')) {
      return 'https:' + clean;
    }

    // data URL은 그대로 반환
    if (clean.startsWith('data:image/')) {
      return clean;
    }

    // 상대 경로 처리
    if (baseUrl && !/^https?:\/\//i.test(clean)) {
      try {
        const base = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
        return new URL(clean, base).href;
      } catch {
        return clean;
      }
    }

    return clean;
  };

  const addUrl = (rawUrl: string, altText?: string) => {
    const url = resolveUrl(rawUrl);
    if (!url) return;

    const isValid =
      url.startsWith('http://') ||
      url.startsWith('https://') ||
      url.startsWith('data:image/');

    if (isValid && !seen.has(url)) {
      seen.add(url);
      const alt = altText && altText.trim() ? altText.trim() : `이미지 ${foundUrls.length + 1}`;
      foundUrls.push({ id: foundUrls.length + 1, url, alt });
    }
  };

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // <base href="..."> 태그 확인
    const baseEl = doc.querySelector('base');
    const detectedBase = baseEl?.getAttribute('href') || baseUrl;
    if (detectedBase && !baseUrl) {
      baseUrl = detectedBase;
    }

    // 1. <img> 태그 파싱 (src, data-src, data-original, data-lazy-src 등 다양한 지연로딩 속성 지원)
    const imgEls = doc.querySelectorAll('img');
    imgEls.forEach((img) => {
      const src =
        img.getAttribute('src') ||
        img.getAttribute('data-src') ||
        img.getAttribute('data-original') ||
        img.getAttribute('data-lazy-src') ||
        img.getAttribute('data-url') ||
        img.getAttribute('data-origin') ||
        '';

      if (src) {
        addUrl(src, img.getAttribute('alt') || '');
      }

      // srcset 속성도 파싱
      const srcset = img.getAttribute('srcset');
      if (srcset) {
        srcset.split(',').forEach((item) => {
          const itemUrl = item.trim().split(/\s+/)[0];
          if (itemUrl) addUrl(itemUrl, img.getAttribute('alt') || '');
        });
      }
    });

    // 2. <picture> 내 <source> 태그 파싱
    const sourceEls = doc.querySelectorAll('source');
    sourceEls.forEach((source) => {
      const srcset = source.getAttribute('srcset') || source.getAttribute('src');
      if (srcset) {
        srcset.split(',').forEach((item) => {
          const itemUrl = item.trim().split(/\s+/)[0];
          if (itemUrl) addUrl(itemUrl);
        });
      }
    });

    // 3. 인라인 스타일의 background-image 파싱
    const styledEls = doc.querySelectorAll('[style*="background"]');
    styledEls.forEach((el) => {
      const style = el.getAttribute('style') || '';
      const bgMatches = style.matchAll(/url\(['"]?([^'"\)]+)['"]?\)/gi);
      for (const m of bgMatches) {
        if (m[1]) addUrl(m[1]);
      }
    });

    // 4. 이미지 확장자로 끝나는 <a> 태그 링크 파싱
    const linkEls = doc.querySelectorAll('a[href]');
    linkEls.forEach((a) => {
      const href = a.getAttribute('href') || '';
      if (/\.(png|jpe?g|webp|gif|bmp|svg)(\?[^\s"'<>]*)?$/i.test(href)) {
        addUrl(href, a.textContent || '');
      }
    });
  } catch (e) {
    console.warn('DOMParser failed, will fallback to regex:', e);
  }

  // 5. 정규표현식 보완 추출 (태그가 깨졌거나 텍스트 내에 URL이 직접 포함된 경우)
  if (foundUrls.length === 0) {
    const regex = /(https?:\/\/[^\s"'<>]+?\.(?:png|jpe?g|webp|gif|bmp|svg)(?:\?[^\s"'<>]*)?)/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
      if (match[1]) {
        addUrl(match[1]);
      }
    }

    const dataRegex = /(data:image\/[a-zA-Z+]+;base64,[^\s"'<>]+)/gi;
    let dataMatch: RegExpExecArray | null;
    while ((dataMatch = dataRegex.exec(html)) !== null) {
      if (dataMatch[1]) {
        addUrl(dataMatch[1]);
      }
    }
  }

  return foundUrls;
};

/**
 * CORS 및 핫링크 방지를 우회하여 이미지를 Blob으로 안전하게 다운로드합니다.
 * 백엔드 프록시 -> 브라우저 직접 fetch -> 공용 프록시 -> 캔버스 추출 단계로 다단계 폴백합니다.
 */
export const fetchImageBlob = async (url: string): Promise<Blob> => {
  if (url.startsWith('data:')) {
    const res = await fetch(url);
    return await res.blob();
  }

  // 1차 시도: /api/proxy-image (Vite Dev Server 플러그인 또는 Vercel Serverless Function)
  try {
    const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(25000) });
    if (res.ok) {
      const blob = await res.blob();
      if (blob.size > 0) {
        // MIME type 보정
        if (!blob.type || blob.type === 'application/octet-stream') {
          return new Blob([blob], { type: 'image/jpeg' });
        }
        return blob;
      }
    }
  } catch (e) {
    console.warn('1차 프록시 시도 실패, 직접 fetch 시도:', e);
  }

  // 2차 시도: no-referrer & cors 직접 fetch
  try {
    const res = await fetch(url, {
      referrerPolicy: 'no-referrer',
      mode: 'cors',
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) {
      const blob = await res.blob();
      if (blob.size > 0) return blob;
    }
  } catch {
    // CORS 차단 시 다음 단계로 계속 진행
  }

  // 3차 시도: 공용 고속 이미지 프록시 (images.weserv.nl)
  try {
    const weservUrl = `https://images.weserv.nl/?url=${encodeURIComponent(url)}&default=${encodeURIComponent(url)}`;
    const res = await fetch(weservUrl, { signal: AbortSignal.timeout(20000) });
    if (res.ok) {
      const blob = await res.blob();
      if (blob.size > 0) return blob;
    }
  } catch {
    // 다음 시도로 계속 진행
  }

  // 4차 시도: 공용 CORS 프록시 (allorigins.win)
  try {
    const alloriginsUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const res = await fetch(alloriginsUrl, { signal: AbortSignal.timeout(20000) });
    if (res.ok) {
      const blob = await res.blob();
      if (blob.size > 0) return blob;
    }
  } catch {
    // 다음 시도로 계속 진행
  }

  // 5차 시도: Image 엘리먼트와 캔버스를 통한 픽셀 데이터 Blob 변환
  return await new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 800;
        canvas.height = img.naturalHeight || 800;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas Context 생성 실패');
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob 생성 실패'));
        }, 'image/jpeg', 0.95);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error(`이미지 로드 실패: ${url}`));
    img.src = url;
  });
};

/**
 * 추출된 이미지들을 ZIP 파일로 압축하여 일괄 다운로드 생성
 */
export const downloadExtractedImagesZip = async (
  images: { id: number; url: string; alt?: string }[],
  onProgress?: (current: number, total: number) => void
): Promise<Blob> => {
  const zip = new JSZip();

  for (let i = 0; i < images.length; i++) {
    const item = images[i];
    if (onProgress) onProgress(i + 1, images.length);

    try {
      const blob = await fetchImageBlob(item.url);
      const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
      const filename = `image_${String(i + 1).padStart(3, '0')}.${ext}`;
      zip.file(filename, blob);
    } catch (e) {
      console.warn(`이미지 다운로드 실패 (#${item.id}):`, e);
    }
  }

  return await zip.generateAsync({ type: 'blob' });
};

