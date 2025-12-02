import streamlit as st
from PIL import Image
from rembg import remove
import io
import requests
from bs4 import BeautifulSoup
import time

# ==========================================
# 1. 페이지 설정 및 공통 함수 정의
# ==========================================
st.set_page_config(page_title="통합 이미지 마스터 도구", page_icon="🛠️", layout="wide")

# CSS 커스텀 (버튼 스타일 등)
st.markdown("""
<style>
    .stButton>button { width: 100%; border-radius: 5px; font-weight: bold; }
    .stTabs [data-baseweb="tab-list"] { gap: 10px; }
    .stTabs [data-baseweb="tab"] { height: 50px; white-space: pre-wrap; background-color: #f0f2f6; border-radius: 5px; }
    .stTabs [aria-selected="true"] { background-color: #3b82f6; color: white; }
</style>
""", unsafe_allow_html=True)

def download_image_from_url(url):
    """URL에서 이미지를 다운로드하여 PIL 이미지 객체로 반환"""
    try:
        # 봇 차단을 막기 위한 헤더 설정
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        response = requests.get(url, headers=headers, timeout=5)
        response.raise_for_status()
        return Image.open(io.BytesIO(response.content))
    except Exception as e:
        st.warning(f"이미지 다운로드 실패 ({url}): {e}")
        return None

def merge_images_logic(images, direction, width_opt, height_opt):
    """이미지 리스트를 받아서 병합 처리"""
    if not images:
        return None

    # 리사이징 처리
    processed_images = []
    for img in images:
        target_w, target_h = img.size
        
        # 가로/세로 설정에 따른 크기 계산
        if width_opt > 0 and height_opt == 0: # 가로만 고정
            ratio = width_opt / float(img.width)
            target_w = width_opt
            target_h = int(img.height * ratio)
        elif height_opt > 0 and width_opt == 0: # 세로만 고정
            ratio = height_opt / float(img.height)
            target_h = height_opt
            target_w = int(img.width * ratio)
        elif width_opt > 0 and height_opt > 0: # 둘 다 고정 (강제)
            target_w = width_opt
            target_h = height_opt
            
        if target_w != img.width or target_h != img.height:
            img = img.resize((target_w, target_h), Image.LANCZOS)
        
        processed_images.append(img)

    # 캔버스 크기 계산
    if direction == "세로 (Vertical)":
        total_w = max(img.width for img in processed_images)
        total_h = sum(img.height for img in processed_images)
    else: # 가로 (Horizontal)
        total_w = sum(img.width for img in processed_images)
        total_h = max(img.height for img in processed_images)

    # 병합
    new_im = Image.new('RGB', (total_w, total_h), color=(255, 255, 255))
    
    current_x, current_y = 0, 0
    for img in processed_images:
        # 중앙 정렬을 위한 좌표 계산
        if direction == "세로 (Vertical)":
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
# 2. 메인 UI 구성
# ==========================================
st.title("🛠️ Web Programming Expert 통합 도구")
st.caption("Python Streamlit 기반 | 비용 0원 | 보안 이슈 없음")

tab1, tab2, tab3 = st.tabs(["📁 1. 파일 병합", "🔗 2. HTML 병합", "🎨 3. AI 배너 제작"])

# ------------------------------------------
# TAB 1: 파일 병합
# ------------------------------------------
with tab1:
    st.header("내 컴퓨터의 이미지 이어붙이기")
    
    col1_f, col2_f = st.columns([1, 2])
    
    with col1_f:
        files = st.file_uploader("이미지 선택 (다중 선택 가능)", accept_multiple_files=True, type=['png', 'jpg', 'jpeg'])
        direction_f = st.radio("병합 방향", ["세로 (Vertical)", "가로 (Horizontal)"], index=0, key="dir_f")
        
        st.write("사이즈 설정 (0 입력 시 원본 비율/Auto)")
        w_f = st.number_input("가로 (px)", value=0, key="w_f")
        h_f = st.number_input("세로 (px)", value=0, key="h_f")
        
        merge_btn_f = st.button("파일 병합 실행", type="primary")

    with col2_f:
        if merge_btn_f and files:
            # 파일 이름순 정렬
            files.sort(key=lambda x: x.name)
            images = [Image.open(f) for f in files]
            
            result_img = merge_images_logic(images, direction_f, w_f, h_f)
            
            if result_img:
                st.image(result_img, caption="병합 결과", use_container_width=True)
                
                # 다운로드
                buf = io.BytesIO()
                result_img.save(buf, format="JPEG", quality=95)
                st.download_button("💾 병합된 이미지 저장", data=buf.getvalue(), file_name="merged_file.jpg", mime="image/jpeg")

