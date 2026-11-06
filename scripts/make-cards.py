"""Нарезка колоды «Русский стиль» (1911, общественное достояние) в apps/mobile/assets/cards.

Источники (Wikimedia Commons):
  sheet.png: File:Russian_playing_card_deck_Russian_style_1911_original.png (миниатюра 1920px)
  faces.jpg: File:Russian_playing_card_deck_(face_cards)_Russian_style_1911_original.jpg

На листе есть 15 картинок и рубашка. К♦ и Т♥ берутся со второго снимка
(К♦ виден наполовину: нижняя половина двусторонней карты = верхняя, повёрнутая на 180°).
Числовые карты 7–10 собираются из чистого бланка и очков, вырезанных с оригинальных карт.

Запуск: python3 scripts/make-cards.py sheet.png faces.jpg  (нужны Pillow, numpy, scipy)
"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy import ndimage

W, H = 275, 425
OUT = os.path.join(os.path.dirname(__file__), '..', 'apps', 'mobile', 'assets', 'cards')
sheet = Image.open(sys.argv[1]).convert('RGB')
faces = Image.open(sys.argv[2]).convert('RGB')

def card(x, y, inset=0):
    c = sheet.crop((x + inset, y + inset, x + W - inset, y + H - inset))
    return c.resize((W, H), Image.LANCZOS) if inset else c

# Координаты карт на листе 1920px (левый верхний угол).
SHEET = {
    'C11': (26, 25), 'H13': (341, 26), 'D14': (997, 26), 'H12': (1308, 27), 'C13': (1616, 26),
    'D12': (29, 485), 'H11': (640, 485), 'D11': (1000, 485), 'C12': (1306, 485), 'C14': (1617, 487),
    'S13': (31, 949), 'S11': (337, 949), 'S14': (648, 949), 'S12': (1307, 948), 'back': (1617, 951),
}
NINE_S, TEN_D = (647, 26), (1000, 1131)

def paper_color(img):
    a = np.asarray(img).astype(float)
    return np.median(a[60:120, 100:170].reshape(-1, 3), axis=0)

def round_mask(r=20):
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, W - 1, H - 1), r, fill=255)
    return m

MASK = round_mask()

def save(name, img):
    img = img.resize((W, H), Image.LANCZOS).convert('RGBA')
    img.putalpha(MASK)
    img.save(os.path.join(OUT, f'{name}.webp'), 'WEBP', quality=85, method=6)

def extract(img, box, ink_dark):
    """Вырезать очко с альфой по удалённости от цвета бумаги."""
    x, y, w, h = box
    c = img.crop((x - 3, y - 3, x + w + 3, y + h + 3))
    a = np.asarray(c).astype(float)
    paper = paper_color(img)
    dist = np.linalg.norm(a - paper, axis=2)
    alpha = np.clip((dist - 45) / 60, 0, 1) * 255
    # оставить только самую крупную связную область (само очко)
    lab, n = ndimage.label(alpha > 60)
    if n > 1:
        sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
        keep = ndimage.binary_dilation(lab == (1 + int(np.argmax(sizes))), iterations=3)
        alpha *= keep
    rgba = np.dstack([a, alpha]).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA')

def blank():
    """Чистый бланк из 9♠: очки и индексы заклеиваются кусками чистой бумаги с той же карты."""
    base = card(*NINE_S)
    out = base.copy()
    boxes = [(32, 36, 53, 61), (198, 31, 53, 64), (32, 132, 53, 65), (198, 133, 53, 63), (113, 182, 53, 65),
             (30, 232, 54, 66), (196, 233, 54, 65), (30, 334, 54, 65), (196, 334, 53, 65),
             (14, 20, 26, 30), (236, 375, 28, 32)]
    src = (98, 42)  # чистая бумага между колонками над центральным очком
    for x, y, w, h in boxes:
        pw, ph = w + 14, h + 14
        patch = base.crop((src[0], src[1], src[0] + pw, src[1] + ph))
        m = Image.new('L', (pw, ph), 0)
        ImageDraw.Draw(m).rectangle((5, 5, pw - 6, ph - 6), fill=255)
        out.paste(patch, (x - 7, y - 7), m.filter(ImageFilter.GaussianBlur(3)))
    return out

PIPS = {
    'S': extract(card(*NINE_S), (32, 36, 53, 61), True),
    'D': extract(card(*TEN_D), (34, 26, 55, 60), False),
    'H': extract(card(*SHEET['H13']), (30, 30, 53, 50), False),
    'C': extract(card(*SHEET['C11']), (26, 29, 58, 57), True),
}
for k, p in PIPS.items():
    s = 60 / max(p.size)
    PIPS[k] = p.resize((round(p.width * s), round(p.height * s)), Image.LANCZOS)

# Центры очков. Левая и правая колонки, ряды; ниже середины карты очки перевёрнуты.
LX, RX, CX = 58, 224, 139
R4 = [66, 164, 264, 366]
R3 = [66, 215, 366]
LAYOUT = {
    7: [(x, y) for x in (LX, RX) for y in R3] + [(CX, 140)],
    8: [(x, y) for x in (LX, RX) for y in R3] + [(CX, 140), (CX, 290)],
    9: [(x, y) for x in (LX, RX) for y in R4] + [(CX, 215)],
    10: [(x, y) for x in (LX, RX) for y in R4] + [(CX, 112), (CX, 316)],
}
FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', 17)
INK = {'S': (35, 32, 30), 'C': (35, 32, 30), 'D': (205, 45, 35), 'H': (205, 45, 35)}

def number_card(suit, rank, base):
    img = base.copy()
    pip = PIPS[suit]
    for cx, cy in LAYOUT[rank]:
        p = pip if cy <= H / 2 + 10 else pip.rotate(180)
        img.paste(p, (cx - p.width // 2, cy - p.height // 2), p)
    label = str(rank)
    tl = Image.new('RGBA', (40, 26), (0, 0, 0, 0))
    ImageDraw.Draw(tl).text((20, 13), label, font=FONT, fill=INK[suit], anchor='mm')
    img.paste(tl, (8, 14), tl)
    br = tl.rotate(180)
    img.paste(br, (W - 8 - 40, H - 14 - 26), br)
    return img

def main():
    os.makedirs(OUT, exist_ok=True)
    for name, xy in SHEET.items():
        save(name, card(*xy, inset=3))
    # Т♥ целиком с нижнего ряда второго снимка, К♦ — верхняя половина + поворот.
    save('H14', faces.crop((606, 350, 800, 640)))
    top = faces.crop((606, 179, 800, 179 + 145))
    kd = Image.new('RGB', (194, 290))
    kd.paste(top, (0, 0))
    kd.paste(top.rotate(180), (0, 145))
    save('D13', kd)
    base = blank()
    for suit in 'SCDH':
        for rank in (7, 8, 9, 10):
            save(f'{suit}{rank}', number_card(suit, rank, base).crop((3, 3, W - 3, H - 3)))
    print('ok', len(os.listdir(OUT)))

main()
