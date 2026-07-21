// Envía un recordatorio por email a los participantes que AÚN NO han
// guardado su pronóstico para un partido de grupos, cuando faltan 15
// minutos o menos para el inicio (y aún no arrancó). Pensado para
// invocarse cada 1-5 minutos vía pg_cron (ver supabase/migrations o el
// SQL de scheduling que acompaña esta función).
//
// Requiere el secret RESEND_API_KEY (cuenta en https://resend.com).
// Opcional: RESEND_FROM_EMAIL (por defecto "Polla <onboarding@resend.dev>",
// el dominio de pruebas de Resend — para producción real conviene verificar
// un dominio propio en Resend y usar un remitente con ese dominio).
//
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase automáticamente.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const REMINDER_MINUTES_BEFORE = 15

function parseKickoff(date: string | null, hora: string | null): Date | null {
  if (!date || !hora) return null
  const dateParts = date.split('/').map(Number)
  const timeParts = hora.split(':').map(Number)
  if (dateParts.length !== 3 || timeParts.length < 2) return null
  const [day, month, year] = dateParts
  const [hour, minute] = timeParts
  if (!day || !month || !year || Number.isNaN(hour) || Number.isNaN(minute)) return null
  const d = new Date(year, month - 1, day, hour, minute, 0, 0)
  return Number.isNaN(d.getTime()) ? null : d
}

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) throw new Error('RESEND_API_KEY no configurado')
  const from = Deno.env.get('RESEND_FROM_EMAIL') || 'Polla <onboarding@resend.dev>'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend error ${res.status}: ${body}`)
  }
}

Deno.serve(async (_req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  const now = Date.now()
  const summary: Array<{ matchId: string; sent: number; failed: number }> = []

  const { data: matches, error: matchesError } = await supabase
    .from('matches')
    .select('id, home_team, away_team, date, hora, status, reminder_sent_at')
    .eq('status', 'pending')
    .is('reminder_sent_at', null)

  if (matchesError) {
    return new Response(JSON.stringify({ error: matchesError.message }), { status: 500 })
  }

  const dueMatches = (matches || []).filter(m => {
    const kickoff = parseKickoff(m.date, m.hora)
    if (!kickoff) return false
    const windowStart = kickoff.getTime() - REMINDER_MINUTES_BEFORE * 60000
    return now >= windowStart && now < kickoff.getTime()
  })

  if (dueMatches.length === 0) {
    return new Response(JSON.stringify({ message: 'Sin partidos por recordar', checked: matches?.length || 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { data: participants } = await supabase
    .from('participants')
    .select('id, name, email')
    .not('email', 'is', null)

  const { data: predictions } = await supabase
    .from('predictions')
    .select('participant_id, match_id')
    .in('match_id', dueMatches.map(m => m.id))

  for (const match of dueMatches) {
    const alreadyPredicted = new Set(
      (predictions || []).filter(p => p.match_id === match.id).map(p => p.participant_id)
    )
    const pending = (participants || []).filter(p => !alreadyPredicted.has(p.id))

    let sent = 0, failed = 0
    for (const p of pending) {
      try {
        await sendEmail(
          p.email,
          `⏰ Faltan ${REMINDER_MINUTES_BEFORE} min: ${match.home_team} vs ${match.away_team}`,
          `<p>Hola ${p.name},</p>
           <p>El partido <strong>${match.home_team} vs ${match.away_team}</strong> arranca a las ${match.hora} y todavía no registras tu pronóstico.</p>
           <p>Entra a la app antes de que empiece para no quedarte sin puntos.</p>`
        )
        sent++
      } catch (e) {
        console.error(`Error enviando a ${p.email} (match ${match.id}):`, e)
        failed++
      }
    }

    await supabase.from('matches').update({ reminder_sent_at: new Date().toISOString() }).eq('id', match.id)
    summary.push({ matchId: match.id, sent, failed })
  }

  return new Response(JSON.stringify({ processed: summary }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
