// Booking emails via Resend (https://resend.com, plain HTTP API). Without RESEND_API_KEY nothing is sent.
// New booking → receipt to the customer + notice to the admin. Admin confirms → confirmation to the customer
// with "Add to Google Calendar" buttons and a calendar file (.ics) with reminders 1 day and 1 hour before.
const SITE = process.env.SITE_URL || 'https://dmw.cansasmaz.com';
const FROM = process.env.MAIL_FROM || 'The DogMan <booking@dmw.cansasmaz.com>';
const ADMIN = process.env.ADMIN_EMAIL || 'm.cansasmaz@gmail.com';
export const mailOn = () => !!process.env.RESEND_API_KEY;

export async function sendMail({ to, subject, html, text, replyTo, attachments }) {
  if (!mailOn() || !to) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, html, text, reply_to: replyTo || undefined, attachments }),
    });
    if (!r.ok) console.error('mail', r.status, await r.text().catch(() => ''));
    return r.ok;
  } catch (e) { console.error('mail', e.message); return false; }
}

const L = {
  da: { walk: 'Gåtur', visit1: 'Hjemmebesøg', visit2: '2 besøg om dagen', daycare: 'Dagpleje', boarding: 'Pasning hos mig', housesit: 'Huspasning',
    service: 'Ydelse', when: 'Hvornår', pets: 'Kæledyr', address: 'Adresse', price: 'Pris (anslået)', pay: 'Betaling', notes: 'Besked', meet: 'Mødes først',
    meetYes: 'Ja – gratis møde (15 min.) før første tur', ref: 'Bookingnr.', at: 'kl.', to: 'til', credits: '{n} klip brugt', due: 'ekstra hunde: {p}',
    payMp: 'MobilePay til {n}, når jeg har bekræftet', payLater: 'Jeg sender betalingsoplysninger, når jeg har bekræftet',
    payMpNow: 'MobilePay til {n} senest på dagen for (første) tur', payLaterNow: 'Jeg sender betalingsoplysninger',
    reqSubject: 'Tak for din booking – {s}', reqHead: 'Tak for din booking!', reqText: 'Jeg har modtaget din booking og vender tilbage hurtigst muligt. Du får en ny mail, når den er bekræftet – med knapper til din kalender.',
    okSubject: 'Bekræftet: {s} {w}', okHead: 'Din booking er bekræftet ✓', okText: 'Vi ses ved døren! Tilføj turene til din kalender, så får du en påmindelse.',
    gcal: 'Tilføj til Google Kalender', gcalAll: 'Tilføj alle til Google Kalender (gentages hver uge)', icsNote: 'iPhone/Outlook: åbn den vedhæftede kalenderfil (påmindelse dagen før og 1 time før).',
    mine: 'Se og aflys dine ture', terms: 'Handelsbetingelser', title: '{s} med The DogMan', calDetails: 'The DogMan · {s}. Se, ret eller aflys: {u}',
    cancelRule: 'Gratis afbestilling indtil 24 timer før (pasning: 7 dage).', sign: 'Kærlig hilsen\nCan & Boris · The DogMan' },
  en: { walk: 'Dog walk', visit1: 'Home visit', visit2: '2 visits a day', daycare: 'Day care', boarding: 'Boarding', housesit: 'House sitting',
    service: 'Service', when: 'When', pets: 'Pets', address: 'Address', price: 'Price (estimate)', pay: 'Payment', notes: 'Message', meet: 'Meet first',
    meetYes: 'Yes – free meet & greet (15 min.) before the first walk', ref: 'Booking no.', at: 'at', to: 'to', credits: '{n} credits used', due: 'extra dogs: {p}',
    payMp: 'MobilePay to {n} once I have confirmed', payLater: 'I will send payment details once I have confirmed',
    payMpNow: 'MobilePay to {n} on the day of the (first) walk at the latest', payLaterNow: 'I will send payment details',
    reqSubject: 'Thanks for your booking – {s}', reqHead: 'Thanks for your booking!', reqText: 'I have received your booking and will get back to you as soon as possible. You will get another email when it is confirmed – with buttons for your calendar.',
    okSubject: 'Confirmed: {s} {w}', okHead: 'Your booking is confirmed ✓', okText: 'See you at the door! Add the walks to your calendar to get a reminder.',
    gcal: 'Add to Google Calendar', gcalAll: 'Add all to Google Calendar (repeats weekly)', icsNote: 'iPhone/Outlook: open the attached calendar file (reminder the day before and 1 hour before).',
    mine: 'See or cancel your walks', terms: 'Terms', title: '{s} with The DogMan', calDetails: 'The DogMan · {s}. See, change or cancel: {u}',
    cancelRule: 'Free cancellation until 24 hours before (boarding: 7 days).', sign: 'Best wishes\nCan & Boris · The DogMan' },
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const kr = (n) => `${Number(n).toLocaleString('da-DK')} kr.`;
const ymd = (d) => d.replace(/-/g, '');
const addDay = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const dates = (b) => (b.dates?.length ? b.dates : [b.date]);

// Copenhagen wall-clock time → UTC (handles summer/winter time).
function cph(date, time) {
  const guess = new Date(`${date}T${time}:00Z`);
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Copenhagen', timeZoneName: 'shortOffset' }).formatToParts(guess).find((p) => p.type === 'timeZoneName').value;
  const m = /GMT([+-]\d+)/.exec(name);
  return new Date(guess.getTime() - (m ? Number(m[1]) : 0) * 3600e3);
}
const utc = (d) => d.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
// Events of a booking: timed walks (30 min), all-day visit/day-care days, or one stay from drop-off to pick-up.
export function events(b) {
  if (b.end) return [{ allDay: true, start: ymd(b.date), end: ymd(addDay(b.end, 1)), date: b.date }];
  return dates(b).map((d) => (b.time
    ? { start: utc(cph(d, b.time)), end: utc(new Date(cph(d, b.time).getTime() + 30 * 60e3)), date: d }
    : { allDay: true, start: ymd(d), end: ymd(addDay(d, 1)), date: d }));
}
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
export function googleLink(b, ev, lang, recurring = false) {
  const t = L[lang], u = new URL('https://calendar.google.com/calendar/render');
  u.searchParams.set('action', 'TEMPLATE');
  u.searchParams.set('text', t.title.replace('{s}', t[b.service] + (b.dog ? ' – ' + b.dog : '')));
  u.searchParams.set('dates', `${ev.start}/${ev.end}`);
  u.searchParams.set('details', t.calDetails.replace('{s}', b.id).replace('{u}', SITE + '/account/'));
  if (b.address) u.searchParams.set('location', b.address);
  if (recurring) u.searchParams.set('recur', `RRULE:FREQ=WEEKLY;BYDAY=${b.weekdays.map((n) => BYDAY[n]).join(',')};UNTIL=${ymd(dates(b).at(-1))}T235959Z`);
  return u.toString();
}
const icsText = (s) => String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
const fold = (line) => { const out = []; let s = line; while (s.length > 73) { out.push(s.slice(0, 73)); s = ' ' + s.slice(73); } out.push(s); return out; };
export function icsFile(b, lang) {
  const t = L[lang], stamp = utc(new Date()), title = t.title.replace('{s}', t[b.service] + (b.dog ? ' – ' + b.dog : ''));
  const alarm = (trigger) => ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(title), 'TRIGGER:' + trigger, 'END:VALARM'];
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//The DogMan//Booking//DA', 'METHOD:PUBLISH',
    ...events(b).flatMap((e, i) => ['BEGIN:VEVENT', `UID:${b.id}-${i}@dmw.cansasmaz.com`, 'DTSTAMP:' + stamp,
      e.allDay ? 'DTSTART;VALUE=DATE:' + e.start : 'DTSTART:' + e.start, e.allDay ? 'DTEND;VALUE=DATE:' + e.end : 'DTEND:' + e.end,
      'SUMMARY:' + icsText(title), 'DESCRIPTION:' + icsText(t.calDetails.replace('{s}', b.id).replace('{u}', SITE + '/account/')),
      ...(b.address ? ['LOCATION:' + icsText(b.address)] : []), 'URL:' + SITE + '/account/',
      ...alarm('-P1D'), ...(e.allDay ? [] : alarm('-PT1H')), 'END:VEVENT']),
    'END:VCALENDAR'];
  return lines.flatMap(fold).join('\r\n') + '\r\n';
}

