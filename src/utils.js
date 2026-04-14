import { WEEKS_COUNT, FIRMS_PER_WEEK } from './constants.js'

export function buildWeeks(firms) {
  const order = ['HOT', 'WARM', 'NOVÝ', 'COLD']
  const sorted = [...firms].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))
  const perWeek = Math.ceil(sorted.length / WEEKS_COUNT)
  return Array.from({ length: WEEKS_COUNT }, (_, i) =>
    sorted.slice(i * perWeek, (i + 1) * perWeek)
  )
}

export function parseJSON(text) {
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  try { return JSON.parse(clean) } catch (_) {}
  const m = clean.match(/\{[\s\S]*\}/)
  if (m) try { return JSON.parse(m[0]) } catch (_) {}
  throw new Error('Nepodařilo se parsovat JSON výstup')
}

export function parseXLSX(wb, XLSX) {
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws)
  return rows.map(r => ({
    ico:       String(r.ICO       || r.ico       || ''),
    firma:     String(r.Firma     || r.firma     || ''),
    velikost:  String(r.Velikost  || ''),
    nace:      String(r.NACE      || ''),
    status:    String(r.Status    || 'COLD'),
    kraj:      String(r.Kraj      || ''),
    vykonnost: parseInt(r.PI_Vykonnost || 0),
    fluktuace: parseInt(r.PI_Fluktuace || 0),
  })).filter(r => r.ico && r.firma)
}

export function slugify(s) {
  return s.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 35)
}

export function scoreStyle(v) {
  if (v >= 4) return { color: '#15803d', fontWeight: 700 }
  if (v >= 3) return { color: '#c2410c', fontWeight: 700 }
  return { color: '#94a3b8' }
}

export function urgBadgeStyle(urgence) {
  if (urgence === 'high')   return { background: '#fee2e2', color: '#991b1b' }
  if (urgence === 'medium') return { background: '#fff7ed', color: '#9a3412' }
  return { background: '#f1f5f9', color: '#64748b' }
}

