import streamlit as st
from PIL import Image
from rembg import remove
import io
import requests
from bs4 import BeautifulSoup

# ==========================================
# 1. 페이지 설정 및 커스텀 디자인 (CSS)
# ==========================================
st.set_page_config(
    page_title="Image Master Pro",
    page_icon="🎨",
    layout="wide",
    initial_sidebar_state="expanded"
)

# 커스텀 CSS 주입 (웹 디자인 요소 강화)
st.markdown("""
<style>
    /* 전체 폰트 및 배경 설정 */
    .stApp {
        background-color: #f8f9fa;
    }
    
    /* 메인 타이틀 스타일 */
    h1 {
        font-family: 'Helvetica Neue', sans-serif;
        font-weight: 700;
        color: #1e293b;
        margin-bottom: 0px;
    }
    
    /* 탭 스타일 개선 */
    .stTabs [data-baseweb="tab-list"] {
        gap: 8px;
        background-color: white;
        padding: 10px;
        border-radius: 10px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .stTabs [data-baseweb="tab"] {
        height: 45px;
        white-space: pre-wrap;
        background-color: transparent;
        border-radius: 5px;
        color: #64748b;
        font-weight: 600;
        border: none;
    }
    .stTabs [aria-selected="true"] {
        background-color: #3b82f6;
        color: white;
    }
    
    /* 버튼 스타일 (그라데이션 및 쉐도우) */
    .stButton>button {
        width: 100%;
        border-radius: 8px;
        font-weight: bold;
        border: none;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        transition: all 0.3s ease;
    }
    .stButton>button:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 10px rgba(0, 0, 0, 0.15);
    }
    
    /* 카드형 컨테이너 스타일 */
    [data-testid="stVerticalBlock"] > [style*="flex-direction: column;"] > [data-testid="stVerticalBlock"] {
        background-color: white;
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    
    /* 업로더 디자인 깔끔하게 */
    [data-testid='stFileUploader'] {
        width: 100%;
    }
    [data-testid='stFileUploader'] section {
        padding: 20px;
        background-color: #f1f5f9;
        border: 2px dashed #cbd5e1;
    }
</style>
""", unsafe_allow_html=True)

# ==========================================
# 2. 유틸리티 함수 (기능 로직)
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
        
        # 0이면 원본 비율 유지, 값이 있으면 리사이징
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

    if direction == "세로 (↓)":
        total_w = max(img.width for img in processed_images)
        total_h = sum(img.height for img in processed_images)
    else: # 가로 (→)
        total_w = sum(img.width for img in processed_images)
        total_h = max(img.height for img in processed_images)

    new_im = Image.new('RGB', (total_w, total_h), (255, 255, 255))
    
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
# 3. 메인 UI 레이아웃
# ==========================================

# 헤더 섹션
with st.container():
    col_h1, col_h2 = st.columns([0.8, 0.2])
    with col_h1:
        st.title("🎨 Image Master Pro")
        st.markdown("<p style='color:#64748b; font-size:1.1em;'>디자이너를 위한 올인원 이미지 병합 & AI 편집 도구</p>", unsafe_allow_html=True)
    with col_h2:
        st.caption("Ver 2.0 | Python Streamlit")

st.markdown("---")

# 탭 메뉴 구성
tab1, tab2, tab3 = st.tabs(["📁 파일 병합", "🔗 HTML 추출 병합", "✨ AI 배너 제작"])

# ---------------------------------------------------------
# [TAB 1] 파일 병합 - Split Layout 적용
# ---------------------------------------------------------
with tab1:
    col_left, col_right = st.columns([1, 1.5], gap="large")
    
    # [왼쪽] 컨트롤 패널
    with col_left:
        st.subheader("1️⃣ 설정 (Settings)")
        with st.container(border=True):
            files = st.file_uploader("이미지를 드래그하여 추가하세요", accept_multiple_files=True, type=['png', 'jpg', 'jpeg'])
            
            st.write("") # 여백
            st.markdown("**병합 방향**")
            direction_f = st.radio("방향 선택", ["세로 (↓)", "가로 (→)"], horizontal=True, label_visibility="collapsed", key="dir_f")
            
            st.write("") 
            with st.expander("⚙️ 고급 사이즈 설정 (선택 사항)"):
                st.info("0으로 설정하면 원본 비율을 유지합니다.")
                c1, c2 = st.columns(2)
                with c1: w_f = st.number_input("가로 (px)", value=0, step=100, key="w_f")
                with c2: h_f = st.number_input("세로 (px)", value=0, step=100, key="h_f")
            
            st.write("")
            merge_btn_f = st.button("🚀 이미지 병합 실행", type="primary", key="btn_f")

    # [오른쪽] 미리보기 패널
    with col_right:
        st.subheader("2️⃣ 결과 (Preview)")
        with st.container(border=True):
            if merge_btn_f and files:
                files.sort(key=lambda x: x.name)
                images = [Image.open(f) for f in files]
                result_img = merge_images_logic(images, direction_f, w_f, h_f)
                
                if result_img:
                    st.image(result_img, caption=f"병합 완료: {result_img.width}x{result_img.height}px", use_container_width=True)
                    
                    # 다운로드 버튼 스타일링
                    buf = io.BytesIO()
                    result_img.save(buf, format="JPEG", quality=100)
                    st.download_button("💾 결과 이미지 다운로드", data=buf.getvalue(), file_name="merged_result.jpg", mime="image/jpeg", type="secondary")
            else:
                st.markdown(
                    """
                    <div style='text-align: center; color: #cbd5e1; padding: 50px;'>
                        <h3>🖼️</h3>
                        <p>왼쪽에서 이미지를 업로드하고<br>'병합 실행'을 눌러주세요.</p>
                    </div>
                    """, unsafe_allow_html=True
                )