function whenLines(b, lang) {
  const t = L[lang], loc = lang === 'en' ? 'en-GB' : 'da-DK';
  const f = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  if (b.end) return [`${f(b.date)} ${t.to} ${f(b.end)}`];
  return dates(b).map((d) => f(d) + (b.time ? ` ${t.at} ${b.time}` : ''));
}
function rows(b, config, lang, admin, confirmed = false) {
  const t = L[lang], w = whenLines(b, lang);
  const pets = (b.petList || []).map((p) => [p.name, p.breed].filter(Boolean).join(', ')).filter(Boolean).join(' · ') || String(b.pets || 1);
  const price = b.credits ? t.credits.replace('{n}', b.credits) + (b.due ? ' · ' + t.due.replace('{p}', kr(b.due)) : '') : b.estimate != null ? kr(b.estimate) : '';
  return [[t.service, t[b.service]], [t.when, w.length > 6 ? [...w.slice(0, 6), `+ ${w.length - 6}`].join('\n') : w.join('\n')], [t.pets, pets],
    [t.address, b.address], [t.price, price],
    [t.pay, b.credits && !b.due ? '' : config.mobilepay ? t[confirmed ? 'payMpNow' : 'payMp'].replace('{n}', config.mobilepay) : t[confirmed ? 'payLaterNow' : 'payLater']],
    [t.meet, b.meet ? t.meetYes : ''], [t.notes, b.notes],
    ...(admin ? [['Phone', b.phone], ['Email', b.email]] : []), [t.ref, b.id]].filter((r) => r[1]);
}
function layout(head, intro, table, extra, lang) {
  const t = L[lang];
  const html = `<!doctype html><html><body style="margin:0;background:#e7ebf0;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d1d1f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e7ebf0;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:22px;padding:28px">
<tr><td><img src="${SITE}/img/brand/mark-emboss-round.png" width="56" height="56" alt="The DogMan" style="border-radius:50%;display:block"></td></tr>
<tr><td style="padding-top:16px"><h1 style="margin:0 0 8px;font-size:24px;letter-spacing:-.02em">${esc(head)}</h1><p style="margin:0 0 18px;line-height:1.5;color:#3a3a3f">${esc(intro)}</p></td></tr>
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:15px">
${table.map(([k, v]) => `<tr><td style="padding:8px 12px 8px 0;color:#62636a;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:8px 0;border-bottom:1px solid #eef0f3">${esc(v).replace(/\n/g, '<br>')}</td></tr>`).join('')}
</table></td></tr>${extra}
<tr><td style="padding-top:22px;font-size:13px;color:#62636a;line-height:1.5">${esc(t.cancelRule)}<br><a href="${SITE}/account/" style="color:#b44d08">${esc(t.mine)}</a> · <a href="${SITE}/vilkaar/" style="color:#b44d08">${esc(t.terms)}</a><br><br>${esc(t.sign).replace('\n', '<br>')}</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${head}\n\n${intro}\n\n${table.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${t.cancelRule}\n${t.mine}: ${SITE}/account/\n${t.terms}: ${SITE}/vilkaar/\n\n${t.sign}`;
  return { html, text };
}
const button = (href, label) => `<a href="${esc(href)}" style="display:inline-block;margin:4px 6px 4px 0;padding:11px 18px;border-radius:999px;background:#f07a1e;color:#1d1d1f;font-weight:600;text-decoration:none;font-size:14px">${esc(label)}</a>`;

