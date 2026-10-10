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
    f = max(1, round(min(a.size) * 0.01))
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
# The wordmark's soft shadow reaches down to the dog's head, so a hard crop either clips the head or keeps a
# shadow band. Instead: crop from just under the letters and flatten low-frequency shading (soft shadows and the
# background gradient) back to BG, keeping the sharp emboss of the drawing. Edges then match BG with no seam.
def flatten(img, radius=40):
    blur = img.filter(ImageFilter.GaussianBlur(radius))
    hp = ImageChops.subtract(img, blur, 1, 128)  # img - blur + 128
    return ImageChops.add(hp, Image.new('RGB', img.size, BG), 1, -128)
HEAD_TOP = 518  # first row below the letters' crisp edges (measured); the head's highlight starts ~528
M = 60          # margin for the blur; above HEAD_TOP it is a mirror of the crop, so the letters never leak in
hiker_box = (hiker_box[0], HEAD_TOP, hiker_box[2], hiker_box[3])
body = src.crop((hiker_box[0] - M, HEAD_TOP, hiker_box[2] + M, hiker_box[3] + M))
work = Image.new('RGB', (body.width, body.height + M))
work.paste(body.crop((0, 0, body.width, M)).transpose(Image.FLIP_TOP_BOTTOM), (0, 0))
work.paste(body, (0, M))
hiker = flatten(work).crop((M, M, M + hiker_box[2] - hiker_box[0], M + hiker_box[3] - HEAD_TOP))
# Fade only the top 10 px (above the head) into BG so the crop's top edge leaves no line.
ramp = Image.new('L', hiker.size, 255)
for y in range(10):
    ramp.paste(round(255 * y / 10), (0, y, hiker.width, y + 1))
hiker = Image.composite(hiker, Image.new('RGB', hiker.size, BG), ramp)
# In the first 30 rows, pixels only slightly off BG are the letters' leftover shadow; the head's highlights and
# engraved lines are far from BG, so they stay.
px = hiker.load()
for y in range(30):
    for x in range(hiker.width):
        if max(abs(c - b) for c, b in zip(px[x, y], BG)) < 26:
            px[x, y] = BG

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
for size, name in ((64, 'favicon-64.png'), (180, 'apple-touch-icon.png'), (192, 'icon-192.png'), (512, 'icon-512.png')):
    on_square(hiker, size, 0.80).save(OUT / name, optimize=True)
# Android "maskable" app icon: the OS crops it to a circle/squircle, so keep the hiker inside the middle 80%.
on_square(hiker, 512, 0.62).save(OUT / 'icon-maskable-512.png', optimize=True)
on_square(hiker, 720, 0.70).save(HERE.parent / 'google-logo.png', optimize=True)

print('bg', BG, 'hiker', hiker_box, 'word', word_box)