# ------------------------------------------
# TAB 2: HTML 병합
# ------------------------------------------
with tab2:
    st.header("HTML 태그에서 이미지 추출 및 병합")
    st.info("💡 Python 서버가 직접 다운로드하므로 CORS/Proxy 설정이 필요 없습니다.")
    
    col1_h, col2_h = st.columns([1, 2])
    
    with col1_h:
        html_code = st.text_area("HTML 코드 입력", height=150, placeholder='<img src="..."> 태그가 포함된 코드를 붙여넣으세요.')
        direction_h = st.radio("병합 방향", ["세로 (Vertical)", "가로 (Horizontal)"], index=0, key="dir_h")
        
        st.write("사이즈 설정 (0 입력 시 원본 비율/Auto)")
        w_h = st.number_input("가로 (px)", value=0, key="w_h")
        h_h = st.number_input("세로 (px)", value=0, key="h_h")
        
        merge_btn_h = st.button("HTML 이미지 추출 및 병합", type="primary")

    with col2_h:
        if merge_btn_h and html_code:
            with st.spinner("이미지 링크 분석 및 다운로드 중..."):
                soup = BeautifulSoup(html_code, 'html.parser')
                img_tags = soup.find_all('img')
                src_list = [img['src'] for img in img_tags if 'src' in img.attrs]
                
                if not src_list:
                    st.error("이미지 태그(<img src=...>)를 찾을 수 없습니다.")
                else:
                    st.success(f"총 {len(src_list)}개의 이미지 링크를 찾았습니다.")
                    
                    downloaded_imgs = []
                    for src in src_list:
                        img = download_image_from_url(src)
                        if img:
                            downloaded_imgs.append(img)
                    
                    if downloaded_imgs:
                        result_img_h = merge_images_logic(downloaded_imgs, direction_h, w_h, h_h)
                        st.image(result_img_h, caption="HTML 병합 결과", use_container_width=True)
                        
                        buf = io.BytesIO()
                        result_img_h.save(buf, format="JPEG", quality=95)
                        st.download_button("💾 병합된 이미지 저장", data=buf.getvalue(), file_name="merged_html.jpg", mime="image/jpeg")
                    else:
                        st.error("다운로드 가능한 이미지가 없습니다.")

# ------------------------------------------
# TAB 3: AI 배너 제작
# ------------------------------------------
with tab3:
    st.header("AI 누끼 & 배너 자동 생성")
    
    col1_a, col2_a = st.columns([1, 2])
    
    with col1_a:
        ai_file = st.file_uploader("원본 이미지 (1장)", type=['png', 'jpg', 'jpeg'], key="ai_input")
        
        st.write("캔버스 설정")
        col_sz1, col_sz2 = st.columns(2)
        with col_sz1:
            ai_w = st.number_input("가로 (px)", value=1000, step=100, key="ai_w")
        with col_sz2:
            ai_h = st.number_input("세로 (px)", value=1000, step=100, key="ai_h")
            
        ai_bg = st.color_picker("배경 색상", "#FFFFFF")
        
        ai_btn = st.button("✨ 배너 생성 시작", type="primary")
        
    with col2_a:
        if ai_file and ai_btn:
            with st.spinner("배경 제거 작업 중... (최초 실행 시 모델 다운로드로 1~2분 소요될 수 있습니다)"):
                try:
                    # 1. 배경 제거
                    input_img = Image.open(ai_file)
                    no_bg_img = remove(input_img, alpha_matting=True)
                    
                    # 2. 캔버스 생성 및 배치
                    canvas = Image.new("RGBA", (ai_w, ai_h), ai_bg)
                    
                    # 3. 리사이징 (여백 90%)
                    img_w, img_h = no_bg_img.size
                    scale = min(ai_w / img_w, ai_h / img_h) * 0.9
                    new_w = int(img_w * scale)
                    new_h = int(img_h * scale)
                    resized_img = no_bg_img.resize((new_w, new_h), Image.LANCZOS)
                    
                    # 4. 중앙 정렬
                    pos_x = (ai_w - new_w) // 2
                    pos_y = (ai_h - new_h) // 2
                    
                    canvas.paste(resized_img, (pos_x, pos_y), resized_img)
                    
                    # 5. 결과 출력
                    final_rgb = canvas.convert("RGB") # JPG 저장을 위해 변환
                    st.image(final_rgb, caption="AI 배너 결과", use_container_width=True)
                    
                    buf = io.BytesIO()
                    final_rgb.save(buf, format="JPEG", quality=95)
                    st.download_button("💾 배너 다운로드", data=buf.getvalue(), file_name="ai_banner.jpg", mime="image/jpeg")
                    
                except Exception as e:
                    st.error(f"AI 처리 중 오류 발생: {e}")