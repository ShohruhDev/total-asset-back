#!/usr/bin/env node
/**
 * Idempotent seed script for Total Asset Silk Road Directus.
 *
 * Usage:
 *   DIRECTUS_URL=http://localhost:8055 \
 *   DIRECTUS_ADMIN_EMAIL=admin@example.com \
 *   DIRECTUS_ADMIN_PASSWORD=admin \
 *   node cms/scripts/seed.mjs
 *
 * Creates languages, collections, fields, roles, public permissions, and starter content.
 * Re-run safe: existing collections/fields/items are detected and skipped.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055'
const EMAIL = process.env.DIRECTUS_ADMIN_EMAIL || 'admin@example.com'
const PASSWORD = process.env.DIRECTUS_ADMIN_PASSWORD || 'admin'

let token = ''

async function login() {
  const res = await fetch(`${DIRECTUS_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`)
  const json = await res.json()
  token = json.data.access_token
  console.log('✓ logged in')
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function req(method, path, body, retry = 0) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  const json = text ? JSON.parse(text) : null
  if (res.status === 429 && retry < 6) {
    const wait = 200 * Math.pow(2, retry)
    await sleep(wait)
    return req(method, path, body, retry + 1)
  }
  if (!res.ok) {
    const e = new Error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`)
    e.status = res.status
    e.body = json
    throw e
  }
  // gentle throttle to stay under 50 req/s
  await sleep(30)
  return json?.data
}

async function exists(path) {
  try {
    await req('GET', path)
    return true
  } catch (e) {
    if (e.status === 403 || e.status === 404) return false
    throw e
  }
}

// ---------- LANGUAGES ----------
async function ensureLanguages() {
  console.log('\n📌 Languages')
  const wanted = [
    { code: 'en-US', name: 'English', direction: 'ltr' },
    { code: 'ru-RU', name: 'Русский', direction: 'ltr' },
  ]
  // Languages collection might not exist yet — create the system collection
  try {
    await req('GET', '/collections/languages')
  } catch (e) {
    if (e.status === 403 || e.status === 404) {
      await req('POST', '/collections', {
        collection: 'languages',
        meta: { icon: 'translate', hidden: false, singleton: false },
        schema: {},
        fields: [
          { field: 'code', type: 'string', meta: { interface: 'input', readonly: false, hidden: false }, schema: { is_primary_key: true, length: 255, has_auto_increment: false } },
          { field: 'name', type: 'string', meta: { interface: 'input' }, schema: { length: 255 } },
          { field: 'direction', type: 'string', meta: { interface: 'select-dropdown', options: { choices: [{ text: 'LTR', value: 'ltr' }, { text: 'RTL', value: 'rtl' }] } }, schema: { length: 255, default_value: 'ltr' } },
        ],
      })
      console.log('  ✓ created system collection: languages')
    }
  }
  for (const lang of wanted) {
    const ok = await exists(`/items/languages/${lang.code}`)
    if (ok) {
      console.log(`  · ${lang.code} exists`)
    } else {
      await req('POST', '/items/languages', lang)
      console.log(`  ✓ created language ${lang.code}`)
    }
  }
}

// ---------- COLLECTION HELPERS ----------
async function ensureCollection(collection, opts = {}) {
  try {
    await req('GET', `/collections/${collection}`)
    console.log(`  · collection ${collection} exists`)
    return false
  } catch (e) {
    if (e.status !== 403 && e.status !== 404) throw e
  }
  await req('POST', '/collections', {
    collection,
    meta: {
      icon: opts.icon || 'inventory_2',
      singleton: opts.singleton || false,
      hidden: false,
      sort_field: opts.sortField || null,
      archive_field: opts.archiveField || null,
      archive_value: opts.archiveValue || null,
      unarchive_value: opts.unarchiveValue || null,
      translations: null,
    },
    schema: {},
    fields: [
      {
        field: 'id',
        type: 'integer',
        meta: { interface: 'input', readonly: true, hidden: true },
        schema: { is_primary_key: true, has_auto_increment: true },
      },
    ],
  })
  console.log(`  ✓ created collection ${collection}`)
  return true
}

async function ensureField(collection, field, payload) {
  try {
    await req('GET', `/fields/${collection}/${field}`)
    return false
  } catch (e) {
    if (e.status !== 403 && e.status !== 404) throw e
  }
  await req('POST', `/fields/${collection}`, { field, ...payload })
  console.log(`    + ${collection}.${field}`)
  return true
}

async function ensureFileRelation(collection, field) {
  // fImage() fields need an explicit M2O relation to directus_files, otherwise
  // the admin UI accepts an upload but can't persist it against the item.
  try {
    await req('GET', `/relations/${collection}/${field}`)
    return false
  } catch (e) {
    if (e.status !== 403 && e.status !== 404) throw e
  }
  await req('POST', '/relations', { collection, field, related_collection: 'directus_files' })
  console.log(`    ~ relation ${collection}.${field} -> directus_files`)
  return true
}

async function ensureTranslationsField(collection, transFields) {
  // Translations interface in Directus = (1) create related collection <collection>_translations
  // (2) field on parent of type 'alias' with interface 'translations'
  const transCol = `${collection}_translations`

  // 1) create translations collection
  try {
    await req('GET', `/collections/${transCol}`)
  } catch (e) {
    if (e.status === 403 || e.status === 404) {
      await req('POST', '/collections', {
        collection: transCol,
        meta: { icon: 'translate', hidden: true, singleton: false },
        schema: {},
        fields: [
          { field: 'id', type: 'integer', meta: { interface: 'input', readonly: true, hidden: true }, schema: { is_primary_key: true, has_auto_increment: true } },
        ],
      })
      console.log(`  ✓ created collection ${transCol}`)
    } else { throw e }
  }

  // 2) FK to parent collection
  await ensureField(transCol, `${collection}_id`, {
    type: collection === 'site_settings' || collection === 'page_home' || collection === 'page_about' || collection === 'page_contact' ? 'integer' : 'integer',
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], hidden: true },
    schema: { is_nullable: true },
  })

  // 3) FK to languages
  await ensureField(transCol, 'languages_code', {
    type: 'string',
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], hidden: true },
    schema: { is_nullable: true, length: 255 },
  })

  // Now relations
  try {
    await req('POST', '/relations', {
      collection: transCol,
      field: `${collection}_id`,
      related_collection: collection,
      meta: { one_field: 'translations', one_collection: collection, one_collection_field: null, junction_field: 'languages_code', sort_field: null },
      schema: { on_delete: 'SET NULL' },
    })
  } catch (e) { if (e.status !== 400) throw e /* already exists */ }
  try {
    await req('POST', '/relations', {
      collection: transCol,
      field: 'languages_code',
      related_collection: 'languages',
      meta: { junction_field: `${collection}_id` },
      schema: { on_delete: 'SET NULL' },
    })
  } catch (e) { if (e.status !== 400) throw e }

  // 4) Translatable fields on the translations collection
  for (const [name, payload] of Object.entries(transFields)) {
    await ensureField(transCol, name, payload)
  }

  // 5) Alias field on the PARENT collection that surfaces the translations UI
  await ensureField(collection, 'translations', {
    type: 'alias',
    meta: {
      interface: 'translations',
      special: ['translations'],
      options: { languageField: 'code' },
    },
    schema: null,
  })
}

