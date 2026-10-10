"""The DogMan – business model: what it takes to earn 15,000 kr/month after tax.

  python business_model.py

All prices incl. 25% moms (VAT) unless marked "ex". Tax = Danish personal tax 2026 for a sole trader
(enkeltmandsvirksomhed) living in Ballerup Kommune, not a member of the church. Rates (2026):
AM-bidrag 8%, personfradrag 54,100, bundskat 12.01%, kommuneskat Ballerup 25.5%,
beskæftigelsesfradrag 12.75% (max 63,300), mellemskat 7.5% over 641,200 (after AM).
Not tax advice – check with skat.dk / an accountant before filing.
"""
MOMS = 1.25
TARGET_NET_YEAR = 15_000 * 12


def tax(profit, salary=0.0):
    """Total personal tax on salary + business profit; returns (tax, net)."""
    work = salary + profit                      # arbejdsindkomst (beskæftigelsesfradrag base)
    am = 0.08 * work
    pi = work - am                              # personlig indkomst after AM
    bund = 0.1201 * max(0, pi - 54_100)
    besk = min(0.1275 * work, 63_300)
    kommune = 0.255 * max(0, pi - besk - 54_100)
    mellem = 0.075 * max(0, pi - 641_200)
    total = am + bund + kommune + mellem
    return total, work - total


def profit_needed(net_target, salary=0.0):
    """Business profit needed so that net income rises by net_target (on top of a salary)."""
    base_net = tax(0, salary)[1]
    lo, hi = 0, 2_000_000
    for _ in range(60):
        mid = (lo + hi) / 2
        if tax(mid, salary)[1] - base_net < net_target:
            lo = mid
        else:
            hi = mid
    return hi


# ---- Yearly costs (ex moms) – all deductible business expenses ----
COSTS = {
    'Ansvarsforsikring (sorumluluk sigortası)': 3_000,
    'Muhasebe programı (Dinero vb.)': 1_500,
    'Telefon + internet (iş payı)': 2_400,
    'GPS takip cihazı 4 adet (Tractive) + abonelik': 2_400 + 4 * 60 * 12,
    'Ekipman: tasma, kayış, mama, kaka poşeti, ilk yardım, yağmurluk': 4_000,
    'Flyer + afiş baskı': 1_500,
    'Meta reklam (750 kr/ay)': 9_000,
    'Etkinlik masrafı (ödül maması, kahve, malzeme) 300 kr/ay': 3_600,
    'Kurs: köpek ilk yardım': 1_500,
    'Ulaşım: kargo bisiklet (amortisman) / kilometre': 6_000,
    'Alan adı, hosting, yazılım': 300,
}
COST_YEAR = sum(COSTS.values())

# ---- Product ladder ----
CURRENT = {'solo': 120}
RECOMMENDED = {
    'solo': 149,        # 30 min solo walk
    'pack': 179,        # 60 min pack walk, max 4 dogs, picked up at the door
    'boarding': 275, 'daycare': 200,
    'plans': {          # monthly price, walks/month, kind of walk
        'Klippekort 10 (3 ay)': (1590 / 3, 10 / 3, 'pack'),
        'Ugetur – 8 flok-tur/ay': (1190, 8, 'pack'),
        'Hverdag – 22 flok-tur/ay': (2990, 22, 'pack'),
        'Premium Alfa – 22 solo tur + GPS canlı + foto + 1 gece pansiyon': (4490, 22, 'solo'),
    },
}
HOURS = {'solo': 0.75, 'pack_walk': 1 + 4 * 10 / 60}   # solo 30 min + pickup; pack 60 min + 4 pickups


def month_mix(members, oneoff_solo, oneoff_pack, boarding_nights, daycare_days, events):
    """Revenue (incl. moms) and walking hours for one month."""
    rev, solo_walks, pack_dogwalks = 0.0, 0, 0
    for name, n in members.items():
        price, walks, kind = RECOMMENDED['plans'][name]
        rev += n * price
        if kind == 'solo': solo_walks += n * walks
        else: pack_dogwalks += n * walks
    rev += oneoff_solo * RECOMMENDED['solo'] + oneoff_pack * RECOMMENDED['pack']
    solo_walks += oneoff_solo; pack_dogwalks += oneoff_pack
    rev += boarding_nights * RECOMMENDED['boarding'] + daycare_days * RECOMMENDED['daycare'] + events
    hours = solo_walks * HOURS['solo'] + (pack_dogwalks / 3.2) * HOURS['pack_walk']  # packs ~80% full
    return rev, hours, solo_walks, pack_dogwalks


