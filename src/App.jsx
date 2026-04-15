import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import {
  NAVY, WEEKS_COUNT, DELAY_MS, STATUS_COLORS, PI_PROMPT
} from './constants.js'
import {
  buildWeeks, parseJSON, parseXLSX, slugify,
  scoreStyle, urgBadgeStyle, generateHTML, generateCSV
} from './utils.js'

const LS_FIRMS   = 'pi2_firms'
const LS_RESULTS = 'pi2_results'
const LS_WEEK    = 'pi2_week'
const LS_APIKEY  = 'pi2_apikey'

function saveLocal(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch (_) {}
}
function loadLocal(key) {
  try { return JSON.parse(localStorage.getItem(key)) } catch (_) { return null }
}

// ── Small reusable components ──────────────────────────────

function Badge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.COLD
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 10,
      background: s.bg, color: s.text, border: `1px solid ${s.border}`,
      fontWeight: 700, minWidth: 38, textAlign: 'center', display: 'inline-block',
    }}>{status}</span>
  )
}

function UrgBadge({ urgence }) {
  const s = urgBadgeStyle(urgence)
  return (
    <span style={{ ...s, fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>
      {(urgence || '').toUpperCase()}
    </span>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 56 }}>
      <div style={{ fontWeight: 800, fontSize: 22, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{label}</div>
    </div>
  )
}

// ── Upload screen ──────────────────────────────────────────

function UploadScreen({ onUpload }) {
  const ref = useRef()
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', background: '#f1f5f9',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '48px 56px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)', maxWidth: 480, width: '90%', textAlign: 'center',
      }}>
        <div style={{ color: NAVY, fontWeight: 800, fontSize: 28, marginBottom: 6 }}>Kogi PI 2.0</div>
        <div style={{ color: '#64748b', fontSize: 14, marginBottom: 36 }}>
          Batch Analyzer — Weekly Schedule
        </div>
        <div
          onClick={() => ref.current.click()}
          style={{
            border: '2px dashed #cbd5e1', borderRadius: 12, padding: '40px 24px',
            cursor: 'pointer', background: '#f8fafc', transition: 'border-color .2s',
          }}
          onMouseOver={e => e.currentTarget.style.borderColor = NAVY}
          onMouseOut={e => e.currentTarget.style.borderColor = '#cbd5e1'}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
          <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>
            Nahrát target list XLSX
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            Očekávané sloupce: ICO, Firma, Velikost, NACE,<br />
            Status, Kraj, PI_Vykonnost, PI_Fluktuace
          </div>
          <input ref={ref} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={onUpload} />
        </div>
        <div style={{ marginTop: 20, fontSize: 11, color: '#94a3b8' }}>
          Firmy jsou automaticky rozděleny do 6 týdnů.<br />
          HOT → WARM → NOVÝ → COLD, ~300 firem/týden.
        </div>
      </div>
    </div>
  )
}

// ── Firm row ───────────────────────────────────────────────

function FirmRow({ firm, result, isCurrent, onClick }) {
  const icon = !result ? '○'
    : result.status === 'done'  ? '✓'
    : result.status === 'error' ? '✗' : '⏳'

  const iconColor = !result ? '#cbd5e1'
    : result.status === 'done'  ? '#15803d'
    : result.status === 'error' ? '#dc2626' : '#3b82f6'

  return (
    <div
      onClick={() => result?.status === 'done' && onClick()}
      style={{
        padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: '1px solid #f1f5f9',
        background: isCurrent ? '#eff6ff' : '#fff',
        cursor: result?.status === 'done' ? 'pointer' : 'default',
        transition: 'background .15s',
      }}
      onMouseOver={e => { if (result?.status === 'done') e.currentTarget.style.background = '#f8fafc' }}
      onMouseOut={e => { e.currentTarget.style.background = isCurrent ? '#eff6ff' : '#fff' }}
    >
      <span style={{ color: iconColor, fontSize: 14, minWidth: 16 }}>{icon}</span>
      <Badge status={firm.status} />
      <span style={{
        flex: 1, fontSize: 12,
        fontWeight: result?.data?.oslovit ? 600 : 400,
        color: !result ? '#94a3b8' : '#1e293b',
      }}>
        {firm.firma}
      </span>
      {result?.status === 'done' && (
        <>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700,
            background: result.data.oslovit ? '#dcfce7' : '#f1f5f9',
            color: result.data.oslovit ? '#166534' : '#64748b',
          }}>
            {result.data.oslovit ? 'OSLOVIT' : 'skip'}
          </span>
          {result.data.oslovit && (
            <>
              <span style={{ fontSize: 10, color: '#64748b', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {result.data.tema}
              </span>
              <UrgBadge urgence={result.data.urgence} />
            </>
          )}
          <span style={{ fontSize: 10, color: '#cbd5e1' }}>▾</span>
        </>
      )}
      {result?.status === 'error' && (
        <span style={{ fontSize: 10, color: '#dc2626' }}>chyba — retry?</span>
      )}
    </div>
  )
}

