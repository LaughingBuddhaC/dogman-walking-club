"""Brand assets from the embossed logo (logo-son.jpg) – the main logo since 2026-10-10.

  python make_emboss.py

The embossed logo is the same colour as its background (only light and shadow show it), so it can't be cut
out to transparency. Instead the hiker and the wordmark are placed on generous squares/plaques of the logo's
own grey, so nothing is ever clipped. Outputs go to ../../public/img/brand/ and this folder.
"""
import pathlib
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parent.parent / 'public' / 'img' / 'brand'
OUT.mkdir(parents=True, exist_ok=True)

src = Image.open(HERE / 'logo-son.jpg').convert('RGB')
W, H = src.size
BG = tuple(round(v) for v in ImageStat.Stat(src.crop((0, 0, 200, 200))).median)


def bbox(region, thresh=14):
    """Bounding box (in source coords) of everything that differs from the flat background inside region."""
    x0, y0, x1, y1 = region
    crop = src.crop(region)
    diff = ImageChops.difference(crop, Image.new('RGB', crop.size, BG)).convert('L')
    box = diff.point(lambda v: 255 if v > thresh else 0).filter(ImageFilter.MinFilter(3)).getbbox()
    return (x0 + box[0], y0 + box[1], x0 + box[2], y0 + box[3])


def padded(box, pad):
    w, h = box[2] - box[0], box[3] - box[1]
    p = round(max(w, h) * pad)
    return (max(0, box[0] - p), max(0, box[1] - p), min(W, box[2] + p), min(H, box[3] + p))


def on_square(art, size, fill):
    """Art centred on a BG square; art is feathered at its edges so the seam disappears."""
    canvas = Image.new('RGB', (size, size), BG)
    k = fill * size / max(art.size)
    a = art.resize((round(art.width * k), round(art.height * k)), Image.LANCZOS)
    mask = Image.new('L', a.size, 0)
    f = max(2, round(min(a.size) * 0.06))
    ImageDraw.Draw(mask).rectangle((f, f, a.width - f, a.height - f), fill=255)
    canvas.paste(a, ((size - a.width) // 2, (size - a.height) // 2), mask.filter(ImageFilter.GaussianBlur(f / 2)))
    return canvas


def circle(img):
    m = Image.new('L', (img.width * 4, img.height * 4), 0)
    ImageDraw.Draw(m).ellipse((0, 0, m.width - 1, m.height - 1), fill=255)
    out = img.convert('RGBA')
    out.putalpha(m.resize(img.size, Image.LANCZOS))
    return out


# The hiker sits below ~y=0.345 and between x=0.38..0.62; the wordmark is above it.
SPLIT = round(H * .346)  # between the wordmark's shadow and the dog's head; crops never cross it
hiker_box = padded(bbox((round(W * .38), SPLIT, round(W * .62), H)), 0.05)
hiker_box = (hiker_box[0], max(hiker_box[1], SPLIT + 2), hiker_box[2], hiker_box[3])
word_box = padded(bbox((0, round(H * .15), W, SPLIT - 4)), 0.06)
word_box = (word_box[0], word_box[1], word_box[2], min(word_box[3], SPLIT - 4))
full_box = padded((word_box[0], word_box[1], word_box[2], hiker_box[3]), 0.06)
hiker = src.crop(hiker_box)

# Medallion (square + round) for header mark, photo sticker, badges.
square = on_square(hiker, 512, 0.74)
square.save(OUT / 'mark-emboss.png', optimize=True)
circle(square).save(OUT / 'mark-emboss-round.png', optimize=True)

# Wordmark plaque and the full logo (wordmark + hiker).
src.crop(word_box).save(OUT / 'wordmark-emboss.jpg', quality=90)
full = src.crop(full_box)
full.thumbnail((1400, 1400), Image.LANCZOS)
full.save(OUT / 'logo-emboss.jpg', quality=90)

# Icons: favicons and app icons (square, the browser/OS rounds them).
for size, name in ((64, 'favicon-64.png'), (180, 'apple-touch-icon.png'), (512, 'icon-512.png')):
    on_square(hiker, size, 0.80).save(OUT / name, optimize=True)
on_square(hiker, 720, 0.70).save(HERE.parent / 'google-logo.png', optimize=True)

print('bg', BG, 'hiker', hiker_box, 'word', word_box)
