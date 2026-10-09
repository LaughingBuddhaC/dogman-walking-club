"""Builds the printable flyer pages (HTML) and renders them to PDF with headless Chrome.

  python build_flyers.py

Outputs in this folder: flyer-a5.pdf (one A5), flyer-a5-2up.pdf (two A5 on one A4 sheet, cut in half),
poster-a4.pdf (A4 notice-board poster with tear-off strips).
"""
import pathlib, subprocess

HERE = pathlib.Path(__file__).resolve().parent
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
FONT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap">'
PAW = ('<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5.5" cy="10" r="2.1"/><circle cx="9.2" cy="5.4" r="2.1"/>'
       '<circle cx="14.8" cy="5.4" r="2.1"/><circle cx="18.5" cy="10" r="2.1"/><path d="M12 11.2c-3 0-6 4-6 6.4 0 1.7 1.3 2.6 3 2.6 1.3 0 2-.6 3-.6s1.7.6 3 .6c1.7 0 3-.9 3-2.6 0-2.4-3-6.4-6-6.4z"/></svg>')
TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
TICKS = ['Hentet ved døren', 'Alle dage kl. 06–24', 'Enkeltvis eller hver uge', 'Betal med MobilePay']

SHEET = f'''<div class="sheet" style="width:{{w}};height:{{h}}">
  <div class="top"><div class="brand"><span class="mark raise">{PAW}</span>DogMan Walking Club</div><div class="area inset"><i></i>Skovlunde + 5 km</div></div>
  <div><h1>Hundeluftning<br><span>i Skovlunde</span></h1><p class="sub">En gåtur på <b>30 minutter</b> for din hund – hentet og afleveret ved din dør.</p></div>
  <div class="photo raise"><img src="../public/img/river.jpg" alt=""><div class="price raise"><b>120 kr.</b><small>pr. tur · 30 min.</small></div></div>
  <ul class="ticks">{''.join(f'<li>{TICK}{t}</li>' for t in TICKS)}</ul>
  <div class="cta inset"><div class="qr raise"><img src="qr.svg" alt="QR-kode til dmw.cansasmaz.com"></div>
    <div><h2>Scan og book<br>på 1 minut</h2><span class="url">dmw.cansasmaz.com</span><p>+80 kr. pr. ekstra hund. Du betaler først, når turen er bekræftet.</p></div></div>
  <div class="foot"><span>Can og Boris (golden retriever, 7 år)</span><span>Booking also in English</span></div>
</div>'''


def page(title, size, u, body, extra_css=''):
    return f'''<!doctype html><html lang="da"><head><meta charset="utf-8"><title>{title}</title>{FONT}
<link rel="stylesheet" href="flyer.css"><style>@page{{size:{size};margin:0}}:root{{--u:{u}}}{extra_css}</style></head>
<body>{body}</body></html>'''


STRIPS_CSS = '''
.poster{width:210mm;height:297mm;padding:4mm;display:flex;flex-direction:column;gap:0}
.strips{display:grid;grid-template-columns:repeat(8,1fr);height:56mm;margin-top:3mm}
.strip{border-left:.3mm dashed #9aa1ab;display:flex;flex-direction:column;align-items:center;gap:2mm;padding:3mm 1mm 2mm}
.strip:last-child{border-right:.3mm dashed #9aa1ab}
.strip img{width:15mm;height:15mm}
.strip .v{writing-mode:vertical-rl;transform:rotate(180deg);font-size:3.1mm;line-height:1.25;font-weight:600;text-align:left;flex:1}
.strip .v b{font-weight:800;color:#b44d08}
.cut{font-size:2.6mm;color:#7a7f88;text-align:center;margin-top:2mm}
'''
STRIP = '<div class="strip"><img src="qr.svg" alt=""><div class="v"><b>Hundeluftning 120 kr.</b><br>dmw.cansasmaz.com</div></div>'

pages = {
    'flyer-a5': page('DogMan flyer A5', 'A5', '0.95mm',
                     f'<div style="padding:4mm">{SHEET.format(w="140mm", h="202mm")}</div>'),
    'flyer-a5-2up': page('DogMan flyer A5 x2', 'A4 landscape', '0.95mm',
                         '<div style="display:flex">' + (f'<div style="padding:4mm">{SHEET.format(w="140.5mm", h="202mm")}</div>' * 2) + '</div>'),
    'poster-a4': page('DogMan poster A4', 'A4', '1.2mm',
                      f'<div class="poster">{SHEET.format(w="202mm", h="230mm")}<div class="cut">✂ Riv en strimmel af og scan koden</div>'
                      f'<div class="strips">{STRIP * 8}</div></div>', STRIPS_CSS),
}

for name, html in pages.items():
    src = HERE / f'{name}.html'
    src.write_text(html, encoding='utf-8')
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=8000',
                    f'--print-to-pdf={HERE / (name + ".pdf")}', src.as_uri()], check=True, capture_output=True)
    print('wrote', name + '.pdf')