// ---------- POLICY + PERMISSIONS ----------
async function getPublicPolicyId() {
  const policies = await req('GET', '/policies?limit=-1')
  // Public policy is the one that's neither admin_access nor app_access by default
  const pub = policies.find(p => !p.admin_access && !p.app_access)
  if (!pub) throw new Error('Public policy not found')
  return pub.id
}

// Collections that have a `translations` alias field — must be listed in fields
const COLLECTIONS_WITH_TRANSLATIONS = new Set([
  'site_settings', 'page_home', 'page_about', 'page_contact',
  'services', 'team_members', 'news', 'projects',
])

function fieldsFor(collection) {
  // Alias fields aren't matched by `['*']` in Directus 11 — list explicitly.
  return COLLECTIONS_WITH_TRANSLATIONS.has(collection) ? ['*', 'translations'] : ['*']
}

async function ensurePublicPermissions(collections) {
  console.log('\n📌 Public read permissions')
  const policyId = await getPublicPolicyId()
  const existing = await req(
    'GET',
    `/permissions?filter[policy][_eq]=${policyId}&limit=-1`,
  )
  const byKey = new Map(existing.map(p => [`${p.collection}:${p.action}`, p]))

  for (const collection of collections) {
    const key = `${collection}:read`
    const permFilter = collection === 'news'
      ? { status: { _eq: 'published' } }
      : {}
    const fields = fieldsFor(collection)
    const cur = byKey.get(key)
    if (cur) {
      // Patch fields if missing 'translations'
      const wantsAlias = fields.includes('translations')
      const hasAlias = Array.isArray(cur.fields) && cur.fields.includes('translations')
      if (wantsAlias && !hasAlias) {
        await req('PATCH', `/permissions/${cur.id}`, { fields })
        console.log(`  ↻ ${collection}:read fields updated (+translations)`)
      } else {
        console.log(`  · ${collection}:read exists`)
      }
      continue
    }
    await req('POST', '/permissions', {
      policy: policyId,
      collection,
      action: 'read',
      permissions: permFilter,
      validation: {},
      presets: null,
      fields,
    })
    console.log(`  ✓ ${collection}:read granted`)
  }
}

async function ensurePublicCreatePermission(collection, fields) {
  console.log(`\n📌 Public create permission: ${collection}`)
  const policyId = await getPublicPolicyId()
  const existing = await req(
    'GET',
    `/permissions?filter[policy][_eq]=${policyId}&limit=-1`,
  )
  const cur = existing.find(p => p.collection === collection && p.action === 'create')
  if (cur) {
    console.log(`  · ${collection}:create exists`)
    return
  }
  await req('POST', '/permissions', {
    policy: policyId,
    collection,
    action: 'create',
    permissions: {},
    validation: {},
    presets: null,
    fields,
  })
  console.log(`  ✓ ${collection}:create granted`)
}

