#!/usr/bin/env node
/**
 * One-off backfill: fills the NEW CMS fields (added 2026-07) with the texts
 * currently hardcoded on the site, so editors start from the live wording
 * instead of empty inputs.
 *
 * Safe to re-run: only writes fields that are currently empty — existing
 * admin edits are never overwritten.
 *
 * Usage (against prod):
 *   DIRECTUS_URL=https://total-asset-back-production.up.railway.app \
 *   DIRECTUS_ADMIN_EMAIL=... DIRECTUS_ADMIN_PASSWORD=... \
 *   node scripts/backfill-cms-texts.mjs
 *
 * Or with a static admin token:
 *   DIRECTUS_URL=... DIRECTUS_ADMIN_TOKEN=... node scripts/backfill-cms-texts.mjs
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055'
const EMAIL = process.env.DIRECTUS_ADMIN_EMAIL || 'admin@example.com'
const PASSWORD = process.env.DIRECTUS_ADMIN_PASSWORD || 'admin'
const STATIC_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN || ''

let token = STATIC_TOKEN

async function login() {
  if (token) return
  const res = await fetch(`${DIRECTUS_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`)
  token = (await res.json()).data.access_token
}

async function req(method, path, body) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : (await res.json()).data
}

const empty = v => v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)

/** PATCH only the keys that are currently empty on the item. Returns patched keys. */
async function patchMissing(path, current, wanted) {
  const patch = {}
  for (const [k, v] of Object.entries(wanted)) if (empty(current[k])) patch[k] = v
  if (Object.keys(patch).length) await req('PATCH', path, patch)
  return Object.keys(patch)
}

const HOME_ROOT = {
  partners: [
    { name: 'Japan Bank for International Cooperation' },
    { name: 'UNA MOLIYA' },
    { name: 'Toyota Tsusho' },
    { name: 'Terauchi Litech' },
    { name: 'Eurus Energy Holdings' },
  ],
  stats: [
    { value: '20+', label_en: 'Cross-border engagements', label_ru: 'Трансграничных проектов' },
    { value: '3', label_en: 'Working languages', label_ru: 'Рабочих языка' },
    { value: '12', label_en: 'Institutional partners', label_ru: 'Институциональных партнёра' },
    { value: '8+', label_en: 'Years in the Uzbek market', label_ru: 'Лет на рынке Узбекистана' },
  ],
}

const HOME_TR = {
  'en-US': {
    hero_location: 'Tashkent · Venture Plaza',
    services_heading: 'Institutional discipline. Local fluency.',
    services_sub: 'One mandate: turn international intent into measurable, on-the-ground results.',
    partners_heading: 'Selected institutional partners',
  },
  'ru-RU': {
    hero_location: 'Ташкент · Venture Plaza',
    services_heading: 'Институциональная дисциплина. Локальная экспертиза.',
    services_sub: 'Наша цель — превратить международные намерения в измеримый результат на местах.',
    partners_heading: 'Избранные институциональные партнёры',
  },
}

const ABOUT_TR = {
  'en-US': {
    hero_title: 'Total Asset Silk Road',
    hero_subtitle: 'Financial consulting at the intersection of strategy and execution in Uzbekistan.',
    value1_title: 'Institutional discipline',
    value1_body: 'IFRS, audit-ready reporting, governance frameworks built for sovereign-level scrutiny.',
    value2_title: 'Local fluency',
    value2_body: 'Direct lines with regulators and public stakeholders. Cultural literacy that compresses execution time.',
    value3_title: 'Outcome focus',
    value3_body: 'We measure success in delivered milestones and unblocked capital — not slides per week.',
  },
  'ru-RU': {
    hero_title: 'Total Asset Silk Road',
    hero_subtitle: 'Финансовый консалтинг на стыке стратегии и реализации в Узбекистане.',
    value1_title: 'Институциональная дисциплина',
    value1_body: 'МСФО, отчётность под аудит, корпоративное управление, выдерживающее проверку на суверенном уровне.',
    value2_title: 'Локальная экспертиза',
    value2_body: 'Прямой контакт с регуляторами и публичными стейкхолдерами. Понимание контекста, ускоряющее реализацию.',
    value3_title: 'Ориентация на результат',
    value3_body: 'Мы измеряем успех закрытыми этапами и привлечённым капиталом — а не количеством слайдов в неделю.',
  },
}

async function main() {
  await login()
  console.log(`Connected to ${DIRECTUS_URL}`)

  const home = await req('GET', '/items/page_home?fields=id,partners,stats')
  const done = await patchMissing('/items/page_home', home, HOME_ROOT)
  console.log(`page_home: ${done.length ? done.join(', ') : 'nothing to do'}`)

  for (const [col, wantedByLang] of [['page_home', HOME_TR], ['page_about', ABOUT_TR]]) {
    const items = await req('GET', `/items/${col}_translations?limit=-1`)
    for (const t of items) {
      const wanted = wantedByLang[t.languages_code]
      if (!wanted) continue
      const patched = await patchMissing(`/items/${col}_translations/${t.id}`, t, wanted)
      console.log(`${col}_translations ${t.languages_code}: ${patched.length ? patched.join(', ') : 'nothing to do'}`)
    }
  }

  console.log('Backfill complete.')
}

main().catch((e) => { console.error(e); process.exit(1) })