// New booking: receipt for the customer, notice for the admin (always in Danish).
export async function mailNewBooking(b, config) {
  const lang = b.lang === 'en' ? 'en' : 'da', t = L[lang], jobs = [];
  if (b.email) {
    const { html, text } = layout(t.reqHead, t.reqText, rows(b, config, lang, false), '', lang);
    jobs.push(sendMail({ to: b.email, subject: t.reqSubject.replace('{s}', t[b.service]), html, text, replyTo: ADMIN }));
  }
  const d = L.da, first = whenLines(b, 'da')[0];
  const extra = `<tr><td style="padding-top:18px">${button(SITE + '/admin/', 'Åbn admin og bekræft')}</td></tr>`;
  const { html, text } = layout(`Ny booking: ${d[b.service]}`, `${b.name} · ${b.phone}${b.dates?.length > 1 ? ` · ${b.dates.length} ture` : ''}`, rows(b, config, 'da', true), extra, 'da');
  jobs.push(sendMail({ to: ADMIN, subject: `Ny booking: ${d[b.service]} ${first} – ${b.name}`, html, text, replyTo: b.email || undefined }));
  const res = await Promise.all(jobs);
  return res.some(Boolean);
}

// Confirmed by the admin: details, Google Calendar buttons and a .ics with reminders.
export async function mailConfirmed(b, config) {
  if (!b.email) return false;
  const lang = b.lang === 'en' ? 'en' : 'da', t = L[lang], evs = events(b);
  const links = b.plan === 'weekly' && b.weekdays?.length && evs.length > 1
    ? [button(googleLink(b, evs[0], lang, true), t.gcalAll)]
    : evs.slice(0, 6).map((e, i) => button(googleLink(b, e, lang), evs.length > 1 ? `${t.gcal} · ${whenLines(b, lang)[i]}` : t.gcal));
  const extra = `<tr><td style="padding-top:18px">${links.join('')}<p style="margin:10px 0 0;font-size:13px;color:#62636a">${esc(t.icsNote)}</p></td></tr>`;
  const { html, text } = layout(t.okHead, t.okText, rows(b, config, lang, false, true), extra, lang);
  return sendMail({ to: b.email, subject: t.okSubject.replace('{s}', t[b.service]).replace('{w}', whenLines(b, lang)[0]), html,
    text: text + `\n\n${t.gcal}: ${googleLink(b, evs[0], lang, b.plan === 'weekly' && evs.length > 1)}`, replyTo: ADMIN,
    attachments: [{ filename: 'dogman.ics', content: Buffer.from(icsFile(b, lang)).toString('base64') }] });
}