// ---------- TYPED FIELD HELPERS ----------
const fInput = (opts = {}) => ({ type: 'string', meta: { interface: 'input', ...opts.meta }, schema: { length: opts.length || 255, is_nullable: opts.required ? false : true } })
const fTextarea = () => ({ type: 'text', meta: { interface: 'input-multiline' }, schema: { is_nullable: true } })
const fWysiwyg = () => ({ type: 'text', meta: { interface: 'input-rich-text-html' }, schema: { is_nullable: true } })
const fSlug = () => ({ type: 'string', meta: { interface: 'input', options: { slug: true }, special: ['slug'] }, schema: { length: 255, is_unique: true, is_nullable: false } })
const fImage = () => ({ type: 'uuid', meta: { interface: 'file-image', special: ['file'] }, schema: { is_nullable: true } })
const fInt = () => ({ type: 'integer', meta: { interface: 'input' }, schema: { is_nullable: true } })
const fDate = () => ({ type: 'date', meta: { interface: 'datetime' }, schema: { is_nullable: true } })
const fDateTime = () => ({ type: 'timestamp', meta: { interface: 'datetime' }, schema: { is_nullable: true } })
const fStatus = () => ({
  type: 'string',
  meta: {
    interface: 'select-dropdown',
    options: { choices: [{ text: 'Draft', value: 'draft' }, { text: 'Published', value: 'published' }] },
  },
  schema: { length: 32, is_nullable: false, default_value: 'draft' },
})
// JSON repeater (interface "list"): editable rows of simple sub-fields, no extra collection/permissions needed
const repSub = (field, name, placeholder, width = 'half') => ({ field, name, type: 'string', meta: { field, type: 'string', interface: 'input', width, options: { placeholder } } })
const fRepeater = (addLabel, fields, note) => ({
  type: 'json',
  meta: { interface: 'list', special: ['cast-json'], note, options: { addLabel, fields } },
  schema: { is_nullable: true },
})

