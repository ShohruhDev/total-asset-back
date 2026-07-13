#!/usr/bin/env node
/**
 * Governance setup from the technical revision register (12 July 2026):
 *
 *  A-03  Publication workflow — existing content is marked "published";
 *        the Public role only sees published services/projects/team/news.
 *  A-02  Roles: Editor (content CRUD, cannot publish or manage the system)
 *        and Reviewer (Editor rights + can change publication status).
 *  A-11  Public read permissions narrowed from fields:'*' to the exact
 *        fields the frontend consumes.
 *  A-12  Public file metadata limited to what asset delivery needs.
 *
 * Idempotent. Run:
 *   DIRECTUS_URL=https://total-asset-back-production.up.railway.app \
 *   DIRECTUS_ADMIN_EMAIL=... DIRECTUS_ADMIN_PASSWORD=... \
 *   node scripts/setup-governance-2026-07.mjs
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055'
const EMAIL = process.env.DIRECTUS_ADMIN_EMAIL || 'admin@example.com'
const PASSWORD = process.env.DIRECTUS_ADMIN_PASSWORD || 'admin'

let token = ''
async function login() {
  const res = await fetch(`${DIRECTUS_URL}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`)
  token = (await res.json()).data.access_token
}
async function req(method, path, body) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : (await res.json()).data
}

// ---------------------------------------------------------------- A-03

const WORKFLOW_COLLECTIONS = ['services', 'projects', 'team_members']

async function publishExisting() {
  console.log('A-03 mark existing content as published:')
  for (const col of WORKFLOW_COLLECTIONS) {
    const items = await req('GET', `/items/${col}?limit=-1&fields=id,status`)
    const pending = items.filter(i => !i.status || i.status === 'draft')
    for (const i of pending) {
      await req('PATCH', `/items/${col}/${i.id}`, { status: 'published' })
    }
    console.log(`  ✓ ${col}: ${pending.length} item(s) set to published`)
  }
}

// ---------------------------------------------------------------- A-11 / A-12

// Exact field lists the public frontend consumes (see total-asset-front/types/directus.ts)
const PUBLIC_READ = {
  languages: { fields: ['code', 'name', 'direction'] },
  site_settings: { fields: ['id', 'logo', 'address', 'phone', 'email', 'instagram_url', 'linkedin_url', 'facebook_url', 'translations'] },
  site_settings_translations: { fields: ['id', 'languages_code', 'tagline', 'description'] },
  page_home: { fields: ['id', 'hero_image', 'cta_link', 'partners', 'stats', 'translations'] },
  page_home_translations: { fields: ['id', 'languages_code', 'hero_title', 'hero_subtitle', 'cta_text', 'hero_location', 'services_heading', 'services_sub', 'partners_heading'] },
  page_about: { fields: ['id', 'translations'] },
  page_about_translations: { fields: ['id', 'languages_code', 'body', 'mission', 'vision', 'hero_title', 'hero_subtitle', 'value1_title', 'value1_body', 'value2_title', 'value2_body', 'value3_title', 'value3_body'] },
  page_contact: { fields: ['id', 'map_embed', 'translations'] },
  page_contact_translations: { fields: ['id', 'languages_code', 'body'] },
  services: {
    fields: ['id', 'slug', 'icon', 'order', 'translations'],
    filter: { status: { _eq: 'published' } },
  },
  services_translations: { fields: ['id', 'languages_code', 'name', 'short_description', 'full_description'] },
  projects: {
    fields: ['id', 'slug', 'client_logo', 'hero_image', 'period_start', 'period_end', 'translations'],
    filter: { status: { _eq: 'published' } },
  },
  projects_translations: { fields: ['id', 'languages_code', 'name', 'client_name', 'summary', 'description'] },
  team_members: {
    fields: ['id', 'slug', 'photo', 'email', 'linkedin_url', 'order', 'translations'],
    filter: { status: { _eq: 'published' } },
  },
  team_members_translations: { fields: ['id', 'languages_code', 'full_name', 'position', 'biography', 'short_bio'] },
  news: {
    fields: ['id', 'slug', 'cover', 'published_at', 'status', 'translations'],
    filter: { status: { _eq: 'published' } },
  },
  news_translations: { fields: ['id', 'languages_code', 'title', 'excerpt', 'body'] },
  directus_files: { fields: ['id', 'type', 'title', 'width', 'height'] },
}

async function getPublicPolicyId() {
  const policies = await req('GET', '/policies?limit=-1')
  const pub = policies.find(p => !p.admin_access && !p.app_access)
  if (!pub) throw new Error('Public policy not found')
  return pub.id
}

async function narrowPublicPermissions() {
  console.log('A-11/A-12 narrow public read permissions:')
  const policyId = await getPublicPolicyId()
  const existing = await req('GET', `/permissions?filter[policy][_eq]=${policyId}&limit=-1`)

  for (const [collection, def] of Object.entries(PUBLIC_READ)) {
    const cur = existing.find(p => p.collection === collection && p.action === 'read')
    const payload = {
      policy: policyId,
      collection,
      action: 'read',
      fields: def.fields,
      permissions: def.filter ? { _and: [def.filter] } : {},
      validation: {},
      presets: null,
    }
    if (cur) {
      await req('PATCH', `/permissions/${cur.id}`, payload)
      console.log(`  ✓ ${collection}: narrowed (${def.fields.length} fields${def.filter ? ', published only' : ''})`)
    } else {
      await req('POST', '/permissions', payload)
      console.log(`  ✓ ${collection}: created (${def.fields.length} fields)`)
    }
  }

  // Drop public read permissions for collections not in the allowlist
  for (const p of existing) {
    if (p.action === 'read' && !(p.collection in PUBLIC_READ) && !p.collection.startsWith('directus_')) {
      await req('DELETE', `/permissions/${p.id}`)
      console.log(`  ✗ removed public read on ${p.collection}`)
    }
  }
}

// ---------------------------------------------------------------- A-02

const CONTENT_COLLECTIONS = [
  'site_settings', 'site_settings_translations',
  'page_home', 'page_home_translations',
  'page_about', 'page_about_translations',
  'page_contact', 'page_contact_translations',
  'services', 'services_translations',
  'projects', 'projects_translations',
  'team_members', 'team_members_translations',
  'news', 'news_translations',
  'languages',
]

/** Every editable field except the publication status (Editor cannot publish). */
async function fieldsWithoutStatus(collection) {
  const fields = await req('GET', `/fields/${collection}`)
  return fields.map(f => f.field).filter(f => f !== 'status')
}

