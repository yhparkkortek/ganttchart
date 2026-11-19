"""
assets/certmarks/*.png 의 색을 한꺼번에 바꾼다 — 라벨 도안 위 인증마크(UL/CE/CB/FCC/DC/AC)는
js/67-document-page.js 가 이 PNG를 그대로 <img>로 찍으므로, CSS가 아니라 파일 자체의 RGB를
바꿔야 그림이 바뀐다(글자 배지(CB, noImage)만 CSS 색이라 거기선 안 건드린다).

⚠️ 알파 채널(모양·안티앨리어싱)은 그대로 두고 RGB만 새 색으로 덮어쓴다 — 그래야 테두리가
   흐려지는 정도는 원본과 같고 색만 바뀐다.

사용법:
    py -3-32 tools/recolor-certmarks.py            # #4d4d4d(70% 그레이)로
    py -3-32 tools/recolor-certmarks.py "#1971c2"   # 다른 색으로

회사 PC엔 Pillow가 기본 설치돼 있지 않을 수 있다 — 없으면 먼저 `pip install pillow`.
"""
import sys
import os
from PIL import Image

ASSET_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'certmarks')


def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def recolor(path, rgb):
    im = Image.open(path).convert('RGBA')
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 0:
                px[x, y] = (rgb[0], rgb[1], rgb[2], a)
    im.save(path)


def main():
    target = sys.argv[1] if len(sys.argv) > 1 else '#4d4d4d'
    rgb = hex_to_rgb(target)
    if not os.path.isdir(ASSET_DIR):
        print('폴더가 없습니다:', ASSET_DIR)
        return
    names = [f for f in os.listdir(ASSET_DIR) if f.lower().endswith('.png')]
    if not names:
        print('PNG가 없습니다:', ASSET_DIR)
        return
    for name in sorted(names):
        path = os.path.join(ASSET_DIR, name)
        recolor(path, rgb)
        print('칠함:', name, '->', target)


if __name__ == '__main__':
    main()