const fWorkflowStatus = () => ({
  type: 'string',
  meta: {
    interface: 'select-dropdown',
    width: 'half',
    note: 'Публикация: черновики и архив не видны на сайте. Публикует Reviewer/Administrator.',
    options: { choices: [
      { text: 'Черновик', value: 'draft' },
      { text: 'На проверке', value: 'review' },
      { text: 'Опубликовано', value: 'published' },
      { text: 'Архив', value: 'archived' },
    ] },
  },
  schema: { length: 32, is_nullable: false, default_value: 'draft' },
})
// ---------- SCHEMA ----------
async function buildSchema() {
  console.log('\n📌 Collections')

  // SITE SETTINGS (singleton)
  await ensureCollection('site_settings', { icon: 'settings', singleton: true })
  await ensureField('site_settings', 'logo', fImage())
  await ensureFileRelation('site_settings', 'logo')
  await ensureField('site_settings', 'address', fInput())
  await ensureField('site_settings', 'phone', fInput())
  await ensureField('site_settings', 'email', fInput())
  await ensureField('site_settings', 'instagram_url', fInput())
  await ensureField('site_settings', 'linkedin_url', fInput())
  await ensureField('site_settings', 'facebook_url', fInput())
  await ensureTranslationsField('site_settings', {
    tagline: fInput(),
    description: fTextarea(),
  })

  // PAGE HOME (singleton)
  await ensureCollection('page_home', { icon: 'home', singleton: true })
  await ensureField('page_home', 'hero_image', fImage())
  await ensureFileRelation('page_home', 'hero_image')
  await ensureField('page_home', 'cta_link', fInput())
  await ensureField('page_home', 'partners', fRepeater(
    'Добавить партнёра',
    [
      repSub('name', 'Название', 'Например: Toyota Tsusho', 'full'),
      { field: 'published', name: 'Показывать на сайте', type: 'boolean', meta: { field: 'published', type: 'boolean', interface: 'boolean', width: 'half' } },
      repSub('evidence', 'Подтверждение (ссылка/документ)', 'Договор, письмо-разрешение…'),
    ],
    'Партнёры в бегущей строке на главной. Если список пуст — сайт покажет встроенный список.',
  ))
  await ensureField('page_home', 'stats', fRepeater(
    'Добавить показатель',
    [
      repSub('value', 'Значение', 'Например: 20+', 'full'),
      repSub('label_en', 'Подпись (EN)', 'Cross-border engagements'),
      repSub('label_ru', 'Подпись (RU)', 'Трансграничных проектов'),
      { field: 'published', name: 'Показывать на сайте', type: 'boolean', meta: { field: 'published', type: 'boolean', interface: 'boolean', width: 'half' } },
      repSub('evidence', 'Подтверждение показателя', 'Источник цифры…'),
    ],
    'Цифры-достижения на главной. Если пусто — сайт покажет встроенные.',
  ))
  await ensureTranslationsField('page_home', {
    hero_title: fInput(),
    hero_subtitle: fTextarea(),
    cta_text: fInput(),
    hero_location: fInput({ meta: { width: 'half', note: 'Локация в первом экране главной (например: Ташкент · Venture Plaza)' } }),
    services_heading: fInput({ meta: { note: 'Заголовок секции «Услуги» на главной' } }),
    services_sub: fTextarea(),
    partners_heading: fInput({ meta: { note: 'Заголовок ленты партнёров на главной' } }),
  })

  // PAGE ABOUT (singleton)
  await ensureCollection('page_about', { icon: 'info', singleton: true })
  await ensureTranslationsField('page_about', {
    body: fWysiwyg(),
    mission: fTextarea(),
    vision: fTextarea(),
    hero_title: fInput({ meta: { note: 'Заголовок шапки страницы «О компании»' } }),
    hero_subtitle: fTextarea(),
    value1_title: fInput({ meta: { width: 'half', note: 'Ценность 1 — заголовок (блок из трёх колонок)' } }),
    value1_body: fTextarea(),
    value2_title: fInput({ meta: { width: 'half', note: 'Ценность 2 — заголовок' } }),
    value2_body: fTextarea(),
    value3_title: fInput({ meta: { width: 'half', note: 'Ценность 3 — заголовок' } }),
    value3_body: fTextarea(),
  })

  // PAGE CONTACT (singleton)
  await ensureCollection('page_contact', { icon: 'contact_mail', singleton: true })
  await ensureField('page_contact', 'map_embed', fTextarea())
  await ensureTranslationsField('page_contact', {
    body: fWysiwyg(),
  })

  // SERVICES
  await ensureCollection('services', { icon: 'work', sortField: 'sort' })
  await ensureField('services', 'sort', { type: 'integer', meta: { interface: 'input', hidden: true }, schema: { is_nullable: true } })
  await ensureField('services', 'slug', fSlug())
  await ensureField('services', 'status', fWorkflowStatus())
  await ensureField('services', 'icon', fInput())
  await ensureField('services', 'order', fInt())
  await ensureTranslationsField('services', {
    name: fInput(),
    short_description: fTextarea(),
    full_description: fWysiwyg(),
  })

  // TEAM MEMBERS
  await ensureCollection('team_members', { icon: 'group', sortField: 'sort' })
  await ensureField('team_members', 'sort', { type: 'integer', meta: { interface: 'input', hidden: true }, schema: { is_nullable: true } })
  await ensureField('team_members', 'slug', fSlug())
  await ensureField('team_members', 'status', fWorkflowStatus())
  await ensureField('team_members', 'photo', fImage())
  await ensureFileRelation('team_members', 'photo')
  await ensureField('team_members', 'email', fInput())
  await ensureField('team_members', 'linkedin_url', fInput())
  await ensureField('team_members', 'order', fInt())
  await ensureTranslationsField('team_members', {
    full_name: fInput(),
    position: fInput(),
    short_bio: fTextarea(),
    biography: fWysiwyg(),
  })

  // NEWS
  await ensureCollection('news', { icon: 'newspaper', archiveField: 'status', archiveValue: 'archived', unarchiveValue: 'draft' })
  await ensureField('news', 'slug', fSlug())
  await ensureField('news', 'cover', fImage())
  await ensureFileRelation('news', 'cover')
  await ensureField('news', 'published_at', fDateTime())
  await ensureField('news', 'status', fStatus())
  await ensureTranslationsField('news', {
    title: fInput(),
    excerpt: fTextarea(),
    body: fWysiwyg(),
  })

  // CONTACT SUBMISSIONS (inbox for the contact form — no public read!)
  await ensureCollection('contact_submissions', { icon: 'mail' })
  await ensureField('contact_submissions', 'status', {
    type: 'string',
    meta: {
      interface: 'select-dropdown',
      options: { choices: [{ text: 'New', value: 'new' }, { text: 'Processed', value: 'processed' }] },
    },
    schema: { length: 32, is_nullable: false, default_value: 'new' },
  })
  await ensureField('contact_submissions', 'name', fInput())
  await ensureField('contact_submissions', 'email', fInput())
  await ensureField('contact_submissions', 'company', fInput())
  await ensureField('contact_submissions', 'message', fTextarea())
  await ensureField('contact_submissions', 'support_area', fInput({ meta: { note: 'Направление поддержки (из формы)' } }))
  await ensureField('contact_submissions', 'preferred_contact', fInput({ length: 32, meta: { note: 'Предпочтительный способ связи' } }))
  await ensureField('contact_submissions', 'language', fInput({ length: 8, meta: { note: 'Язык сайта при отправке' } }))
  await ensureField('contact_submissions', 'consent_version', fInput({ length: 100, meta: { note: 'Версия Политики конфиденциальности, с которой согласился отправитель' } }))
  await ensureField('contact_submissions', 'assignee', fInput({ meta: { note: 'Ответственный за обращение' } }))
  await ensureField('contact_submissions', 'response_date', fDate())
  await ensureField('contact_submissions', 'retention_date', fDate())
  await ensureField('contact_submissions', 'date_created', {
    type: 'timestamp',
    meta: { interface: 'datetime', readonly: true, special: ['date-created'], display: 'datetime', display_options: { relative: true } },
    schema: { is_nullable: true },
  })

  // PROJECTS
  await ensureCollection('projects', { icon: 'business', sortField: 'sort' })
  await ensureField('projects', 'sort', { type: 'integer', meta: { interface: 'input', hidden: true }, schema: { is_nullable: true } })
  await ensureField('projects', 'slug', fSlug())
  await ensureField('projects', 'status', fWorkflowStatus())
  await ensureField('projects', 'client_logo', fImage())
  await ensureFileRelation('projects', 'client_logo')
  await ensureField('projects', 'hero_image', fImage())
  await ensureFileRelation('projects', 'hero_image')
  await ensureField('projects', 'period_start', fDate())
  await ensureField('projects', 'period_end', fDate())
  await ensureTranslationsField('projects', {
    name: fInput(),
    client_name: fInput(),
    summary: fTextarea(),
    description: fWysiwyg(),
  })
}