if __name__ == '__main__':
    print('=== Vergi 2026 (Ballerup, tek gelir) ===')
    for p in (150_000, 200_000, 250_000, 300_000, 350_000):
        t, n = tax(p)
        print(f'kâr {p:>8,.0f} → vergi {t:>8,.0f} ({t/p:5.1%}) → net {n:>8,.0f} = {n/12:>7,.0f}/ay')
    need_a = profit_needed(TARGET_NET_YEAR)
    need_b = profit_needed(TARGET_NET_YEAR, salary=480_000)
    print(f'\nHedef 180.000 net/yıl: A) tek gelir → kâr {need_a:,.0f} kr/yıl ({need_a/12:,.0f}/ay)')
    print(f'                       B) 480k maaşın üstüne yan gelir → kâr {need_b:,.0f} kr/yıl ({need_b/12:,.0f}/ay)')
    print(f'\nGiderler (moms hariç): {COST_YEAR:,.0f} kr/yıl = {COST_YEAR/12:,.0f}/ay')
    rev_ex_a = need_a + COST_YEAR
    print(f'Gerekli ciro A: {rev_ex_a:,.0f} ex moms = {rev_ex_a*MOMS:,.0f} incl. moms/yıl = {rev_ex_a*MOMS/12:,.0f}/ay')

    print('\n=== Bugünkü fiyatla (120 kr solo tur) ===')
    walks = rev_ex_a / (CURRENT['solo'] / MOMS)
    print(f'{walks:,.0f} tur/yıl = {walks/12:,.0f}/ay → {walks*HOURS["solo"]/52:,.0f} saat/hafta (sadece solo tur)')

    print('\n=== Önerilen ürün karışımı (1. yıl sonu hedef ay) ===')
    mix = dict(members={'Klippekort 10 (3 ay)': 3, 'Ugetur – 8 flok-tur/ay': 6, 'Hverdag – 22 flok-tur/ay': 4,
                        'Premium Alfa – 22 solo tur + GPS canlı + foto + 1 gece pansiyon': 2},
               oneoff_solo=15, oneoff_pack=10, boarding_nights=10, daycare_days=6, events=1_000)
    rev, hours, solo, pack = month_mix(**mix)
    rev_ex = rev / MOMS
    profit_year = rev_ex * 12 - COST_YEAR
    t, n = tax(profit_year)
    print(f'ciro {rev:,.0f} incl. moms/ay ({rev_ex:,.0f} ex) · {solo} solo tur + {pack} flok köpek-tur · {hours:,.0f} saat/ay ({hours/4.33:,.0f} saat/hafta)')
    print(f'yıllık kâr {profit_year:,.0f} → vergi {t:,.0f} → net {n:,.0f} = {n/12:,.0f} kr/ay')

    print('\n=== Gelir/saat (moms hariç) ===')
    print(f'solo 120 kr: {120/MOMS/HOURS["solo"]:,.0f} kr/saat · solo 149 kr: {149/MOMS/HOURS["solo"]:,.0f} kr/saat · '
          f'flok 179 kr×3,2 köpek: {179*3.2/MOMS/HOURS["pack_walk"]:,.0f} kr/saat')


# ---- 1-year ramp (Nov 2026 – Oct 2027) and 3-year view ----
def year1():
    months = ['Kas 26', 'Ara 26', 'Oca 27', 'Şub 27', 'Mar 27', 'Nis 27', 'May 27', 'Haz 27', 'Tem 27', 'Ağu 27', 'Eyl 27', 'Eki 27']
    kl = [1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3]
    ug = [0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6, 6]
    hv = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4]
    pr = [0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2]
    solo = [12, 14, 12, 13, 14, 15, 15, 15, 12, 15, 15, 15]
    pack = [4, 6, 6, 7, 8, 8, 10, 10, 8, 10, 10, 10]
    board = [4, 12, 4, 4, 6, 8, 8, 12, 20, 10, 8, 10]     # Christmas + summer holiday peaks
    day = [2, 2, 3, 3, 4, 4, 5, 5, 4, 6, 6, 6]
    ev = [0, 300, 300, 500, 500, 700, 800, 800, 600, 1000, 1000, 1000]
    rows, tot = [], 0
    for i, m in enumerate(months):
        members = {'Klippekort 10 (3 ay)': kl[i], 'Ugetur – 8 flok-tur/ay': ug[i], 'Hverdag – 22 flok-tur/ay': hv[i],
                   'Premium Alfa – 22 solo tur + GPS canlı + foto + 1 gece pansiyon': pr[i]}
        rev, hours, s, p = month_mix(members, solo[i], pack[i], board[i], day[i], ev[i])
        tot += rev / MOMS
        rows.append((m, kl[i] + ug[i] + hv[i] + pr[i], rev, hours / 4.33))
    return rows, tot

if __name__ == '__main__':
    print('\n=== 1. yıl aylık plan ===')
    rows, rev_ex_year = year1()
    for m, mem, rev, h in rows:
        print(f'{m}: üye {mem:>2} · ciro {rev:>7,.0f} incl. moms · {h:>4.0f} saat/hafta')
    prof = rev_ex_year - COST_YEAR
    t, n = tax(prof)
    print(f'1. yıl toplam: ciro {rev_ex_year:,.0f} ex moms · gider {COST_YEAR:,.0f} · kâr {prof:,.0f} · vergi {t:,.0f} · net {n:,.0f} ({n/12:,.0f}/ay ort.)')

    print('\n=== 3 yıllık görünüm (yıllık, moms hariç) ===')
    plans = [
        ('Yıl 1 (tek kişi)', rev_ex_year, COST_YEAR, 0),
        ('Yıl 2 (+1 yarı zamanlı yürüyüşçü, 80 saat/ay)', 58_000 / MOMS * 12, 60_000, 80 * 205 * 12),
        ('Yıl 3 (+2 yürüyüşçü, 2 flok rotası, etkinlik geliri)', 92_000 / MOMS * 12, 90_000, 2 * 80 * 205 * 12),
    ]
    for name, rev, cost, staff in plans:
        prof = rev - cost - staff
        t, n = tax(prof)
        print(f'{name}: ciro {rev:,.0f} · gider {cost:,.0f} · personel {staff:,.0f} · kâr {prof:,.0f} · net {n:,.0f} ({n/12:,.0f}/ay)')