export function generateHTML(firm, r) {
  const urg   = r.urgence === 'high' ? '#b91c1c' : r.urgence === 'medium' ? '#c2410c' : '#475569'
  const sc    = v => v >= 4 ? 'color:#15803d;font-weight:bold' : v >= 3 ? 'color:#c2410c;font-weight:bold' : 'color:#94a3b8'
  const yn    = v => v ? '<span style="color:#15803d;font-weight:bold">ANO</span>' : '<span style="color:#94a3b8">NE</span>'
  const date  = new Date().toLocaleDateString('cs-CZ', { month: '2-digit', year: 'numeric' })

  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8">
<title>PI 2.0 — ${firm.firma}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:12px;margin:24px 40px;color:#1a1a1a;max-width:900px}
  h1{font-size:22px;color:#2E4057;margin:4px 0 14px}
  .meta{color:#888;font-size:10px;margin-bottom:14px}
  .banner{background:${r.oslovit ? '#f0fdf4' : '#fef2f2'};border:1px solid ${r.oslovit ? '#86efac' : '#fca5a5'};border-radius:6px;padding:12px 16px;margin-bottom:14px}
  .bt{font-size:13px;font-weight:bold;color:${r.oslovit ? '#166534' : '#991b1b'}}
  .bs{color:#555;margin-top:4px;font-size:11px}
  .sh{font-size:12px;font-weight:bold;color:#2E4057;margin:14px 0 5px;border-bottom:1px solid #2E4057;padding-bottom:2px}
  table{width:100%;border-collapse:collapse;margin-bottom:10px}
  td,th{border:1px solid #ddd;padding:5px 9px;font-size:11px;vertical-align:top}
  th{background:#2E4057;color:#fff;font-weight:bold}
  .lbl{background:#f4f4f5;font-weight:bold;width:22%}
  .eb{background:#f8f8f8;border:1px solid #e2e8f0;border-radius:4px;padding:14px;font-family:'Courier New',monospace;font-size:11px;line-height:1.7;white-space:pre-wrap}
  .ft{color:#aaa;font-size:10px;margin-top:20px;border-top:1px solid #eee;padding-top:6px}
  @media print{.eb{font-size:10px}}
</style>
</head>
<body>
<div class="meta">Kogi PI 2.0 | Prompt v3 | Datum: ${date} | IČO: ${firm.ico}</div>
<h1>${firm.firma}</h1>
<div class="banner">
  <div class="bt">OSLOVIT: ${r.oslovit ? 'ANO' : 'NE'} | Téma: ${r.tema || '—'} | Urgence: <span style="color:${urg}">${(r.urgence || '').toUpperCase()}</span></div>
  <div class="bs">${firm.nace} | ${firm.kraj} | ${firm.velikost}</div>
  <div class="bs" style="margin-top:6px">${r.zduvodneni || ''}</div>
</div>

<div class="sh">Outreach email</div>
<table>
  <tr><td class="lbl">Hook</td><td>${r.hook || ''}</td></tr>
  <tr><td class="lbl">Nabídka</td><td>${r.nabidka || ''}</td></tr>
  <tr><td class="lbl">Koho oslovit</td><td>${r.koho_oslovit || ''}</td></tr>
  <tr><td class="lbl">Proč právě teď</td><td>${r.proc_prave_ted || ''}</td></tr>
  <tr><td class="lbl">Credibility</td><td>${r.credibility || ''}</td></tr>
</table>

<div class="sh">Draft emailu — připraveno k odeslání</div>
<div class="eb">Předmět: ${r.email_predmet || ''}

${r.email_telo || ''}

[Jméno konzultanta]</div>

<div class="sh">ByzDev Topics</div>
<table>
  <tr><th>Topic</th><th>Skóre</th><th>Signál</th></tr>
  <tr><td>AI Team Adoption</td><td style="${sc(r.score_ai_team)}">${r.score_ai_team || 0}/5</td><td>${r.signal_ai_team || ''}</td></tr>
  <tr><td>AI Sales Boost</td><td style="${sc(r.score_sales)}">${r.score_sales || 0}/5</td><td>${r.signal_sales || ''}</td></tr>
  <tr><td>Výkonnost v transformaci</td><td style="${sc(r.score_vykonnost)}">${r.score_vykonnost || 0}/5</td><td>${r.signal_vykonnost || ''}</td></tr>
  <tr><td>Fluktuace a onboarding</td><td style="${sc(r.score_fluktuace)}">${r.score_fluktuace || 0}/5</td><td>${r.signal_fluktuace || ''}</td></tr>
</table>

<div class="sh">Moment scoring</div>
<table>
  <tr><th>Signál</th><th>Status</th></tr>
  <tr><td>Nové vedení</td><td>${yn(r.moment_vedeni)}</td></tr>
  <tr><td>Hiring spike</td><td>${yn(r.moment_hiring)}</td></tr>
  <tr><td>Pokles výkonu</td><td>${yn(r.moment_vykon)}</td></tr>
  <tr><td>Restrukturalizace / M&A</td><td>${yn(r.moment_restrukturalizace)}</td></tr>
  <tr><td>AI / digital investice</td><td>${yn(r.moment_ai)}</td></tr>
  <tr><td>Změna v sales</td><td>${yn(r.moment_sales_zmena)}</td></tr>
</table>

<div style="color:#94a3b8;font-size:11px;margin-top:6px">${r.zdroje || ''}</div>
<div class="ft">Kogi PI 2.0 | Prompt v3 | Claude AI deep search | Pravidlo čerstvosti: max 12 měsíců | PI outreach = 1 email</div>
</body></html>`
}

export function generateCSV(firms, results) {
  const header = 'Firma,IČO,PI Status,Oslovit,Téma,Urgence,Koho oslovit,Předmět emailu\n'
  const rows = firms
    .filter(f => results[f.ico]?.status === 'done')
    .map(f => {
      const r = results[f.ico].data
      return `"${f.firma}","${f.ico}","${f.status}","${r.oslovit ? 'ANO' : 'NE'}","${r.tema || ''}","${r.urgence || ''}","${r.koho_oslovit || ''}","${r.email_predmet || ''}"`
    })
    .join('\n')
  return header + rows
}