async function ensureRole(name, description, policyBuilder) {
  console.log(`A-02 role "${name}":`)
  const roles = await req('GET', `/roles?filter[name][_eq]=${encodeURIComponent(name)}&limit=1`)
  if (roles.length) {
    console.log('  = role exists, skipping (adjust manually in Settings → Roles if needed)')
    return
  }
  const policies = await req('GET', `/policies?filter[name][_eq]=${encodeURIComponent(name)}&limit=1`)
  let policyId = policies[0]?.id
  if (!policyId) {
    const policy = await req('POST', '/policies', {
      name,
      description,
      app_access: true,
      admin_access: false,
      enforce_tfa: false,
    })
    policyId = policy.id
    await policyBuilder(policyId)
    console.log('  ✓ policy created with permissions')
  }
  const role = await req('POST', '/roles', { name, description, icon: 'supervised_user_circle' })
  await req('POST', '/access', { role: role.id, policy: policyId })
  console.log(`  ✓ role created (assign users in Settings → Users)`)
}

async function editorPermissions(policyId) {
  for (const collection of CONTENT_COLLECTIONS) {
    const editable = await fieldsWithoutStatus(collection)
    // read everything (incl. drafts), edit everything except status
    await req('POST', '/permissions', { policy: policyId, collection, action: 'read', fields: ['*'], permissions: {}, validation: {} })
    await req('POST', '/permissions', { policy: policyId, collection, action: 'create', fields: editable, permissions: {}, validation: {} })
    await req('POST', '/permissions', { policy: policyId, collection, action: 'update', fields: editable, permissions: {}, validation: {} })
  }
  // enquiries: process them (read/update status of submissions), no create/delete
  await req('POST', '/permissions', { policy: policyId, collection: 'contact_submissions', action: 'read', fields: ['*'], permissions: {}, validation: {} })
  await req('POST', '/permissions', { policy: policyId, collection: 'contact_submissions', action: 'update', fields: ['status', 'assignee', 'response_date', 'retention_date'], permissions: {}, validation: {} })
  // files: upload + read (media library), no delete
  await req('POST', '/permissions', { policy: policyId, collection: 'directus_files', action: 'read', fields: ['*'], permissions: {}, validation: {} })
  await req('POST', '/permissions', { policy: policyId, collection: 'directus_files', action: 'create', fields: ['*'], permissions: {}, validation: {} })
  await req('POST', '/permissions', { policy: policyId, collection: 'directus_files', action: 'update', fields: ['*'], permissions: {}, validation: {} })
}