// ── Detail panel ───────────────────────────────────────────

function FirmDetail({ firm, result, onClose }) {
  if (!result?.data) return null
  const r = result.data
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 14, padding: 32, maxWidth: 680,
          width: '90vw', maxHeight: '85vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: NAVY }}>{firm.firma}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{firm.nace} · {firm.kraj}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
        </div>

        <div style={{
          background: r.oslovit ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${r.oslovit ? '#86efac' : '#fca5a5'}`,
          borderRadius: 8, padding: '12px 16px', marginBottom: 20,
        }}>
          <div style={{ fontWeight: 700, color: r.oslovit ? '#166534' : '#991b1b', fontSize: 14 }}>
            OSLOVIT: {r.oslovit ? 'ANO' : 'NE'} · {r.tema || '—'} · {(r.urgence || '').toUpperCase()}
          </div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>{r.zduvodneni}</div>
        </div>

        <SectionTitle>Draft emailu</SectionTitle>
        <div style={{
          background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
          padding: 16, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.7,
          whiteSpace: 'pre-wrap', marginBottom: 20, color: '#1e293b',
        }}>
          {`Předmět: ${r.email_predmet}\n\n${r.email_telo}\n\n[Jméno konzultanta]`}
        </div>

        <SectionTitle>ByzDev Topics</SectionTitle>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20, fontSize: 12 }}>
          <thead>
            <tr style={{ background: NAVY, color: '#fff' }}>
              <th style={{ padding: '6px 10px', textAlign: 'left' }}>Topic</th>
              <th style={{ padding: '6px 10px', textAlign: 'center', width: 60 }}>Skóre</th>
              <th style={{ padding: '6px 10px', textAlign: 'left' }}>Signál</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['AI Team Adoption', r.score_ai_team, r.signal_ai_team],
              ['AI Sales Boost', r.score_sales, r.signal_sales],
              ['Výkonnost v transformaci', r.score_vykonnost, r.signal_vykonnost],
              ['Fluktuace a onboarding', r.score_fluktuace, r.signal_fluktuace],
            ].map(([label, score, signal]) => (
              <tr key={label} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '5px 10px' }}>{label}</td>
                <td style={{ padding: '5px 10px', textAlign: 'center', ...scoreStyle(score) }}>{score}/5</td>
                <td style={{ padding: '5px 10px', color: '#64748b' }}>{signal}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <SectionTitle>Moment scoring</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 16 }}>
          {[
            ['Nové vedení', r.moment_vedeni],
            ['Hiring spike', r.moment_hiring],
            ['Pokles výkonu', r.moment_vykon],
            ['Restrukturalizace / M&A', r.moment_restrukturalizace],
            ['AI / digital investice', r.moment_ai],
            ['Změna v sales', r.moment_sales_zmena],
          ].map(([label, val]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ color: val ? '#15803d' : '#cbd5e1', fontWeight: 700, fontSize: 14 }}>
                {val ? '✓' : '○'}
              </span>
              <span style={{ color: val ? '#1e293b' : '#94a3b8' }}>{label}</span>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.zdroje}</div>
      </div>
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontWeight: 700, fontSize: 12, color: NAVY,
      borderBottom: `1px solid ${NAVY}`, paddingBottom: 4, marginBottom: 10,
    }}>{children}</div>
  )
}

// ── Main App ───────────────────────────────────────────────

export default function App() {
  const [firms, setFirms] = useState([])
  const [weeks, setWeeks] = useState([])
  const [selWeek, setSelWeek] = useState(0)
  const [results, setResults] = useState({})
  const [processing, setProcessing] = useState(false)
  const [currentFirma, setCurrentFirma] = useState(null)
  const [logs, setLogs] = useState([])
  const [detail, setDetail] = useState(null)
  const [apiKey, setApiKey] = useState('')
  const [showKeyInput, setShowKeyInput] = useState(false)
  const abortRef = useRef(false)
  const resultsRef = useRef({})

  // Load from localStorage on mount
  useEffect(() => {
    const f = loadLocal(LS_FIRMS)
    if (f) { setFirms(f); setWeeks(buildWeeks(f)) }
    const r = loadLocal(LS_RESULTS) || {}
    setResults(r); resultsRef.current = r
    const w = loadLocal(LS_WEEK)
    if (w !== null) setSelWeek(w)
    const k = localStorage.getItem(LS_APIKEY) || ''
    setApiKey(k)
  }, [])

  function addLog(msg) {
    const line = `${new Date().toLocaleTimeString('cs-CZ')} — ${msg}`
    setLogs(l => [line, ...l].slice(0, 100))
  }

  async function handleUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf)
    const parsed = parseXLSX(wb, XLSX)
    setFirms(parsed)
    const w = buildWeeks(parsed)
    setWeeks(w)
    saveLocal(LS_FIRMS, parsed)
    addLog(`Načteno ${parsed.length} firem.`)
  }

  function updateResults(ico, entry) {
    const merged = { ...resultsRef.current, [ico]: entry }
    resultsRef.current = merged
    setResults({ ...merged })
    saveLocal(LS_RESULTS, merged)
  }

  async function analyzeOne(firm) {
    const key = apiKey || localStorage.getItem(LS_APIKEY)
    if (!key) throw new Error('Chybí API klíč — zadej ho v nastavení')

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: PI_PROMPT,
        messages: [{
          role: 'user',
          content: `Analyzuj firmu: ${firm.firma}, IČO: ${firm.ico}, Obor: ${firm.nace}, Kraj: ${firm.kraj}, Velikost: ${firm.velikost}. PI 1.0: Výkonnost ${firm.vykonnost}/5, Fluktuace ${firm.fluktuace}/5.`,
        }],
      }),
    })

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error(`HTTP ${resp.status}: ${err?.error?.message || ''}`)
    }

    const data = await resp.json()
    if (data.error) throw new Error(data.error.message || data.error)
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
    return parseJSON(text)
  }

  async function startProcessing() {
    if (!weeks[selWeek] || processing) return
    abortRef.current = false
    setProcessing(true)
    const weekFirms = weeks[selWeek]
    const pending = weekFirms.filter(f => {
      const r = resultsRef.current[f.ico]
      return !r || r.status === 'error'
    })
    addLog(`▶ Týden ${selWeek + 1} — ${pending.length} firem ke zpracování.`)

    for (const firm of pending) {
      if (abortRef.current) { addLog('⏸ Přerušeno.'); break }
      setCurrentFirma(firm.firma)
      addLog(`⏳ ${firm.firma}…`)

      let success = false
      let lastErr = null
      const retryDelays = [30000, 60000]

      for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
        try {
          const data = await analyzeOne(firm)
          updateResults(firm.ico, { status: 'done', data, ts: Date.now() })
          addLog(`✓ ${firm.firma} — ${data.oslovit ? `OSLOVIT | ${data.tema} | ${data.urgence?.toUpperCase()}` : 'přeskočit'}`)
          success = true
          break
        } catch (err) {
          lastErr = err
          if (err.message.includes('429') && attempt < retryDelays.length) {
            const wait = retryDelays[attempt]
            addLog(`⏳ Rate limit — čekám ${wait / 1000}s…`)
            await new Promise(r => setTimeout(r, wait))
          } else {
            break
          }
        }
      }

      if (!success) {
        updateResults(firm.ico, { status: 'error', error: lastErr?.message, ts: Date.now() })
        addLog(`✗ ${firm.firma} — ${lastErr?.message}`)
      }

      if (!abortRef.current) await new Promise(r => setTimeout(r, DELAY_MS))
    }

    setProcessing(false)
    setCurrentFirma(null)
    addLog(`✓ Týden ${selWeek + 1} dokončen.`)
  }

  async function downloadZIP() {
    const weekFirms = weeks[selWeek] || []
    const zip = new JSZip()
    zip.file('summary.csv', generateCSV(weekFirms, results))
    weekFirms.filter(f => results[f.ico]?.status === 'done' && results[f.ico]?.data?.oslovit).forEach(f => {
      zip.file(`${slugify(f.firma)}_${f.ico}.html`, generateHTML(f, results[f.ico].data))
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `PI_2_0_Tyden${selWeek + 1}_${new Date().toISOString().slice(0, 10)}.zip`
    a.click()
    URL.revokeObjectURL(url)
  }

  function resetWeek() {
    if (!confirm(`Smazat výsledky týdne ${selWeek + 1}?`)) return
    const weekFirms = weeks[selWeek] || []
    const merged = { ...resultsRef.current }
    weekFirms.forEach(f => delete merged[f.ico])
    resultsRef.current = merged
    setResults({ ...merged })
    saveLocal(LS_RESULTS, merged)
    addLog(`Reset týdne ${selWeek + 1}.`)
  }

  if (!firms.length) return <UploadScreen onUpload={handleUpload} />

  const weekFirms = weeks[selWeek] || []
  const done    = weekFirms.filter(f => results[f.ico]?.status === 'done').length
  const errors  = weekFirms.filter(f => results[f.ico]?.status === 'error').length
  const pending = weekFirms.length - done - errors
  const toOsl   = weekFirms.filter(f => results[f.ico]?.data?.oslovit).length
  const pct     = weekFirms.length ? Math.round(done / weekFirms.length * 100) : 0

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f1f5f9' }}>

      {/* Header */}
      <div style={{ background: NAVY, color: '#fff', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <span style={{ fontWeight: 800, fontSize: 17 }}>Kogi PI 2.0</span>
          <span style={{ opacity: 0.55, marginLeft: 12, fontSize: 12 }}>
            Batch Analyzer · {firms.length} firem · {WEEKS_COUNT} týdnů
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {showKeyInput ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="password"
                placeholder="sk-ant-..."
                defaultValue={apiKey}
                onBlur={e => {
                  const val = e.target.value.trim()
                  setApiKey(val)
                  localStorage.setItem(LS_APIKEY, val)
                  setShowKeyInput(false)
                  addLog(val ? '✓ API klíč uložen.' : 'API klíč odstraněn.')
                }}
                autoFocus
                style={{ padding: '5px 10px', borderRadius: 6, border: 'none', fontSize: 12, width: 280, background: 'rgba(255,255,255,0.15)', color: '#fff', outline: 'none' }}
              />
              <button onClick={() => setShowKeyInput(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
          ) : (
            <button onClick={() => setShowKeyInput(true)} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
              {apiKey ? '🔑 API klíč ✓' : '🔑 Zadat API klíč'}
            </button>
          )}
          <label style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '6px 14px', borderRadius: 7, fontSize: 12 }}>
            Změnit XLSX
            <input type="file" accept=".xlsx,.xls" onChange={handleUpload} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      {/* Week tabs */}
      <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 24px', flexShrink: 0, overflowX: 'auto' }}>
        {weeks.map((w, i) => {
          const wDone = w.filter(f => results[f.ico]?.status === 'done').length
          const pctW  = w.length ? Math.round(wDone / w.length * 100) : 0
          const active = i === selWeek
          return (
            <button key={i}
              onClick={() => { setSelWeek(i); saveLocal(LS_WEEK, i) }}
              style={{
                padding: '11px 18px', border: 'none',
                borderBottom: active ? `3px solid ${NAVY}` : '3px solid transparent',
                background: 'none', cursor: 'pointer',
                fontWeight: active ? 700 : 400,
                color: active ? NAVY : '#64748b', fontSize: 13, whiteSpace: 'nowrap',
              }}
            >
              Týden {i + 1}
              <span style={{
                marginLeft: 7, fontSize: 10,
                background: pctW === 100 ? '#dcfce7' : active ? '#e0e7ff' : '#f1f5f9',
                color: pctW === 100 ? '#166534' : active ? '#3730a3' : '#64748b',
                padding: '1px 7px', borderRadius: 10,
              }}>
                {wDone}/{w.length}
              </span>
            </button>
          )
        })}
      </div>

      {/* Stats + controls */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #e2e8f0',
        padding: '14px 24px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0,
      }}>
        <StatCard label="Celkem"     value={weekFirms.length} color="#64748b" />
        <StatCard label="Hotovo"     value={done}             color="#15803d" />
        <StatCard label="K oslovení" value={toOsl}            color="#1d4ed8" />
        <StatCard label="Chyba"      value={errors}           color="#dc2626" />
        <StatCard label="Čeká"       value={pending}          color="#92400e" />

        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={{ height: 7, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: NAVY, borderRadius: 4, transition: 'width .5s' }} />
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{pct}% hotovo</div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {!processing ? (
            <button onClick={startProcessing} disabled={!pending && !errors || !apiKey} style={{
              background: NAVY, color: '#fff', border: 'none',
              padding: '9px 20px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
              opacity: ((!pending && !errors) || !apiKey) ? 0.5 : 1,
            }}>
              {!apiKey ? '🔑 Zadej API klíč' : done === 0 ? '▶ Spustit analýzu' : '▶ Pokračovat'}
            </button>
          ) : (
            <button onClick={() => { abortRef.current = true }} style={{
              background: '#dc2626', color: '#fff', border: 'none',
              padding: '9px 20px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}>
              ⏸ Pozastavit
            </button>
          )}
          {done > 0 && (
            <button onClick={downloadZIP} style={{
              background: '#15803d', color: '#fff', border: 'none',
              padding: '9px 20px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}>
              ↓ ZIP ({done})
            </button>
          )}
          {done > 0 && (
            <button onClick={resetWeek} style={{
              background: '#fff', color: '#dc2626',
              border: '1px solid #fca5a5', padding: '9px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
            }}>
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Processing banner */}
      {processing && currentFirma && (
        <div style={{ background: '#eff6ff', borderBottom: '1px solid #bfdbfe', padding: '8px 24px', fontSize: 12, color: '#1e40af', flexShrink: 0 }}>
          ⏳ Analyzuji: <strong>{currentFirma}</strong>
        </div>
      )}

      {/* Content: list + log */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* Firm list */}
        <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>
          {weekFirms.map(firm => (
            <FirmRow
              key={firm.ico}
              firm={firm}
              result={results[firm.ico]}
              isCurrent={currentFirma === firm.firma}
              onClick={() => setDetail(firm.ico)}
            />
          ))}
        </div>

        {/* Log panel */}
        <div style={{ width: 280, borderLeft: '1px solid #e2e8f0', background: '#0f172a', padding: '12px 14px', overflowY: 'auto', flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: '#475569', fontWeight: 700, marginBottom: 8, letterSpacing: 1 }}>LOG</div>
          {logs.map((l, i) => (
            <div key={i} style={{
              fontSize: 10, marginBottom: 5, lineHeight: 1.5,
              color: l.includes('✓') ? '#4ade80' : l.includes('✗') ? '#f87171' : '#94a3b8',
            }}>
              {l}
            </div>
          ))}
          {!logs.length && <div style={{ fontSize: 10, color: '#334155' }}>Čeká na spuštění…</div>}
        </div>
      </div>

      {/* Detail modal */}
      {detail && (
        <FirmDetail
          firm={weekFirms.find(f => f.ico === detail)}
          result={results[detail]}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  )
}