// ---------- SEED CONTENT ----------
async function seedItem(collection, filterKey, item, translationsEN, translationsRU) {
  // find existing
  const filterVal = item[filterKey]
  const found = await req('GET', `/items/${collection}?filter[${filterKey}][_eq]=${encodeURIComponent(filterVal)}&limit=1`)
  if (found.length) {
    console.log(`  · ${collection}/${filterVal} exists`)
    return found[0].id
  }
  const created = await req('POST', `/items/${collection}`, item)
  const id = created.id
  console.log(`  ✓ ${collection}/${filterVal} created (id=${id})`)
  // attach translations
  if (translationsEN) {
    await req('POST', `/items/${collection}_translations`, { [`${collection}_id`]: id, languages_code: 'en-US', ...translationsEN })
  }
  if (translationsRU) {
    await req('POST', `/items/${collection}_translations`, { [`${collection}_id`]: id, languages_code: 'ru-RU', ...translationsRU })
  }
  return id
}

async function seedSingleton(collection, item, translationsEN, translationsRU) {
  let existing = await req('GET', `/items/${collection}`)
  const isEmpty = !existing || Object.keys(existing).length === 0 || existing.id == null
  if (isEmpty) {
    await req('PATCH', `/items/${collection}`, item)
    existing = await req('GET', `/items/${collection}`)
    console.log(`  ✓ ${collection} seeded (id=${existing?.id})`)
  } else {
    console.log(`  · ${collection} already populated (id=${existing.id})`)
  }
  const sid = existing?.id
  if (sid == null) {
    console.warn(`  ! ${collection} has no id after seeding — skipping translations`)
    return
  }
  const existingTranslations = await req(
    'GET',
    `/items/${collection}_translations?filter[${collection}_id][_eq]=${sid}&limit=-1`,
  )
  const codes = new Set(existingTranslations.map(t => t.languages_code))
  if (translationsEN && !codes.has('en-US')) {
    await req('POST', `/items/${collection}_translations`, { [`${collection}_id`]: sid, languages_code: 'en-US', ...translationsEN })
    console.log(`    + ${collection} EN translation`)
  }
  if (translationsRU && !codes.has('ru-RU')) {
    await req('POST', `/items/${collection}_translations`, { [`${collection}_id`]: sid, languages_code: 'ru-RU', ...translationsRU })
    console.log(`    + ${collection} RU translation`)
  }
}