# ---------------------------------------------------------
# [TAB 2] HTML 병합
# ---------------------------------------------------------
with tab2:
    col_left_h, col_right_h = st.columns([1, 1.5], gap="large")
    
    with col_left_h:
        st.subheader("1️⃣ 소스 입력")
        with st.container(border=True):
            st.info("HTML 코드의 <img src='...'> 태그를 자동으로 분석합니다.")
            html_code = st.text_area("HTML 코드 붙여넣기", height=200, placeholder='<img src="https://...">')
            
            st.markdown("**병합 방향**")
            direction_h = st.radio("방향 선택", ["세로 (↓)", "가로 (→)"], horizontal=True, label_visibility="collapsed", key="dir_h")
            
            merge_btn_h = st.button("🔍 이미지 추출 및 병합", type="primary", key="btn_h")
            
            with st.expander("⚙️ 사이즈 옵션"):
                c1, c2 = st.columns(2)
                with c1: w_h = st.number_input("가로 (px)", value=0, key="w_h")
                with c2: h_h = st.number_input("세로 (px)", value=0, key="h_h")

    with col_right_h:
        st.subheader("2️⃣ 결과 확인")
        with st.container(border=True):
            if merge_btn_h and html_code:
                with st.spinner("이미지를 다운로드하고 연결하는 중..."):
                    soup = BeautifulSoup(html_code, 'html.parser')
                    img_tags = soup.find_all('img')
                    src_list = [img['src'] for img in img_tags if 'src' in img.attrs]
                    
                    if src_list:
                        downloaded_imgs = [img for url in src_list if (img := download_image_from_url(url))]
                        if downloaded_imgs:
                            res_h = merge_images_logic(downloaded_imgs, direction_h, w_h, h_h)
                            st.image(res_h, caption=f"총 {len(downloaded_imgs)}장 병합됨", use_container_width=True)
                            
                            buf = io.BytesIO()
                            res_h.save(buf, format="JPEG", quality=100)
                            st.download_button("💾 결과 저장", data=buf.getvalue(), file_name="html_merged.jpg", mime="image/jpeg")
                        else:
                            st.error("이미지 다운로드 실패")
                    else:
                        st.warning("img 태그를 찾을 수 없습니다.")
            else:
                st.markdown("<div style='text-align: center; color: #cbd5e1; padding: 50px;'><h3>🔗</h3><p>HTML 코드를 입력하면<br>결과가 여기에 표시됩니다.</p></div>", unsafe_allow_html=True)

# ---------------------------------------------------------
# [TAB 3] AI 배너 제작
# ---------------------------------------------------------
with tab3:
    st.markdown("#### 🤖 AI 배경 제거 & 스튜디오")
    
    col_ai_l, col_ai_r = st.columns([1, 1.5], gap="large")
    
    with col_ai_l:
        with st.container(border=True):
            st.markdown("**1. 원본 업로드**")
            ai_file = st.file_uploader("상품/인물 이미지 (배경 제거용)", type=['png', 'jpg', 'jpeg'], key="ai_input")
            
            st.markdown("**2. 캔버스 설정**")
            c1, c2 = st.columns(2)
            with c1: ai_w = st.number_input("폭 (Width)", value=1000, step=100)
            with c2: ai_h = st.number_input("높이 (Height)", value=1000, step=100)
            
            st.markdown("**3. 배경 컬러**")
            ai_bg = st.color_picker("색상 선택", "#F8F9FA")
            
            st.write("")
            ai_btn = st.button("✨ AI 배너 생성하기", type="primary", key="btn_ai")

    with col_ai_r:
        with st.container(border=True):
            if ai_file and ai_btn:
                with st.spinner("AI가 피사체를 분리하고 디자인 중입니다..."):
                    try:
                        input_img = Image.open(ai_file)
                        no_bg_img = remove(input_img, alpha_matting=True)
                        
                        canvas = Image.new("RGBA", (ai_w, ai_h), ai_bg)
                        
                        # 리사이징 및 중앙 정렬 로직
                        img_w, img_h = no_bg_img.size
                        scale = min(ai_w / img_w, ai_h / img_h) * 0.85 # 여백 15%
                        new_w, new_h = int(img_w * scale), int(img_h * scale)
                        resized_img = no_bg_img.resize((new_w, new_h), Image.LANCZOS)
                        
                        pos_x = (ai_w - new_w) // 2
                        pos_y = (ai_h - new_h) // 2
                        
                        canvas.paste(resized_img, (pos_x, pos_y), resized_img)
                        final_rgb = canvas.convert("RGB")
                        
                        st.image(final_rgb, caption="AI 생성 결과", use_container_width=True)
                        
                        buf = io.BytesIO()
                        final_rgb.save(buf, format="JPEG", quality=100)
                        st.download_button("💾 배너 다운로드", data=buf.getvalue(), file_name="ai_banner.jpg", mime="image/jpeg", type="primary")
                        
                    except Exception as e:
                        st.error(f"오류 발생: {e}")
            else:
                st.markdown("<div style='text-align: center; color: #cbd5e1; padding: 80px;'><h3>🎨</h3><p>이미지를 업로드하면<br>AI가 배경을 지우고 배너를 만들어줍니다.</p></div>", unsafe_allow_html=True)
