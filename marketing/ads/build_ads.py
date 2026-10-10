"""Renders the ad kit (PNG) from HTML with headless Chrome.

  python build_ads.py

Outputs in this folder:
  ad-square-logo.png   1080x1080  Instagram/Facebook feed (logo)
  ad-square-photo.png  1080x1080  Instagram/Facebook feed (photo + logo)
  ad-story.png         1080x1920  Instagram/Facebook stories and reels cover
  ad-link.png          1200x630   Facebook link posts
"""
import pathlib, subprocess

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
LOGO = (ROOT / 'public/img/brand/logo-emboss.jpg').as_uri()
HIKER = (ROOT / 'public/img/brand/mark-emboss-round.png').as_uri()
PHOTO = (ROOT / 'public/img/river.jpg').as_uri()

BASE = '''<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800&display=swap">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:%(w)dpx;height:%(h)dpx;overflow:hidden}
body{font-family:Inter,sans-serif;color:#1d1d1f;letter-spacing:-.02em;background:#e7ebf0;position:relative}
.g{background:linear-gradient(90deg,#d9620c,#a8740a);-webkit-background-clip:text;background-clip:text;color:transparent}
.btn{display:inline-block;background:linear-gradient(135deg,#ffad5c,#f07a1e);color:#1d1d1f;font-weight:700;border-radius:999px;
  box-shadow:10px 10px 22px #c3cad4,-10px -10px 22px #ffffff}
.chip{display:inline-block;font-weight:600;color:#4a4b52;border-radius:999px;box-shadow:inset 4px 4px 8px #c3cad4,inset -4px -4px 8px #ffffff}
img.logo{border-radius:36px;box-shadow:14px 14px 30px #c3cad4,-14px -14px 30px #ffffff}
%(css)s
</style></head><body>%(body)s</body></html>'''

ADS = {
  'ad-square-logo': (1080, 1080, '''
    .wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;text-align:center;padding:70px}
    .logo{width:560px}
    h1{font-size:76px;font-weight:800;line-height:1}
    .chips{display:flex;gap:16px}.chip{font-size:28px;padding:14px 26px}
    .btn{font-size:34px;padding:24px 46px}''', '''
    <div class="wrap"><img class="logo" src="%(LOGO)s">
    <h1>Hundeluftning<br><span class="g">i Skovlunde</span></h1>
    <div class="chips"><span class="chip">30 min.</span><span class="chip">120 kr. pr. tur</span><span class="chip">Hentet ved døren</span></div>
    <span class="btn">Book på dmw.cansasmaz.com</span></div>'''),
  'ad-square-photo': (1080, 1080, '''
    .photo{position:absolute;left:40px;right:40px;top:40px;height:620px;border-radius:44px;overflow:hidden;box-shadow:14px 14px 30px #c3cad4,-14px -14px 30px #ffffff}
    .photo img{width:100%;height:100%;object-fit:cover;object-position:50% 50%}
    .badge{position:absolute;right:70px;top:580px;width:230px;height:230px;border-radius:50%;display:block;
      box-shadow:12px 12px 26px #c3cad4,-12px -12px 26px #ffffff}
    .badge img{width:100%;height:100%;border-radius:50%;display:block}
    .text{position:absolute;left:80px;right:330px;top:700px}
    h1{font-size:62px;font-weight:800;line-height:1.02}
    p{font-size:30px;color:#62636a;margin-top:14px;font-weight:600}
    .btn{position:absolute;left:80px;bottom:56px;font-size:30px;padding:20px 38px}''', '''
    <div class="photo"><img src="%(PHOTO)s"></div><div class="badge"><img src="%(HIKER)s"></div>
    <div class="text"><h1>Din hund. <span class="g">Vores tur.</span></h1><p>30 min. gåtur i Skovlunde · 120 kr.</p></div>
    <span class="btn">Book på dmw.cansasmaz.com</span>'''),
  'ad-story': (1080, 1920, '''
    .wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;text-align:center;padding:170px 80px 200px;gap:44px}
    .logo{width:760px}
    h1{font-size:96px;font-weight:800;line-height:1}
    .list{display:flex;flex-direction:column;gap:18px;margin-top:10px}.chip{font-size:36px;padding:18px 34px}
    .btn{margin-top:auto;font-size:40px;padding:30px 56px}
    .area{font-size:30px;color:#62636a;font-weight:600}''', '''
    <div class="wrap"><img class="logo" src="%(LOGO)s">
    <h1>Hundeluftning<br><span class="g">i Skovlunde</span></h1>
    <div class="list"><span class="chip">30 minutters gåtur</span><span class="chip">Hentet og afleveret ved døren</span><span class="chip">120 kr. pr. tur · alle dage 06–24</span></div>
    <span class="area">Skovlunde · Ballerup · Herlev · Måløv · Glostrup</span>
    <span class="btn">Book på dmw.cansasmaz.com</span></div>'''),
  'ad-link': (1200, 630, '''
    .logo{position:absolute;left:70px;top:60px;height:510px}
    .text{position:absolute;left:620px;right:60px;top:110px}
    h1{font-size:64px;font-weight:800;line-height:1.02}
    p{font-size:28px;color:#62636a;margin-top:20px;font-weight:600;line-height:1.35}
    .btn{margin-top:34px;font-size:26px;padding:18px 34px}''', '''
    <img class="logo" src="%(LOGO)s">
    <div class="text"><h1>Hundeluftning<br><span class="g">i Skovlunde</span></h1>
    <p>30 min. gåtur, hentet og afleveret ved din dør.<br>120 kr. pr. tur · alle dage 06–24</p>
    <span class="btn">dmw.cansasmaz.com</span></div>'''),
}

for name, (w, h, css, body) in ADS.items():
    html = BASE % {'w': w, 'h': h, 'css': css, 'body': body % {'LOGO': LOGO, 'HIKER': HIKER, 'PHOTO': PHOTO}}
    src = HERE / f'{name}.html'
    src.write_text(html, encoding='utf-8')
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
                    '--virtual-time-budget=8000', f'--window-size={w},{h}', f'--screenshot={HERE / (name + ".png")}', src.as_uri()],
                   check=True, capture_output=True)
    src.unlink()
    print('wrote', name + '.png')

