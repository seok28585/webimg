import streamlit as st
from PIL import Image
from rembg import remove
import io
import requests
from bs4 import BeautifulSoup

# ==========================================
# 1. 페이지 설정 및 디자인 (CSS) - UI 대폭 개선
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
    /* 전체 배경색: 연한 그레이톤으로 변경하여 눈의 피로 감소 */
    .stApp {
        background-color: #f1f5f9;
    }
    
    /* ----------------------------------------------------
       [핵심 개선] 탭(Tab) UI 스타일링 - 직관적인 카드형 버튼
       ---------------------------------------------------- */
    
    /* 탭 컨테이너: 간격을 넓게 벌림 */
    .stTabs [data-baseweb="tab-list"] {
        gap: 20px;
        padding: 10px 0 20px 0;
    }

    /* 개별 탭 버튼 (기본 상태) */
    .stTabs [data-baseweb="tab"] {
        height: 65px;               /* 높이 확대 */
        white-space: pre-wrap;
        background-color: #ffffff;  /* 카드 배경 */
        border-radius: 12px;        /* 둥근 모서리 */
        color: #64748b;             /* 기본 텍스트 색상 */
        font-weight: 700;           /* 굵은 폰트 */
        font-size: 1.1rem;          /* 폰트 크기 확대 */
        border: 1px solid #e2e8f0;  /* 얇은 테두리 */
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        flex-grow: 1;               /* 가로 폭을 꽉 채움 (Spacious) */
        transition: all 0.2s ease;  /* 부드러운 전환 효과 */
    }

    /* 탭에 마우스 올렸을 때 */
    .stTabs [data-baseweb="tab"]:hover {
        transform: translateY(-2px);
        color: #3b82f6;
        border-color: #3b82f6;
    }

    /* 선택된 탭 (Active 상태) - 확실한 강조 */
    .stTabs [aria-selected="true"] {
        background-color: #3b82f6 !important;  /* 진한 파란색 배경 */
        color: #ffffff !important;             /* 흰색 텍스트 */
        border: none;
        box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.3);
    }

    /* ----------------------------------------------------
       컨텐츠 영역 스타일링 (Card UI)
       ---------------------------------------------------- */
    
    /* 각 섹션을 흰색 카드로 감싸기 */
    [data-testid="stVerticalBlock"] > [style*="flex-direction: column;"] > [data-testid="stVerticalBlock"] {
        background-color: #ffffff;
        padding: 25px;
        border-radius: 16px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        border: 1px solid #e2e8f0;
    }
    
    /* 버튼 스타일 통일 */
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

    /* 파일 업로더 디자인 */
    [data-testid='stFileUploader'] section {
        background-color: #f8fafc;
        border: 2px dashed #cbd5e1;
        border-radius: 12px;
        padding: 30px;
    }
    
    /* 타이틀 폰트 */
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
        new_im.paste(img, (x_pos, y_pos))
    return new_im

# ==========================================
# 3. 메인 UI 구조
# ==========================================

# 헤더
with st.container():
    c1, c2 = st.columns([0.8, 0.2])
    with c1:
        st.title("🎨(주)가울 Image Master Pro")
        st.markdown("<p style='color:#64748b; font-size:16px;'>디자이너를 위한 올인원 이미지 처리 도구</p>", unsafe_allow_html=True)
    with c2:
        st.write("") # 여백용

st.write("") # 간격

# 메인 탭 메뉴
tab1, tab2, tab3 = st.tabs(["📁 파일 병합", "🔗 HTML 추출 병합", "✨ AI 배너 제작"])

# ---------------------------------------------------------
# [TAB 1] 파일 병합
# ---------------------------------------------------------
with tab1:
    col_left, col_right = st.columns([1, 1.2], gap="large")
    
    with col_left:
        st.subheader("1️⃣ 설정 (Settings)")
        # 카드형 컨테이너 자동 적용됨 (CSS)
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
                    st.image(result_img, caption=f"결과: {result_img.width}x{result_img.height}px", use_container_width=True)
                    
                    buf = io.BytesIO()
                    result_img.save(buf, format="JPEG", quality=100)
                    st.download_button("💾 결과 저장 (JPG)", data=buf.getvalue(), file_name="merged.jpg", mime="image/jpeg", type="secondary")
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
                            st.image(res_h, caption=f"병합 완료 ({len(imgs)}장)", use_container_width=True)
                            
                            buf = io.BytesIO()
                            res_h.save(buf, format="JPEG", quality=100)
                            st.download_button("💾 결과 저장 (JPG)", data=buf.getvalue(), file_name="html_merged.jpg", mime="image/jpeg", type="secondary")
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
                        
                        st.image(final_rgb, caption="AI 생성 배너", use_container_width=True)
                        
                        buf = io.BytesIO()
                        final_rgb.save(buf, format="JPEG", quality=100)
                        st.download_button("💾 배너 다운로드", data=buf.getvalue(), file_name="ai_banner.jpg", mime="image/jpeg", type="primary")
                    except Exception as e:
                        st.error(f"오류: {e}")
            else:
                st.markdown("<div style='text-align:center; color:#94a3b8; padding:60px;'><h3>🎨</h3><p>이미지를 업로드하면<br>배경 제거 후 배너를 생성합니다.</p></div>", unsafe_allow_html=True)

