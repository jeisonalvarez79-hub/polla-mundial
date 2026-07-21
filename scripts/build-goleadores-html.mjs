import fs from 'node:fs'

const [, , inputPath, outputPath] = process.argv
const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'))

function esc(s) {
  if (s === null || s === undefined) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function fmtDate(iso) {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota' })
}

const STATUS_LABEL = {
  'corregido': 'Corregido 2026-07-20',
  'ya-exacto': 'Ya era exacto',
  'exacto-otro': 'Coincide (otro jugador)',
  'sin-cambio': 'Sin cambios',
  'sin-pronostico': 'Sin pronóstico',
}

function rows(list) {
  return list.map(p => {
    const cls = p.hit ? 'hit' : (p.status === 'sin-pronostico' ? 'empty' : 'miss')
    const badge = p.status === 'corregido' ? '<span class="badge badge-fixed">Corregido</span>' : ''
    return `<tr class="${cls}">
      <td>${esc(p.name)}</td>
      <td>${esc(p.goleador) || '<span class="muted">(sin pronóstico)</span>'} ${badge}</td>
      <td class="center">${p.hit ? '✓' : (p.status === 'sin-pronostico' ? '—' : '✗')}</td>
    </tr>`
  }).join('')
}

const pollas = [...new Set(data.list.map(p => p.polla))]
const sections = pollas.map(polla => {
  const list = data.list.filter(p => p.polla === polla)
  const hits = list.filter(p => p.hit).length
  return `
  <section class="polla-block">
    <h2>${esc(polla)} <span class="count">${list.length} participantes · ${hits} con goleador acertado (+10 pts c/u)</span></h2>
    <table class="tbl">
      <thead><tr><th>Participante</th><th>Goleador pronosticado</th><th>Acierto</th></tr></thead>
      <tbody>${rows(list)}</tbody>
    </table>
  </section>`
}).join('\n')

const totalHits = data.list.filter(p => p.hit).length
const totalFixed = data.list.filter(p => p.status === 'corregido').length

const html = `<title>Listado Goleador Pronosticado — Validación</title>
<meta name="description" content="Participante / Goleador pronosticado, con marca de los 30 registros corregidos el 2026-07-20." />
<style>
:root {
  color-scheme: light dark;
  --paper: #f4f6f0; --paper-raised: #ffffff; --ink: #17231a; --ink-soft: #4b594c;
  --line: #ccd4c3; --line-soft: #dfe5d7; --pitch: #2f6b4d; --pitch-ink: #ffffff;
  --gold: #a8792a; --gold-soft: rgba(184, 134, 47, 0.14);
  --brick: #a84632; --brick-soft: rgba(184, 78, 58, 0.10);
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #10160f; --paper-raised: #161d14; --ink: #e9ede4; --ink-soft: #a9b6a4;
    --line: #2b3a2a; --line-soft: #21301f; --pitch: #5ea37c; --pitch-ink: #0b120a;
    --gold: #d9a94a; --gold-soft: rgba(217, 169, 74, 0.14);
    --brick: #d97e63; --brick-soft: rgba(217, 126, 99, 0.12);
  }
}
:root[data-theme="dark"] {
  --paper: #10160f; --paper-raised: #161d14; --ink: #e9ede4; --ink-soft: #a9b6a4;
  --line: #2b3a2a; --line-soft: #21301f; --pitch: #5ea37c; --pitch-ink: #0b120a;
  --gold: #d9a94a; --gold-soft: rgba(217, 169, 74, 0.14);
  --brick: #d97e63; --brick-soft: rgba(217, 126, 99, 0.12);
}
:root[data-theme="light"] {
  --paper: #f4f6f0; --paper-raised: #ffffff; --ink: #17231a; --ink-soft: #4b594c;
  --line: #ccd4c3; --line-soft: #dfe5d7; --pitch: #2f6b4d; --pitch-ink: #ffffff;
  --gold: #a8792a; --gold-soft: rgba(184, 134, 47, 0.14);
  --brick: #a84632; --brick-soft: rgba(184, 78, 58, 0.10);
}
* { box-sizing: border-box; }
body {
  font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  background: var(--paper); color: var(--ink); line-height: 1.5;
  max-width: 860px; margin: 0 auto; padding: 40px 24px 80px;
}
h1 { font-family: Charter, Georgia, ui-serif, serif; font-size: 1.7rem; font-weight: 600; margin: 0 0 6px; text-wrap: balance; }
.subtitle { color: var(--ink-soft); margin: 0 0 20px; max-width: 65ch; }
.summary {
  display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 28px;
}
.summary .stat {
  background: var(--paper-raised); border: 1px solid var(--line); border-radius: 10px;
  padding: 10px 16px; font-size: 0.85rem; color: var(--ink-soft);
}
.summary .stat b {
  display: block; font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 1.3rem; color: var(--ink); font-variant-numeric: tabular-nums;
}
h2 {
  font-family: Charter, Georgia, ui-serif, serif; font-size: 1.2rem; font-weight: 600;
  border-bottom: 2px solid var(--pitch); color: var(--pitch); padding-bottom: 8px;
  margin: 40px 0 12px; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
}
h2 .count { font-family: -apple-system, sans-serif; font-size: 0.78rem; font-weight: 500; color: var(--ink-soft); }
table.tbl { border-collapse: collapse; width: 100%; font-size: 0.92rem; }
table.tbl th, table.tbl td { border: 1px solid var(--line-soft); padding: 7px 10px; text-align: left; }
table.tbl th { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--ink-soft); border-bottom: 1.5px solid var(--line); }
table.tbl td.center { text-align: center; }
tr.hit td:first-child { box-shadow: inset 3px 0 0 var(--pitch); }
tr.hit { background: color-mix(in srgb, var(--pitch) 7%, transparent); }
tr.miss td:first-child { box-shadow: inset 3px 0 0 var(--brick); }
tr.miss { background: var(--brick-soft); }
tr.empty { color: var(--ink-soft); font-style: italic; }
.badge { font-size: 0.68rem; font-weight: 600; letter-spacing: 0.02em; padding: 2px 7px; border-radius: 999px; margin-left: 6px; }
.badge-fixed { background: var(--gold-soft); color: var(--gold); }
.muted { color: var(--ink-soft); font-style: italic; }
.legend { font-size: 0.82rem; color: var(--ink-soft); margin-bottom: 4px; }
footer.note { color: var(--ink-soft); font-style: italic; margin-top: 40px; padding-top: 18px; border-top: 1px solid var(--line); font-size: 0.88rem; }
</style>

<h1>Listado Goleador Pronosticado — Validación</h1>
<p class="subtitle">Generado ${esc(fmtDate(data.generatedAt))} (hora Colombia) · Goleador real: <strong>${esc(data.topScorers.join(', '))}</strong> · Participante / Goleador pronosticado por cada uno, para validar la normalización aplicada el 2026-07-20.</p>

<div class="summary">
  <div class="stat"><b>${data.list.length}</b>Participantes</div>
  <div class="stat"><b>${totalHits}</b>Acertaron goleador (+10 pts)</div>
  <div class="stat"><b>${totalFixed}</b>Corregidos el 2026-07-20</div>
</div>

<p class="legend">Fila verde = acertó (cuenta +10 pts) · Fila roja = no acertó · <span class="badge badge-fixed">Corregido</span> = su registro se normalizó a "Kylian Mbappé" en esta sesión.</p>

${sections}

<footer class="note">Fin del listado. Los 41 aciertos de "Kylian Mbappé" ya están reflejados en la base de datos (11 que ya venían exactos + 30 normalizados). Cualquier otro nombre no listado como variante válida (ej. "kanw") quedó sin tocar.</footer>
`

fs.writeFileSync(outputPath, html, 'utf8')
console.log('OK ->', outputPath)
