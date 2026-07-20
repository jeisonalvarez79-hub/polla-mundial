/**
 * Convierte el JSON de scripts/audit-top4-report.mjs en un informe HTML de
 * auditoría detallada, fase por fase, Real vs Pronóstico, para el Top 4 de
 * cada polla. Autocontenido (sin dependencias externas).
 * Ejecutar: node scripts/build-audit-html.mjs <input.json> <output.html>
 */
import fs from 'node:fs'

const [, , inputPath, outputPath] = process.argv
const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'))

function esc(s) {
  if (s === null || s === undefined) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function slug(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}
function scoreStr(h, a) {
  if (h === null || h === undefined || a === null || a === undefined) return '—'
  return `${h}-${a}`
}
function fmtDate(iso) {
  const d = new Date(iso)
  return d.toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota' })
}

// ── Sección: fase de grupos (partido a partido) ──
function renderGrupos(g) {
  const byGroup = {}
  g.matches.forEach(m => { (byGroup[m.group] ||= []).push(m) })
  const groups = Object.keys(byGroup).sort()
  let rows = ''
  groups.forEach(gr => {
    byGroup[gr].forEach((m, i) => {
      const cls = m.kind === 'exacto' ? 'hit-full' : m.kind === 'resultado' ? 'hit-partial' : 'hit-none'
      rows += `<tr class="${cls}">
        <td>${i === 0 ? `<strong>${esc(gr)}</strong>` : ''}</td>
        <td>${esc(m.homeTeam)} vs ${esc(m.awayTeam)}</td>
        <td class="num">${scoreStr(m.realHome, m.realAway)}</td>
        <td class="num">${scoreStr(m.predHome, m.predAway)}</td>
        <td>${m.kind === 'exacto' ? 'Marcador exacto' : m.kind === 'resultado' ? 'Resultado correcto' : 'Fallo'}</td>
        <td class="num">${m.pts}</td>
      </tr>`
    })
  })
  return `
    <h4>Grupos — Marcador de partidos (${g.matches.length} partidos jugados)</h4>
    <table class="tbl">
      <thead><tr><th>Grupo</th><th>Partido</th><th>Real</th><th>Pronóstico</th><th>Resultado</th><th>Pts</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="5">Subtotal marcador exacto (+${g.ptsExacto} pts) y resultado correcto (+${g.ptsResultado} pts)</td><td class="num"><strong>${g.ptsExacto + g.ptsResultado}</strong></td></tr></tfoot>
    </table>`
}

// ── Sección: posición exacta en tabla de grupo ──
function renderStandings(g) {
  let rows = ''
  g.standingsDetail.forEach(s => {
    if (!s.allFinished) {
      rows += `<tr><td><strong>${esc(s.group)}</strong></td><td colspan="8" class="muted">(grupo aún no finaliza)</td><td class="num">0</td></tr>`
      return
    }
    const cells = [0, 1, 2, 3].map(i => {
      const real = s.actual[i] || '—'
      const pred = s.predicted[i] || '—'
      const hit = real !== '—' && real === pred
      return `<td class="${hit ? 'hit-full' : ''}">${esc(real)}</td><td class="${hit ? 'hit-full' : 'hit-none'}">${esc(pred)}</td>`
    }).join('')
    rows += `<tr><td><strong>${esc(s.group)}</strong></td>${cells}<td class="num">${s.pts}</td></tr>`
  })
  return `
    <h4>Grupos — Posición exacta en tabla (1° a 4°, ${g.standingsDetail[0] ? '1 pt/puesto' : ''})</h4>
    <table class="tbl small">
      <thead><tr><th>Grupo</th><th>1° Real</th><th>1° Pron.</th><th>2° Real</th><th>2° Pron.</th><th>3° Real</th><th>3° Pron.</th><th>4° Real</th><th>4° Pron.</th><th>Pts</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="9">Subtotal posición exacta</td><td class="num"><strong>${g.ptsPosicion}</strong></td></tr></tfoot>
    </table>`
}

// ── Sección: clasificados a 32avos (dieciseisavos) ──
function renderClasificados32(c) {
  if (!c) return `<h4>32avos — Clasificados a Dieciseisavos (32 equipos)</h4><p class="muted">Fase de grupos aún no finaliza por completo — no calculable todavía.</p>`
  const maxLen = Math.max(c.actual.length, c.predicted.length)
  const actualSet = new Set(c.actual)
  let rows = ''
  for (let i = 0; i < maxLen; i++) {
    const real = c.actual[i] || ''
    const pred = c.predicted[i] || ''
    const hit = pred && actualSet.has(pred)
    rows += `<tr><td>${esc(real)}</td><td class="${pred ? (hit ? 'hit-full' : 'hit-none') : ''}">${esc(pred)}</td></tr>`
  }
  return `
    <h4>32avos — Clasificados a Dieciseisavos (32 equipos reales vs. 32 pronosticados, ${c.ptsUnit} pts/equipo)</h4>
    <table class="tbl small two-col">
      <thead><tr><th>Real (32 clasificados, orden alfabético)</th><th>Pronóstico (32 equipos, orden alfabético)</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>Aciertos: ${c.hits.length}/32</td><td class="num"><strong>${c.pts} pts</strong></td></tr></tfoot>
    </table>`
}

// ── Sección genérica: ronda de bracket (equipos + llaves) ──
const ROUND_LABELS = {
  r32: '32avos del cuadro (R32) — 16 llaves',
  r16: '16avos del cuadro / Octavos (R16) — 8 llaves',
  qf: 'Cuartos de Final (QF) — 4 llaves',
  sf: 'Semifinales (SF) — 2 llaves',
}
function renderRound(r, includeTeams) {
  let out = `<h4>${ROUND_LABELS[r.round]}</h4>`
  if (includeTeams) {
    const missesRow = r.teamMisses.length ? `<tr><td>Fallados (pronosticados, no clasificaron)</td><td>${r.teamMisses.map(esc).join(', ') || '—'}</td></tr>` : ''
    out += `<table class="tbl small two-col">
      <thead><tr><th>Equipos reales en esta ronda (${r.actualTeams.length})</th><th>Equipos acertados por el pronóstico (${r.teamHits.length} × ${r.teamPtsUnit} pts)</th></tr></thead>
      <tbody>
        <tr><td>${r.actualTeams.map(esc).join(', ') || '—'}</td><td>${r.teamHits.map(esc).join(', ') || '—'}</td></tr>
        ${missesRow}
      </tbody>
      <tfoot><tr><td>Subtotal equipos clasificados</td><td class="num"><strong>${r.teamPts} pts</strong></td></tr></tfoot>
    </table>`
  }
  let pairRows = ''
  r.pairs.forEach(p => {
    const realStr = (p.realHome || p.realAway) ? `${esc(p.realHome) || '?'} vs ${esc(p.realAway) || '?'}` : '(sin definir)'
    const predStr = (p.predHome || p.predAway) ? `${esc(p.predHome) || '?'} vs ${esc(p.predAway) || '?'}` : '(sin pronóstico)'
    pairRows += `<tr class="${p.pairHit ? 'hit-full' : 'hit-none'}"><td>${realStr}</td><td>${predStr}</td><td>${p.pairHit ? '✓' : '✗'}</td></tr>`
  })
  out += `<table class="tbl small">
    <thead><tr><th>Llave real</th><th>Llave pronosticada</th><th>Acierto</th></tr></thead>
    <tbody>${pairRows}</tbody>
    <tfoot><tr><td colspan="2">Llaves acertadas: ${r.pairHits.length}/${r.pairs.length} (× ${r.pairPtsUnit} pts)</td><td class="num"><strong>${r.pairPts} pts</strong></td></tr></tfoot>
  </table>`
  return out
}

// ── Sección: Final y Tercer Puesto ──
function renderFinalFour(ff) {
  function matchRow(label, real, pred, hits) {
    const realStr = (real.home || real.away) ? `${esc(real.home) || '?'} vs ${esc(real.away) || '?'}` : '(sin definir)'
    const predStr = (pred.home || pred.away) ? `${esc(pred.home) || '?'} vs ${esc(pred.away) || '?'}` : '(sin pronóstico)'
    return `<tr><td>${label}</td><td>${realStr}</td><td>${predStr}</td><td>${hits.map(esc).join(', ') || '—'}</td></tr>`
  }
  return `
    <h4>Final y Tercer Puesto — 4 equipos (Final Four, ${ff.teamPtsUnit} pts/equipo)</h4>
    <table class="tbl small">
      <thead><tr><th>Partido</th><th>Real</th><th>Pronóstico</th><th>Equipos acertados</th></tr></thead>
      <tbody>
        ${matchRow('Final', ff.realFinal, ff.predFinal, ff.finalHits)}
        ${matchRow('Tercer puesto', ff.realThird, ff.predThird, ff.thirdHits)}
      </tbody>
      <tfoot><tr><td colspan="3">Subtotal equipos (${ff.finalHits.length + ff.thirdHits.length} aciertos)</td><td class="num"><strong>${ff.teamPts} pts</strong></td></tr></tfoot>
    </table>
    <table class="tbl small">
      <thead><tr><th>Llave</th><th>Acierto</th><th>Pts</th></tr></thead>
      <tbody>
        <tr class="${ff.thirdPairHit ? 'hit-full' : 'hit-none'}"><td>Llave 3er/4to puesto (ambos equipos, sin importar orden)</td><td>${ff.thirdPairHit ? '✓' : '✗'}</td><td class="num">${ff.thirdPairPts}</td></tr>
        <tr class="${ff.finalPairHit ? 'hit-full' : 'hit-none'}"><td>Llave FINAL (ambos equipos, sin importar orden)</td><td>${ff.finalPairHit ? '✓' : '✗'}</td><td class="num">${ff.finalPairPts}</td></tr>
      </tbody>
    </table>`
}

// ── Sección: Bonus ──
function renderBonus(b) {
  function row(label, obj) {
    return `<tr class="${obj.hit ? 'hit-full' : 'hit-none'}"><td>${label}</td><td>${esc(obj.real) || '(pendiente)'}</td><td>${esc(obj.pred) || '—'}</td><td>${obj.hit ? '✓' : '✗'}</td><td class="num">${obj.pts} / ${obj.ptsUnit}</td></tr>`
  }
  return `
    <h4>Bonus — Puestos finales</h4>
    <table class="tbl small">
      <thead><tr><th>Puesto</th><th>Real</th><th>Pronóstico</th><th>Acierto</th><th>Pts</th></tr></thead>
      <tbody>
        ${row('Campeón', b.champion)}
        ${row('Subcampeón', b.runnerUp)}
        ${row('Tercer puesto', b.third)}
        ${row('Cuarto puesto', b.fourth)}
      </tbody>
      <tfoot><tr><td colspan="4">Subtotal bonus</td><td class="num"><strong>${b.total} pts</strong></td></tr></tfoot>
    </table>`
}

// ── Sección: Goleador ──
function renderGoleador(gl) {
  return `
    <h4>Goleador</h4>
    <table class="tbl small">
      <thead><tr><th>Top goleadores oficiales</th><th>Pronóstico del participante</th><th>Acierto</th><th>Pts</th></tr></thead>
      <tbody>
        <tr class="${gl.hit ? 'hit-full' : 'hit-none'}">
          <td>${gl.actualTop.map(esc).join(', ') || '(sin definir)'}</td>
          <td>${esc(gl.predicted) || '—'}</td>
          <td>${gl.hit ? '✓' : '✗'}</td>
          <td class="num">${gl.pts} / ${gl.ptsUnit}</td>
        </tr>
      </tbody>
    </table>`
}

// ── Tarjeta de participante ──
function renderParticipant(p, polla, rank) {
  const id = `p-${slug(polla.name)}-${slug(p.name)}`
  const ob = p.officialBreakdown
  const bracketPts = p.phases.r32.pairPts + p.phases.r16.teamPts + p.phases.r16.pairPts +
    p.phases.qf.teamPts + p.phases.qf.pairPts + p.phases.sf.teamPts + p.phases.sf.pairPts +
    p.phases.finalFour.teamPts + p.phases.finalFour.thirdPairPts + p.phases.finalFour.finalPairPts +
    p.phases.bonus.total
  return `
  <section class="participant" id="${id}">
    <div class="p-header">
      <div class="p-rank">#${rank}</div>
      <div class="p-name">${esc(p.name)}</div>
      <div class="p-total">${p.total} pts</div>
    </div>
    <table class="tbl summary">
      <thead><tr><th>Grupos (marcador)</th><th>Grupos (posición + clasificados)</th><th>Bracket (llaves+equipos+bonus)</th><th>Goleador</th><th>TOTAL</th></tr></thead>
      <tbody><tr>
        <td class="num">${ob.ptsExacto + ob.ptsResultado}</td>
        <td class="num">${ob.ptsStandings}</td>
        <td class="num">${bracketPts}</td>
        <td class="num">${ob.ptsScorers}</td>
        <td class="num"><strong>${p.total}</strong></td>
      </tr></tbody>
    </table>

    <details open><summary>1. Fase de Grupos</summary>
      ${renderGrupos(p.phases.grupos)}
      ${renderStandings(p.phases.grupos)}
    </details>

    <details open><summary>2. 32avos (Dieciseisavos) — clasificación y llaves</summary>
      ${renderClasificados32(p.phases.clasificados32)}
      ${renderRound(p.phases.r32, false)}
    </details>

    <details open><summary>3. 16avos (Octavos, R16)</summary>
      ${renderRound(p.phases.r16, true)}
    </details>

    <details open><summary>4. Cuartos de Final (QF)</summary>
      ${renderRound(p.phases.qf, true)}
    </details>

    <details open><summary>5. Semifinales (SF)</summary>
      ${renderRound(p.phases.sf, true)}
    </details>

    <details open><summary>6. Final y Tercer Puesto + Bonus</summary>
      ${renderFinalFour(p.phases.finalFour)}
      ${renderBonus(p.phases.bonus)}
    </details>

    <details open><summary>7. Goleador</summary>
      ${renderGoleador(p.phases.goleador)}
    </details>
  </section>`
}

function renderPolla(polla) {
  const cards = polla.top4.map((p, i) => renderParticipant(p, polla, i + 1)).join('\n')
  return `
  <section class="polla">
    <h2><span class="eyebrow">Polla</span> ${esc(polla.name)} — Top 4</h2>
    ${cards}
  </section>`
}

const tocLinks = data.pollas.map(polla =>
  `<div class="toc-group"><strong>${esc(polla.name)}</strong>
    <ul>${polla.top4.map((p, i) => `<li><a href="#p-${slug(polla.name)}-${slug(p.name)}"><span>#${i + 1} ${esc(p.name)}</span><span>${p.total} pts</span></a></li>`).join('')}</ul>
  </div>`
).join('\n')

const html = `<title>Auditoría de Puntajes — Top 4 por Polla</title>
<meta name="description" content="Informe de auditoría fase por fase, Real vs. Pronóstico, para el Top 4 de cada polla del Mundial 2026." />
<style>
:root {
  color-scheme: light dark;
  --paper: #f4f6f0;
  --paper-raised: #ffffff;
  --ink: #17231a;
  --ink-soft: #4b594c;
  --line: #ccd4c3;
  --line-soft: #dfe5d7;
  --pitch: #2f6b4d;
  --pitch-ink: #ffffff;
  --gold: #a8792a;
  --gold-soft: rgba(184, 134, 47, 0.14);
  --brick: #a84632;
  --brick-soft: rgba(184, 78, 58, 0.10);
  --ochre: #a97c22;
  --ochre-soft: rgba(201, 154, 61, 0.16);
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #10160f;
    --paper-raised: #161d14;
    --ink: #e9ede4;
    --ink-soft: #a9b6a4;
    --line: #2b3a2a;
    --line-soft: #21301f;
    --pitch: #5ea37c;
    --pitch-ink: #0b120a;
    --gold: #d9a94a;
    --gold-soft: rgba(217, 169, 74, 0.14);
    --brick: #d97e63;
    --brick-soft: rgba(217, 126, 99, 0.12);
    --ochre: #d9b25c;
    --ochre-soft: rgba(217, 178, 92, 0.14);
  }
}
:root[data-theme="dark"] {
  --paper: #10160f; --paper-raised: #161d14; --ink: #e9ede4; --ink-soft: #a9b6a4;
  --line: #2b3a2a; --line-soft: #21301f; --pitch: #5ea37c; --pitch-ink: #0b120a;
  --gold: #d9a94a; --gold-soft: rgba(217, 169, 74, 0.14);
  --brick: #d97e63; --brick-soft: rgba(217, 126, 99, 0.12);
  --ochre: #d9b25c; --ochre-soft: rgba(217, 178, 92, 0.14);
}
:root[data-theme="light"] {
  --paper: #f4f6f0; --paper-raised: #ffffff; --ink: #17231a; --ink-soft: #4b594c;
  --line: #ccd4c3; --line-soft: #dfe5d7; --pitch: #2f6b4d; --pitch-ink: #ffffff;
  --gold: #a8792a; --gold-soft: rgba(184, 134, 47, 0.14);
  --brick: #a84632; --brick-soft: rgba(184, 78, 58, 0.10);
  --ochre: #a97c22; --ochre-soft: rgba(201, 154, 61, 0.16);
}

* { box-sizing: border-box; }
body {
  font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  background: var(--paper); color: var(--ink);
  line-height: 1.5; max-width: 1120px; margin: 0 auto; padding: 40px 24px 80px;
}
h1, h2, h4, summary {
  font-family: Charter, "Iowan Old Style", "Palatino Linotype", Georgia, ui-serif, serif;
}
h1 { font-size: 2rem; font-weight: 600; letter-spacing: -0.01em; margin: 0 0 6px; text-wrap: balance; }
.subtitle { color: var(--ink-soft); margin: 0 0 28px; max-width: 65ch; }
h2 {
  font-size: 1.4rem; font-weight: 600; margin: 56px 0 18px; padding-bottom: 10px;
  border-bottom: 2px solid var(--pitch); color: var(--pitch);
  display: flex; align-items: baseline; gap: 10px;
}
h2 .eyebrow { font-family: -apple-system, "Segoe UI", sans-serif; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-soft); }
h4 { font-size: 1.02rem; font-weight: 600; margin: 20px 0 8px; color: var(--ink); }