async function seedContent() {
  console.log('\n📌 Seeding content from TOR')

  // SITE SETTINGS
  await seedSingleton(
    'site_settings',
    {
      address: '56A Abdulla Kahhar Street, Ventum Plaza Business Center, Tashkent, Uzbekistan',
      phone: '+998 55 511-33-32',
      email: 'info@total-asset.uz',
    },
    { tagline: 'Boutique consulting at the intersection of strategy and execution', description: 'Total Asset Silk Road is a boutique consulting firm bridging international objectives with local delivery in Uzbekistan.' },
    { tagline: 'Бутиковый консалтинг на стыке стратегии и исполнения', description: 'Total Asset Silk Road — бутиковая консалтинговая фирма, соединяющая международные цели и локальную реализацию в Узбекистане.' },
  )

  // PAGE HOME
  await seedSingleton(
    'page_home',
    {
      cta_link: '/contact',
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
    },
    {
      hero_title: 'Strategy meets execution in Uzbekistan',
      hero_subtitle: 'A boutique consulting firm transforming complex market challenges into measurable financial success for international investors and corporate stakeholders.',
      cta_text: 'Discuss your project',
      hero_location: 'Tashkent · Venture Plaza',
      services_heading: 'Institutional discipline. Local fluency.',
      services_sub: 'One mandate: turn international intent into measurable, on-the-ground results.',
      partners_heading: 'Selected institutional partners',
    },
    {
      hero_title: 'Стратегия и исполнение в Узбекистане',
      hero_subtitle: 'Бутиковая консалтинговая фирма, превращающая сложные рыночные задачи в измеримый финансовый успех для международных инвесторов и корпоративных партнёров.',
      cta_text: 'Обсудить проект',
      hero_location: 'Ташкент · Venture Plaza',
      services_heading: 'Институциональная дисциплина. Локальная экспертиза.',
      services_sub: 'Наша цель — превратить международные намерения в измеримый результат на местах.',
      partners_heading: 'Избранные институциональные партнёры',
    },
  )

  // PAGE ABOUT
  await seedSingleton(
    'page_about',
    {},
    {
      body: '<p>Total Asset Silk Road is a boutique consulting firm operating at the intersection of strategic intent and operational reality in Uzbekistan. We specialize in transforming complex market challenges into measurable financial success for international investors and corporate stakeholders.</p><p>By bridging the gap between foreign objectives and local execution, we ensure every project is delivered with institutional-grade discipline and strategic foresight.</p>',
      mission: 'Deliver institutional-grade strategic and financial advisory that transforms foreign capital intent into measurable on-the-ground results in Uzbekistan.',
      vision: 'Become the trusted bridge between international investors and the Uzbek market — defined by analytical rigor, regulatory fluency, and disciplined execution.',
      hero_title: 'Total Asset Silk Road',
      hero_subtitle: 'Financial consulting at the intersection of strategy and execution in Uzbekistan.',
      value1_title: 'Institutional discipline',
      value1_body: 'IFRS, audit-ready reporting, governance frameworks built for sovereign-level scrutiny.',
      value2_title: 'Local fluency',
      value2_body: 'Direct lines with regulators and public stakeholders. Cultural literacy that compresses execution time.',
      value3_title: 'Outcome focus',
      value3_body: 'We measure success in delivered milestones and unblocked capital — not slides per week.',
    },
    {
      body: '<p>Total Asset Silk Road — бутиковая консалтинговая фирма, работающая на стыке стратегических намерений и операционной реальности в Узбекистане. Мы специализируемся на превращении сложных рыночных задач в измеримый финансовый успех для международных инвесторов и корпоративных партнёров.</p><p>Соединяя международные цели и локальное исполнение, мы обеспечиваем дисциплину институционального уровня и стратегическую перспективу в каждом проекте.</p>',
      mission: 'Оказывать стратегический и финансовый консалтинг институционального уровня, превращающий намерения иностранного капитала в измеримые результаты на узбекском рынке.',
      vision: 'Стать доверенным мостом между международными инвесторами и узбекским рынком — за счёт аналитической строгости, знания регуляторной среды и дисциплины исполнения.',
      hero_title: 'Total Asset Silk Road',
      hero_subtitle: 'Финансовый консалтинг на стыке стратегии и реализации в Узбекистане.',
      value1_title: 'Институциональная дисциплина',
      value1_body: 'МСФО, отчётность под аудит, корпоративное управление, выдерживающее проверку на суверенном уровне.',
      value2_title: 'Локальная экспертиза',
      value2_body: 'Прямой контакт с регуляторами и публичными стейкхолдерами. Понимание контекста, ускоряющее реализацию.',
      value3_title: 'Ориентация на результат',
      value3_body: 'Мы измеряем успех закрытыми этапами и привлечённым капиталом — а не количеством слайдов в неделю.',
    },
  )

  // PAGE CONTACT
  await seedSingleton(
    'page_contact',
    {},
    { body: '<p>Tell us about your project. We respond within one business day.</p>' },
    { body: '<p>Расскажите о вашем проекте. Мы отвечаем в течение одного рабочего дня.</p>' },
  )

  // SERVICES
  console.log('\n📌 Services')
  const services = [
    {
      slug: 'strategic-project-management', icon: 'ph:compass-tool', order: 1,
      en: { name: 'Strategic Project Management', short_description: 'Multi-party coordination, risk mitigation, and disciplined delivery tracking.', full_description: '<p>Comprehensive oversight involving multi-party coordination, risk mitigation, and disciplined delivery tracking to ensure project milestones are met on time and within budget.</p>' },
      ru: { name: 'Стратегическое управление проектами', short_description: 'Координация участников, управление рисками и дисциплинированный контроль исполнения.', full_description: '<p>Комплексное управление с координацией множества сторон, управлением рисками и строгим контролем исполнения для достижения целей проекта в срок и в рамках бюджета.</p>' },
    },
    {
      slug: 'financial-accounting-advisory', icon: 'ph:calculator', order: 2,
      en: { name: 'Financial & Accounting Advisory', short_description: 'IFRS-compliant reporting, internal controls, and audit readiness.', full_description: '<p>Provision of IFRS-compliant reporting, internal control implementation, and audit readiness to ensure total transparency for global partners.</p>' },
      ru: { name: 'Финансовый и бухгалтерский консалтинг', short_description: 'Отчётность по МСФО, внутренний контроль и готовность к аудиту.', full_description: '<p>Постановка отчётности по МСФО, внедрение внутреннего контроля и подготовка к аудиту — для полной прозрачности перед международными партнёрами.</p>' },
    },
    {
      slug: 'financial-modelling-valuation', icon: 'ph:chart-line-up', order: 3,
      en: { name: 'Financial Modelling & Valuation', short_description: 'DCF, DuPont, and scenario modelling for institutional-grade decisions.', full_description: '<p>Advanced financial analysis, including DCF and DuPont modeling, to provide the analytical depth required for sovereign-level engagement and investment decisions.</p>' },
      ru: { name: 'Финансовое моделирование и оценка', short_description: 'DCF, DuPont и сценарный анализ для решений институционального уровня.', full_description: '<p>Продвинутый финансовый анализ, включая DCF- и DuPont-моделирование, обеспечивающий аналитическую глубину для взаимодействия с суверенными контрагентами и инвестиционных решений.</p>' },
    },
    {
      slug: 'government-institutional-interface', icon: 'ph:bank', order: 4,
      en: { name: 'Government & Institutional Interface', short_description: 'Direct lines with regulators and public stakeholders.', full_description: '<p>Maintaining direct lines of communication with regulators and public stakeholders to secure necessary support for high-stakes initiatives.</p>' },
      ru: { name: 'Взаимодействие с государством', short_description: 'Прямые контакты с регуляторами и публичными стейкхолдерами.', full_description: '<p>Поддержание прямых каналов коммуникации с регуляторами и публичными стейкхолдерами для обеспечения необходимой поддержки высокоставочных инициатив.</p>' },
    },
    {
      slug: 'deal-advisory', icon: 'ph:handshake', order: 5,
      en: { name: 'Deal Advisory (M&A)', short_description: 'Strategic support across the M&A transaction lifecycle.', full_description: '<p>Strategic support for mergers, acquisitions, and partnerships, providing local fluency and international rigor throughout the transaction lifecycle.</p>' },
      ru: { name: 'Сопровождение сделок (M&A)', short_description: 'Стратегическая поддержка на всех этапах сделки.', full_description: '<p>Стратегическая поддержка слияний, поглощений и партнёрств — с глубоким пониманием локального контекста и международной строгостью на каждом этапе сделки.</p>' },
    },
  ]
  for (const s of services) {
    await seedItem(
      'services', 'slug',
      { slug: s.slug, icon: s.icon, order: s.order, sort: s.order },
      s.en, s.ru,
    )
  }

  // TEAM
  console.log('\n📌 Team')
  const team = [
    { slug: 'botir-mutalov', order: 1, en: { full_name: 'Botir Mutalov', position: 'Chief Representative', biography: '<p>Leads Total Asset Silk Road as Chief Representative, setting overall strategy and managing institutional partnerships.</p>' }, ru: { full_name: 'Ботир Муталов', position: 'Глава представительства', biography: '<p>Возглавляет Total Asset Silk Road в качестве главы представительства, определяет общую стратегию и управляет институциональными партнёрствами.</p>' } },
    { slug: 'nuriddin-khusniddinov', order: 2, en: { full_name: 'Nuriddin Khusniddinov', position: 'Corporate Governance Specialist', biography: '<p>Specializes in corporate governance frameworks and compliance with international standards.</p>' }, ru: { full_name: 'Нуриддин Хусниддинов', position: 'Специалист по корпоративному управлению', biography: '<p>Специализируется на структурах корпоративного управления и соответствии международным стандартам.</p>' } },
    { slug: 'abdulhamid-karimov', order: 3, en: { full_name: 'Abdulhamid Karimov', position: 'Financial Analysis & Project Management Specialist', biography: '<p>Combines financial analysis with hands-on project management for complex cross-border engagements.</p>' }, ru: { full_name: 'Абдулхамид Каримов', position: 'Специалист по финансовому анализу и управлению проектами', biography: '<p>Сочетает финансовый анализ с практическим управлением проектами в сложных трансграничных проектах.</p>' } },
    { slug: 'akmal-abduazizov', order: 4, en: { full_name: 'Akmal Abduazizov', position: 'Strategic Development Specialist', biography: '<p>Focuses on strategic development and market positioning for institutional clients in Central Asia.</p>' }, ru: { full_name: 'Акмаль Абдуазизов', position: 'Специалист по стратегическому развитию', biography: '<p>Сфокусирован на стратегическом развитии и позиционировании на рынке для институциональных клиентов в Центральной Азии.</p>' } },
    { slug: 'bekzod-ruzimov', order: 5, en: { full_name: 'Bekzod Ruzimov', position: 'Project Implementation Manager', biography: '<p>Manages on-the-ground project implementation, ensuring alignment between strategy and execution.</p>' }, ru: { full_name: 'Бекзод Рузимов', position: 'Менеджер по реализации проектов', biography: '<p>Управляет реализацией проектов на местах, обеспечивая согласованность стратегии и исполнения.</p>' } },
  ]
  for (const m of team) {
    await seedItem('team_members', 'slug', { slug: m.slug, order: m.order, sort: m.order }, m.en, m.ru)
  }

  // PROJECTS
  console.log('\n📌 Projects')
  const projects = [
    { slug: 'jbic', order: 1, en: { name: 'Japan Bank for International Cooperation (JBIC)', summary: 'Strategic advisor providing analytical depth for sovereign-level engagement.', description: '<p>Served as a strategic advisor providing analytical depth for sovereign-level engagement and policy reform initiatives in the region.</p>' }, ru: { name: 'Japan Bank for International Cooperation (JBIC)', summary: 'Стратегический советник, обеспечивающий аналитическую глубину для взаимодействия суверенного уровня.', description: '<p>Выступали в качестве стратегического советника, обеспечивая аналитическую глубину для взаимодействия суверенного уровня и инициатив по реформированию политики в регионе.</p>' } },
    { slug: 'una-moliya', order: 2, en: { name: 'UNA MOLIYA', summary: 'Implemented financial infrastructure and reporting frameworks.', description: '<p>Implemented financial infrastructure and reporting frameworks to meet international standards and local regulatory requirements.</p>' }, ru: { name: 'UNA MOLIYA', summary: 'Внедрение финансовой инфраструктуры и систем отчётности.', description: '<p>Внедрили финансовую инфраструктуру и системы отчётности, соответствующие международным стандартам и локальным регуляторным требованиям.</p>' } },
    { slug: 'toyota-tsusho-terauchi-litech', order: 3, en: { name: 'Toyota Tsusho & Terauchi Litech', summary: 'Market entry strategies for Japanese industrial leaders.', description: '<p>Developed market entry strategies and operational frameworks for Japanese industrial leaders entering the Uzbekistan infrastructure sector.</p>' }, ru: { name: 'Toyota Tsusho & Terauchi Litech', summary: 'Стратегии выхода на рынок для японских индустриальных лидеров.', description: '<p>Разработали стратегии выхода на рынок и операционные модели для японских индустриальных лидеров, выходящих в инфраструктурный сектор Узбекистана.</p>' } },
    { slug: 'eurus-energy-holdings', order: 4, en: { name: 'Eurus Energy Holdings', summary: 'Project governance for renewable energy initiatives.', description: '<p>Provided project governance and coordination for renewable energy initiatives, ensuring alignment between global strategy and local implementation.</p>' }, ru: { name: 'Eurus Energy Holdings', summary: 'Управление проектами в области возобновляемой энергетики.', description: '<p>Обеспечили управление проектами и координацию инициатив в области возобновляемой энергетики, согласуя глобальную стратегию с локальной реализацией.</p>' } },
  ]
  for (const p of projects) {
    await seedItem('projects', 'slug', { slug: p.slug, order: p.order, sort: p.order }, p.en, p.ru)
  }

  // NEWS — one sample article in both languages
  console.log('\n📌 News (sample)')
  await seedItem(
    'news', 'slug',
    { slug: 'welcome', status: 'published', published_at: new Date().toISOString() },
    { title: 'Welcome to Total Asset Silk Road', excerpt: 'Our boutique consulting practice in Uzbekistan opens its doors to international investors and corporate partners.', body: '<p>We are pleased to introduce Total Asset Silk Road — a boutique consulting firm dedicated to bridging international capital with local execution in Uzbekistan. Stay tuned for regular commentary on infrastructure developments, regulatory updates, and the evolving investment climate in Central Asia.</p>' },
    { title: 'Добро пожаловать в Total Asset Silk Road', excerpt: 'Наш бутиковый консалтинг в Узбекистане открывает двери для международных инвесторов и корпоративных партнёров.', body: '<p>Рады представить Total Asset Silk Road — бутиковую консалтинговую фирму, объединяющую международный капитал с локальной реализацией в Узбекистане. Следите за регулярными материалами об инфраструктурных проектах, регуляторных новостях и инвестиционном климате Центральной Азии.</p>' },
  )
}

// ---------- MAIN ----------
async function main() {
  await login()
  await ensureLanguages()
  await buildSchema()
  await ensurePublicPermissions([
    'site_settings', 'site_settings_translations',
    'page_home', 'page_home_translations',
    'page_about', 'page_about_translations',
    'page_contact', 'page_contact_translations',
    'services', 'services_translations',
    'team_members', 'team_members_translations',
    'news', 'news_translations',
    'projects', 'projects_translations',
    'languages',
  ])
  // Contact form writes directly (via the Nuxt server route) — create only, no read.
  await ensurePublicCreatePermission('contact_submissions', ['name', 'email', 'company', 'message', 'support_area', 'preferred_contact', 'language', 'consent_version'])
  await seedContent()
  console.log('\n✅ Seed complete')
}

main().catch(err => {
  console.error('\n❌', err)
  process.exit(1)
})