async function reviewerPermissions(policyId) {
  for (const collection of CONTENT_COLLECTIONS) {
    await req('POST', '/permissions', { policy: policyId, collection, action: 'read', fields: ['*'], permissions: {}, validation: {} })
    await req('POST', '/permissions', { policy: policyId, collection, action: 'create', fields: ['*'], permissions: {}, validation: {} })
    await req('POST', '/permissions', { policy: policyId, collection, action: 'update', fields: ['*'], permissions: {}, validation: {} })
  }
  await req('POST', '/permissions', { policy: policyId, collection: 'contact_submissions', action: 'read', fields: ['*'], permissions: {}, validation: {} })
  await req('POST', '/permissions', { policy: policyId, collection: 'contact_submissions', action: 'update', fields: ['status', 'assignee', 'response_date', 'retention_date'], permissions: {}, validation: {} })
  await req('POST', '/permissions', { policy: policyId, collection: 'directus_files', action: 'read', fields: ['*'], permissions: {}, validation: {} })
  await req('POST', '/permissions', { policy: policyId, collection: 'directus_files', action: 'create', fields: ['*'], permissions: {}, validation: {} })
  await req('POST', '/permissions', { policy: policyId, collection: 'directus_files', action: 'update', fields: ['*'], permissions: {}, validation: {} })
}

async function extendContactCreatePermission() {
  // T-17: the form now stamps retention_date on each submission
  console.log('T-17 allow retention_date in the public create permission:')
  const policyId = await getPublicPolicyId()
  const perms = await req('GET', `/permissions?filter[policy][_eq]=${policyId}&filter[collection][_eq]=contact_submissions&limit=-1`)
  const create = perms.find(p => p.action === 'create')
  if (!create) { console.log('  ! create permission missing — run apply-content-register first'); return }
  const fields = Array.from(new Set([...(create.fields || []), 'retention_date']))
  await req('PATCH', `/permissions/${create.id}`, { fields })
  console.log('  ✓ extended')
}

async function main() {
  await login()
  console.log(`Connected to ${DIRECTUS_URL}\n`)
  await publishExisting()
  await extendContactCreatePermission()
  await narrowPublicPermissions()
  await ensureRole(
    'Editor',
    'Контент-редактор: создаёт и правит контент, НЕ публикует (статус меняет Reviewer) и не управляет системой.',
    editorPermissions,
  )
  await ensureRole(
    'Reviewer',
    'Проверяющий: права редактора + публикация (смена статуса Draft/Review/Published/Archived).',
    reviewerPermissions,
  )
  console.log('\n✅ Governance setup complete.')
}
main().catch((e) => { console.error(e); process.exit(1) })
