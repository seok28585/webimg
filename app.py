import streamlit as st
from PIL import Image
from rembg import remove
import io
import requests
from bs4 import BeautifulSoup
import sys

# [수정 1] 대용량 이미지 처리 시 발생하는 경고/에러 방지 (DecompressionBombError 해제)
Image.MAX_IMAGE_PIXELS = None

# ==========================================
# 1. 페이지 설정 및 디자인 (CSS)
# ==========================================
st.set_page_config(
    page_title="Image Master Pro",
    page_icon="🎨",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# 커스텀 CSS 주입
st.markdown("""
<style>
    .stApp { background-color: #f1f5f9; }
    
    /* 탭 스타일링 */
    .stTabs [data-baseweb="tab-list"] { gap: 20px; padding: 10px 0 20px 0; }
    .stTabs [data-baseweb="tab"] {
        height: 65px;
        white-space: pre-wrap;
        background-color: #ffffff;
        border-radius: 12px;
        color: #64748b;
        font-weight: 700;
        font-size: 1.1rem;
        border: 1px solid #e2e8f0;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        flex-grow: 1;
        transition: all 0.2s ease;
    }
    .stTabs [data-baseweb="tab"]:hover {
        transform: translateY(-2px);
        color: #3b82f6;
        border-color: #3b82f6;
    }
    .stTabs [aria-selected="true"] {
        background-color: #3b82f6 !important;
        color: #ffffff !important;
        border: none;
        box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.3);
    }

    /* 컨텐츠 영역 스타일링 */
    [data-testid="stVerticalBlock"] > [style*="flex-direction: column;"] > [data-testid="stVerticalBlock"] {
        background-color: #ffffff;
        padding: 25px;
        border-radius: 16px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        border: 1px solid #e2e8f0;
    }
    
    /* 버튼 및 업로더 스타일 */
    .stButton>button {
        border-radius: 10px;
        height: 55px;
        font-size: 16px;
        font-weight: bold;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        border: none;
        transition: all 0.2s;
    }
    .stButton>button:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 12px rgba(0,0,0,0.15);
    }
    [data-testid='stFileUploader'] section {
        background-color: #f8fafc;
        border: 2px dashed #cbd5e1;
        border-radius: 12px;
        padding: 30px;
    }
    h1, h2, h3 { font-family: 'Pretendard', sans-serif; color: #1e293b; }
</style>
""", unsafe_allow_html=True)

# ==========================================
# 2. 유틸리티 함수 (이미지 처리 로직)
# ==========================================
def download_image_from_url(url):
    try:
        headers = {'User-Agent': 'Mozilla/5.0'}
        response = requests.get(url, headers=headers, timeout=5)
        response.raise_for_status()
        return Image.open(io.BytesIO(response.content))
    except Exception:
        return None

def merge_images_logic(images, direction, width_opt, height_opt):
    if not images: return None
    
    processed_images = []
    for img in images:
        # RGBA 이미지가 섞여 있을 경우를 대비해 RGB 캔버스에 붙일 준비
        if img.mode != 'RGB' and img.mode != 'RGBA':
            img = img.convert('RGB')
            
        target_w, target_h = img.size
        
        # 리사이징 로직
        if width_opt > 0 and height_opt == 0:
            ratio = width_opt / float(img.width)
            target_w = width_opt
            target_h = int(img.height * ratio)
        elif height_opt > 0 and width_opt == 0:
            ratio = height_opt / float(img.height)
            target_h = height_opt
            target_w = int(img.width * ratio)
        elif width_opt > 0 and height_opt > 0:
            target_w = width_opt
            target_h = height_opt
            
        if target_w != img.width or target_h != img.height:
            img = img.resize((target_w, target_h), Image.LANCZOS)
        processed_images.append(img)

    # 캔버스 크기 계산
    if direction == "세로 (↓)":
        total_w = max(img.width for img in processed_images)
        total_h = sum(img.height for img in processed_images)
    else: # 가로 (→)
        total_w = sum(img.width for img in processed_images)
        total_h = max(img.height for img in processed_images)

    # [중요] 캔버스는 RGB 모드로 생성
    new_im = Image.new('RGB', (total_w, total_h), (255, 255, 255))
    
    # 이미지 붙여넣기
    current_x, current_y = 0, 0
    for img in processed_images:
        if direction == "세로 (↓)":
            x_pos = (total_w - img.width) // 2
            y_pos = current_y
            current_y += img.height
        else:
            x_pos = current_x
            y_pos = (total_h - img.height) // 2
            current_x += img.width
            
        # 투명 배경(RGBA) 이미지가 있을 경우 처리
        if img.mode == 'RGBA':
            new_im.paste(img, (x_pos, y_pos), img)
        else:
            new_im.paste(img, (x_pos, y_pos))
            
    return new_im

# [수정 2] 이미지를 안전하게 표시하고 다운로드 버튼을 제공하는 헬퍼 함수
def display_and_download(image_obj, file_name_prefix="merged"):
    # 이미지 크기 확인 (JPEG 한계: 65535 px)
    is_too_large_for_jpeg = image_obj.height > 65000 or image_obj.width > 65000
    
    buf = io.BytesIO()
    
    if is_too_large_for_jpeg:
        # 65000px 초과 시 PNG 사용 (JPEG 저장 불가)
        save_format = "PNG"
        mime_type = "image/png"
        ext = "png"
        st.warning(f"⚠️ 이미지가 너무 커서({image_obj.height}px) PNG 포맷으로 변환되었습니다. 용량이 클 수 있습니다.")
    else:
        # 일반적인 경우 JPEG 사용 (용량 최적화)
        save_format = "JPEG"
        mime_type = "image/jpeg"
        ext = "jpg"
    
    # 메모리 버퍼에 저장
    image_obj.save(buf, format=save_format, quality=100)
    byte_data = buf.getvalue()
    
    # st.image에 PIL 객체 대신 바이트 데이터 전달 (Streamlit 재인코딩 에러 방지)
    st.image(byte_data, caption=f"결과: {image_obj.width}x{image_obj.height}px", use_container_width=True)
    
    # 다운로드 버튼
    st.download_button(
        label=f"💾 결과 저장 ({save_format})", 
        data=byte_data, 
        file_name=f"{file_name_prefix}.{ext}", 
        mime=mime_type, 
        type="secondary"
    )

# ==========================================
# 3. 메인 UI 구조
# ==========================================

# 헤더
with st.container():
    c1, c2 = st.columns([0.8, 0.2])
    with c1:
        st.title("🎨(주)가울 Image Master Pro")
        st.markdown("<p style='color:#64748b; font-size:16px;'>상품등록을 위한 이미지 처리 도구</p>", unsafe_allow_html=True)
    with c2:
        st.write("") 

st.write("") 

# 메인 탭 메뉴
tab1, tab2, tab3 = st.tabs(["📁 파일 병합", "🔗 HTML 추출 병합", "✨ AI 배너 제작"])

# ---------------------------------------------------------
# [TAB 1] 파일 병합
# ---------------------------------------------------------
with tab1:
    col_left, col_right = st.columns([1, 1.2], gap="large")
    
    with col_left:
        st.subheader("1️⃣ 설정 (Settings)")
        with st.container():
            st.info("💡 여러 장의 이미지를 드래그해서 한 번에 업로드하세요.")
            files = st.file_uploader("이미지 업로드", accept_multiple_files=True, type=['png', 'jpg', 'jpeg'], label_visibility="collapsed")
            
            st.write("")
            st.markdown("##### 병합 방향")
            direction_f = st.radio("방향", ["세로 (↓)", "가로 (→)"], horizontal=True, label_visibility="collapsed", key="dir_f")
            
            st.write("")
            with st.expander("⚙️ 고급 사이즈 설정 (클릭하여 열기)"):
                st.caption("0 입력 시 원본 비율 유지 / Auto")
                cc1, cc2 = st.columns(2)
                with cc1: w_f = st.number_input("가로 (px)", value=0, step=100, key="w_f")
                with cc2: h_f = st.number_input("세로 (px)", value=0, step=100, key="h_f")
            
            st.write("")
            merge_btn_f = st.button("🚀 이미지 병합하기", type="primary", key="btn_f")

    with col_right:
        st.subheader("2️⃣ 결과 (Result)")
        with st.container():
            if merge_btn_f and files:
                files.sort(key=lambda x: x.name)
                images = [Image.open(f) for f in files]
                result_img = merge_images_logic(images, direction_f, w_f, h_f)
                
                if result_img:
                    # [수정 3] 에러 방지 헬퍼 함수 사용
                    display_and_download(result_img, "merged_file")
            else:
                st.markdown("<div style='text-align:center; color:#94a3b8; padding:60px;'><h3>🖼️</h3><p>이미지가 여기에 표시됩니다.</p></div>", unsafe_allow_html=True)

# ---------------------------------------------------------
# [TAB 2] HTML 병합
# ---------------------------------------------------------
with tab2:
    col_lh, col_rh = st.columns([1, 1.2], gap="large")
    
    with col_lh:
        st.subheader("1️⃣ 소스 입력")
        with st.container():
            st.info("💡 <img src='...'> 태그를 자동으로 찾아 병합합니다.")
            html_code = st.text_area("HTML 코드", height=200, placeholder='<img src="https://example.com/image.jpg">', label_visibility="collapsed")
            
            st.markdown("##### 병합 방향")
            direction_h = st.radio("방향", ["세로 (↓)", "가로 (→)"], horizontal=True, label_visibility="collapsed", key="dir_h")
            
            merge_btn_h = st.button("🔍 추출 및 병합 실행", type="primary", key="btn_h")
            
            with st.expander("⚙️ 사이즈 옵션"):
                cc1, cc2 = st.columns(2)
                with cc1: w_h = st.number_input("가로 (px)", value=0, key="w_h")
                with cc2: h_h = st.number_input("세로 (px)", value=0, key="h_h")

    with col_rh:
        st.subheader("2️⃣ 결과 (Result)")
        with st.container():
            if merge_btn_h and html_code:
                with st.spinner("이미지 다운로드 중..."):
                    soup = BeautifulSoup(html_code, 'html.parser')
                    img_tags = soup.find_all('img')
                    src_list = [img['src'] for img in img_tags if 'src' in img.attrs]
                    
                    if src_list:
                        imgs = [img for url in src_list if (img := download_image_from_url(url))]
                        if imgs:
                            res_h = merge_images_logic(imgs, direction_h, w_h, h_h)
                            
                            # [수정 4] 에러 방지 헬퍼 함수 사용
                            display_and_download(res_h, "merged_html")
                        else:
                            st.error("이미지를 다운로드할 수 없습니다.")
                    else:
                        st.warning("이미지 태그를 찾을 수 없습니다.")
            else:
                 st.markdown("<div style='text-align:center; color:#94a3b8; padding:60px;'><h3>🔗</h3><p>HTML 코드를 입력하면 결과가 나옵니다.</p></div>", unsafe_allow_html=True)

# ---------------------------------------------------------
# [TAB 3] AI 배너 제작
# ---------------------------------------------------------
with tab3:
    col_ai_l, col_ai_r = st.columns([1, 1.2], gap="large")
    
    with col_ai_l:
        st.subheader("1️⃣ AI 스튜디오")
        with st.container():
            st.markdown("##### ① 원본 이미지")
            ai_file = st.file_uploader("누끼 따고 싶은 이미지", type=['png', 'jpg', 'jpeg'], key="ai_in", label_visibility="collapsed")
            
            st.write("")
            st.markdown("##### ② 캔버스 사이즈")
            c1, c2 = st.columns(2)
            with c1: ai_w = st.number_input("가로 (px)", value=1000, step=100)
            with c2: ai_h = st.number_input("세로 (px)", value=1000, step=100)
            
            st.markdown("##### ③ 배경 색상")
            ai_bg = st.color_picker("배경색 선택", "#F8F9FA")
            
            st.write("")
            ai_btn = st.button("✨ AI 배너 생성하기", type="primary", key="btn_ai")

    with col_ai_r:
        st.subheader("2️⃣ 제작 결과")
        with st.container():
            if ai_file and ai_btn:
                with st.spinner("AI가 배경을 지우고 디자인 중입니다... (약 10초)"):
                    try:
                        input_img = Image.open(ai_file)
                        no_bg_img = remove(input_img, alpha_matting=True)
                        
                        canvas = Image.new("RGBA", (ai_w, ai_h), ai_bg)
                        
                        # 중앙 정렬 로직 (여백 15%)
                        img_w, img_h = no_bg_img.size
                        scale = min(ai_w / img_w, ai_h / img_h) * 0.85
                        new_w, new_h = int(img_w * scale), int(img_h * scale)
                        resized_img = no_bg_img.resize((new_w, new_h), Image.LANCZOS)
                        
                        pos_x = (ai_w - new_w) // 2
                        pos_y = (ai_h - new_h) // 2
                        
                        canvas.paste(resized_img, (pos_x, pos_y), resized_img)
                        final_rgb = canvas.convert("RGB")
                        
                        # [수정 5] 에러 방지 헬퍼 함수 사용
                        display_and_download(final_rgb, "ai_banner")
                        
                    except Exception as e:
                        st.error(f"오류: {e}")
            else:
                st.markdown("<div style='text-align:center; color:#94a3b8; padding:60px;'><h3>🎨</h3><p>이미지를 업로드하면<br>배경 제거 후 배너를 생성합니다.</p></div>", unsafe_allow_html=True)
