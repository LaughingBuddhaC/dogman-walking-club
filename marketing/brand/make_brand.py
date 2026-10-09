"""Turns the source logo images into transparent brand assets for the site, ads and print.

  python make_brand.py

Sources (in this folder): logo-stamp.jpg (main stamp logo), logo-line.jpg (clean line version),
logo-emboss.jpg (white embossed version). Outputs go to ../../public/img/brand/ and this folder.
"""
import pathlib
from PIL import Image, ImageChops, ImageOps

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parent.parent / 'public' / 'img' / 'brand'
OUT.mkdir(parents=True, exist_ok=True)
INK = (36, 48, 38)       # deep forest green from the logo
CREAM = (244, 239, 228)  # paper colour, used for the dark-mode version


def alpha_from(img, lo=60, hi=200):
    """Alpha mask from darkness: ink -> opaque, paper -> transparent (keeps the stamp texture)."""
    g = ImageOps.grayscale(img)
    return g.point(lambda v: 255 if v <= lo else 0 if v >= hi else round(255 * (hi - v) / (hi - lo)))


def colored(mask, rgb):
    out = Image.new('RGBA', mask.size, rgb + (0,))
    out.putalpha(mask)
    return out


def trim(mask, pad=0.04):
    box = mask.point(lambda v: 255 if v > 40 else 0).getbbox()
    w, h = box[2] - box[0], box[3] - box[1]
    p = round(max(w, h) * pad)
    return (max(0, box[0] - p), max(0, box[1] - p), min(mask.width, box[2] + p), min(mask.height, box[3] + p))


def save(mask, name, width=None):
    for suffix, rgb in (('green', INK), ('cream', CREAM)):
        im = colored(mask, rgb)
        if width and im.width > width:
            im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        im.save(OUT / f'{name}-{suffix}.png', optimize=True)


stamp = Image.open(HERE / 'logo-stamp.jpg').convert('RGB')
line = Image.open(HERE / 'logo-line.jpg').convert('RGB')
W, H = stamp.size

# Full stamp logo (wordmark + hiker) and its parts. The wordmark sits above ~y=0.355 of the image.
m = alpha_from(stamp)
full = m.crop(trim(m))
save(full, 'logo-stamp', 1400)
split = round(H * 0.355)
word = m.crop((0, 0, W, round(H * 0.338))); word = word.crop(trim(word, 0.02))
save(word, 'wordmark', 1200)
hiker = m.crop((round(W * 0.39), split, round(W * 0.61), H)); hiker = hiker.crop(trim(hiker, 0.03))
save(hiker, 'hiker-stamp', 900)

# Clean line hiker for small sizes (header mark, favicon, profile pictures).
ml = alpha_from(line, 90, 190)
# Hiker only: narrow x range (0.40-0.60) so no wordmark fragments are included.
lh = ml.crop((round(line.width * 0.40), round(line.height * 0.3405), round(line.width * 0.60), line.height)); lh = lh.crop(trim(lh, 0.03))
save(lh, 'hiker-line', 600)

# Square icons: line hiker centred on paper (favicons, Google profile, social avatars).
def square_icon(size, bg, fg, scale=0.78):
    canvas = Image.new('RGBA', (size, size), bg + (255,))
    art = colored(lh, fg)
    k = scale * size / max(art.size)
    art = art.resize((round(art.width * k), round(art.height * k)), Image.LANCZOS)
    canvas.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
    return canvas

square_icon(512, CREAM, INK).save(OUT / 'icon-512.png', optimize=True)
square_icon(180, CREAM, INK).save(OUT / 'apple-touch-icon.png', optimize=True)
square_icon(64, CREAM, INK, 0.86).save(OUT / 'favicon-64.png', optimize=True)
square_icon(720, CREAM, INK, 0.72).convert('RGB').save(HERE / 'google-profile-720.png', optimize=True)
print('ok', full.size, word.size, hiker.size, lh.size)