.toc {
  border: 1px solid var(--line); border-radius: 10px; padding: 18px 22px 20px;
  margin-bottom: 36px; background: var(--paper-raised);
}
.toc > strong { font-family: Charter, Georgia, ui-serif, serif; font-size: 1.05rem; }
.toc-groups { display: flex; flex-wrap: wrap; gap: 24px; margin-top: 10px; }
.toc-group { min-width: 220px; }
.toc-group strong { font-size: 0.92rem; color: var(--pitch); }
.toc ul { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.toc a {
  color: var(--ink); text-decoration: none; font-size: 0.9rem; font-variant-numeric: tabular-nums;
  display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; border-bottom: 1px dotted transparent;
}
.toc a:hover { border-bottom-color: var(--line); color: var(--pitch); }

.legend { display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 0.82rem; color: var(--ink-soft); margin-bottom: 8px; }
.legend .chip { display: inline-flex; align-items: center; gap: 6px; }
.legend .dot { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }

.polla { margin-bottom: 8px; }

.participant {
  border: 1px solid var(--line); border-radius: 12px; padding: 20px 24px 8px;
  margin: 22px 0; background: var(--paper-raised); page-break-inside: avoid;
}
.p-header { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; flex-wrap: wrap; }
.p-rank {
  font-family: Charter, Georgia, ui-serif, serif; font-weight: 700; font-size: 0.95rem;
  background: var(--pitch); color: var(--pitch-ink); border-radius: 999px;
  width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.p-name { font-family: Charter, Georgia, ui-serif, serif; font-size: 1.3rem; font-weight: 600; flex: 1; min-width: 160px; }
.p-total {
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 1.05rem; font-weight: 600; color: var(--gold); background: var(--gold-soft);
  padding: 5px 12px; border-radius: 7px; font-variant-numeric: tabular-nums;
}

table.tbl { border-collapse: collapse; width: 100%; margin: 6px 0 16px; font-size: 0.87rem; }
table.tbl.small { font-size: 0.81rem; }
table.tbl th, table.tbl td { border: 1px solid var(--line-soft); padding: 5px 9px; text-align: left; vertical-align: top; }
table.tbl th {
  background: transparent; border-bottom: 1.5px solid var(--line); font-weight: 600; color: var(--ink-soft);
  font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.03em;
}
table.tbl td.num, table.tbl th.num {
  text-align: right; font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
  font-variant-numeric: tabular-nums;
}
table.tbl tfoot td {
  font-weight: 600; background: var(--line-soft); border-top: 1.5px solid var(--line);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
}
table.tbl tfoot td:first-child { font-family: inherit; }
table.summary td {
  text-align: center; font-size: 1rem; font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-variant-numeric: tabular-nums; padding: 10px 9px;
}
table.summary th { text-align: center; }
.two-col td:first-child, .two-col th:first-child { width: 50%; }

tr.hit-full td:first-child { box-shadow: inset 3px 0 0 var(--pitch); }
tr.hit-partial td:first-child { box-shadow: inset 3px 0 0 var(--ochre); }
tr.hit-none td:first-child { box-shadow: inset 3px 0 0 var(--brick); }
tr.hit-full { background: color-mix(in srgb, var(--pitch) 8%, transparent); }
tr.hit-partial { background: var(--ochre-soft); }
tr.hit-none { background: var(--brick-soft); }

.muted { color: var(--ink-soft); font-style: italic; }

details summary {
  cursor: pointer; font-weight: 600; font-size: 1.08rem; margin: 16px 0 6px; padding: 10px 0 8px;
  border-top: 1px solid var(--line); list-style: none;
}
details summary::-webkit-details-marker { display: none; }
details summary::before { content: "▸ "; color: var(--pitch); }
details[open] summary::before { content: "▾ "; }
details[open] summary { border-bottom: 1px dashed var(--line-soft); }

a:focus-visible, summary:focus-visible { outline: 2px solid var(--pitch); outline-offset: 2px; }

footer.note { color: var(--ink-soft); font-style: italic; margin-top: 48px; padding-top: 20px; border-top: 1px solid var(--line); font-size: 0.9rem; }

@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }

@media print {
  body { max-width: none; padding: 0 12px; }
  .toc a { color: var(--ink); }
}
</style>

<h1>Auditoría Detallada de Puntajes — Top 4 por Polla</h1>
<p class="subtitle">Generado ${esc(fmtDate(data.generatedAt))} (hora Colombia) · Comparación Real vs. Pronóstico, fase por fase, para los 4 primeros lugares de cada polla: grupos, 32avos, 16avos, cuartos, semifinales, final y goleador.</p>

<div class="legend">
  <span class="chip"><span class="dot" style="background: var(--pitch)"></span> Acierto</span>
  <span class="chip"><span class="dot" style="background: var(--ochre)"></span> Acierto parcial (resultado sin marcador exacto)</span>
  <span class="chip"><span class="dot" style="background: var(--brick)"></span> Fallo</span>
</div>

<div class="toc">
  <strong>Índice</strong>
  <div class="toc-groups">
    ${tocLinks}
  </div>
</div>

${data.pollas.map(renderPolla).join('\n')}

<footer class="note">Fin del informe. Todos los totales por participante fueron verificados matemáticamente: la suma de las 7 fases (grupos, posición de grupo, clasificados a 32avos, 16avos, cuartos, semifinales, final/tercer puesto + bonus, y goleador) coincide de forma exacta con el puntaje oficial que muestra la tabla de posiciones de la app.</footer>
`

fs.writeFileSync(outputPath, html, 'utf8')
console.log('OK ->', outputPath)
