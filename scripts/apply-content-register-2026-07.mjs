#!/usr/bin/env node
/**
 * Applies the approved "Website Content Revision Register" (12 July 2026,
 * items C-01…C-31) to a live Directus instance:
 *
 *   - site_settings: new positioning tagline/description, Ventum Plaza address
 *   - page_home: new hero, services intro, CTA label
 *   - page_about: new body, mission, vision, hero subtitle, three principles
 *   - services: REPLACES the six old services with the five consolidated ones
 *     (old URLs 301-redirect to the new slugs in the frontend)
 *   - projects: replaces the four public summaries with the approved wording
 *   - team: approved roles/bios, removes the personal Gmail from a public bio
 *   - news: replaces the welcome article with the approved positioning text
 *   - page_contact: removes the duplicated intro
 *   - grants the Public role CREATE on contact_submissions (form delivery)
 *
 * This OVERWRITES the listed fields (unlike backfill-cms-texts.mjs). Run once:
 *
 *   DIRECTUS_URL=https://total-asset-back-production.up.railway.app \
 *   DIRECTUS_ADMIN_EMAIL=... DIRECTUS_ADMIN_PASSWORD=... \
 *   node scripts/apply-content-register-2026-07.mjs
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

async function patchTranslations(collection, wantedByLang) {
  const items = await req('GET', `/items/${collection}_translations?limit=-1&fields=id,languages_code`)
  for (const t of items) {
    const wanted = wantedByLang[t.languages_code]
    if (!wanted) continue
    await req('PATCH', `/items/${collection}_translations/${t.id}`, wanted)
    console.log(`  ✓ ${collection} ${t.languages_code}`)
  }
}

// ---------------------------------------------------------------- content

const SITE_SETTINGS = {
  root: {
    address: '56A Abdulla Kahhar Street, Ventum Plaza Business Center, Tashkent, Uzbekistan', // C-05
  },
  tr: {
    'en-US': {
      tagline: 'Strategic advisory and project execution support', // C-01
      description: 'Total Asset Silk Road is an Uzbekistan-based advisory firm supporting international investors, financial institutions, and corporate clients with market entry, project structuring, financial analysis, stakeholder engagement, and transaction execution.',
    },
    'ru-RU': {
      tagline: 'Стратегический консалтинг и сопровождение реализации проектов',
      description: 'Total Asset Silk Road — узбекская стратегическая консалтинговая компания, сопровождающая международных инвесторов, финансовые институты и корпоративных клиентов при выходе на рынок, структурировании проектов, финансовом анализе, взаимодействии со стейкхолдерами и реализации сделок.',
    },
  },
}

const PAGE_HOME_TR = {
  'en-US': {
    hero_title: 'From strategy to execution in Uzbekistan', // C-03
    hero_subtitle: 'We support international investors, financial institutions, and corporate clients with market entry, project structuring, financial modelling, stakeholder engagement, and transaction execution.',
    cta_text: 'Discuss a project', // C-04
    hero_location: 'Tashkent · Ventum Plaza', // C-05
    services_heading: 'Integrated decision and execution support.', // C-08
    services_sub: 'Five connected capabilities covering the journey from analysis and structuring to local coordination and delivery.',
    partners_heading: 'Selected experience and engagements', // C-06
  },
  'ru-RU': {
    hero_title: 'От стратегии к реализации в Узбекистане',
    hero_subtitle: 'Мы сопровождаем международных инвесторов, финансовые институты и корпоративных клиентов при выходе на рынок, структурировании проектов, финансовом моделировании, взаимодействии со стейкхолдерами и реализации сделок.',
    cta_text: 'Обсудить проект',
    hero_location: 'Ташкент · Ventum Plaza',
    services_heading: 'Комплексная поддержка принятия решений и реализации.',
    services_sub: 'Пять взаимосвязанных направлений, охватывающих путь от анализа и структурирования до локальной координации и исполнения.',
    partners_heading: 'Избранный опыт и взаимодействие',
  },
}

const PAGE_ABOUT_TR = {
  'en-US': {
    body: '<p>Total Asset Silk Road is a strategic advisory firm established in Tashkent in 2022. We help international investors, financial institutions, and corporate clients make informed decisions and deliver projects in Uzbekistan.</p><p>Our work combines financial analysis, market and regulatory insight, project governance, local coordination, and transaction execution. We define the role, deliverables, and limitations of each engagement clearly and involve appropriately licensed specialists where required by law.</p>', // C-15
    mission: 'To improve the quality of investment and management decisions and support practical project delivery in Uzbekistan through independent analysis, local expertise, and accountable execution support.', // C-16
    vision: 'To be the trusted local adviser for international and Uzbek organisations that require analytical rigour, transparent coordination, and dependable execution support.', // C-17
    hero_subtitle: 'Strategic advisory and project execution support in Uzbekistan.',
    value1_title: 'Analytical rigour', // C-18
    value1_body: 'Conclusions are based on verifiable data, transparent assumptions, and clear methodology.',
    value2_title: 'Local execution',
    value2_body: 'We translate strategy into actions, accountability, and milestones.',
    value3_title: 'Integrity and independence',
    value3_body: 'We comply with law, confidentiality, and compliance requirements and state analytical limitations clearly.',
  },
  'ru-RU': {
    body: '<p>Total Asset Silk Road — стратегическая консалтинговая компания, основанная в Ташкенте в 2022 году. Мы помогаем международным инвесторам, финансовым институтам и корпоративным клиентам принимать обоснованные решения и реализовывать проекты в Узбекистане.</p><p>Наша работа объединяет финансовый анализ, рыночную и регуляторную экспертизу, проектное управление, локальную координацию и сопровождение сделок. Мы чётко определяем роль, результат и ограничения каждого задания и привлекаем профильных лицензированных специалистов там, где этого требует законодательство.</p>',
    mission: 'Повышать качество инвестиционных и управленческих решений и обеспечивать практическую реализацию проектов на рынке Узбекистана посредством независимого анализа, локальной экспертизы и ответственного сопровождения.',
    vision: 'Стать доверенным локальным консультантом для международных и узбекских организаций, которым необходимы аналитическая точность, прозрачная координация и надёжное сопровождение реализации.',
    hero_subtitle: 'Стратегический консалтинг и сопровождение реализации проектов в Узбекистане.',
    value1_title: 'Аналитическая точность',
    value1_body: 'Выводы основаны на проверяемых данных, прозрачных допущениях и понятной методологии.',
    value2_title: 'Локальная реализация',
    value2_body: 'Мы переводим стратегию в конкретные действия, ответственность и контрольные точки.',
    value3_title: 'Добросовестность и независимость',
    value3_body: 'Соблюдаем закон, конфиденциальность и комплаенс и прямо раскрываем ограничения анализа.',
  },
}

// C-09…C-13 — the consolidated five services (replaces the old six; the
// frontend 301-redirects the old slugs).
const NEW_SERVICES = [
  {
    slug: 'financial-advisory-modelling', icon: 'ph:chart-line-up', order: 1,
    en: {
      name: 'Financial Advisory & Modelling',
      short_description: 'Financial models, valuation, investment analysis, and decision support for investors, lenders, and management.',
      full_description: '<p>We build and review integrated financial models, project-finance models, scenarios and sensitivities, business and asset valuations, debt-capacity and bankability analyses, and management and IFRS-oriented reporting.</p><p>These services do not constitute a statutory audit, credit decision, or guarantee of financing.</p>',
    },
    ru: {
      name: 'Финансовый консалтинг и моделирование',
      short_description: 'Финансовые модели, оценка, инвестиционный анализ и подготовка решений для инвесторов, кредиторов и руководства.',
      full_description: '<p>Мы разрабатываем и проверяем интегрированные финансовые модели, модели проектного финансирования, сценарный и чувствительный анализ, оценку бизнеса и активов, анализ долговой нагрузки и банковской приемлемости, а также управленческую и МСФО-ориентированную отчётность.</p><p>Услуги не являются обязательным аудитом, кредитным решением или гарантией привлечения финансирования.</p>',
    },
  },
  {
    slug: 'board-c-suite-advisory', icon: 'ph:strategy', order: 2,
    en: {
      name: 'Board & C-Suite Advisory',
      short_description: 'Strategy, governance, PMO, and execution oversight for owners and senior management.',
      full_description: '<p>We support objective setting, allocation of authority, key decisions, risk management, performance improvement, and monitoring of strategic initiatives.</p><p>The outcome is clear accountability, decisions supported by explicit assumptions, and a controlled delivery plan.</p>',
    },
    ru: {
      name: 'Консалтинг для совета директоров и руководства',
      short_description: 'Стратегия, корпоративное управление, PMO и контроль реализации для собственников и руководителей.',
      full_description: '<p>Мы поддерживаем постановку целей, распределение полномочий, принятие ключевых решений, управление рисками, повышение эффективности и мониторинг стратегических инициатив.</p><p>Результатом являются понятная система ответственности, решения с обоснованными допущениями и контролируемый план реализации.</p>',
    },
  },
  {
    slug: 'market-entry-commercial-advisory', icon: 'ph:globe-hemisphere-east', order: 3,
    en: {
      name: 'Market Entry & Commercial Advisory',
      short_description: 'Market research, entry strategy, commercial modelling, partner and supplier selection, localisation, and procedural coordination.',
      full_description: '<p>We help assess demand, competition, regulatory constraints, sales channels, cost structure, and practical launch requirements.</p><p>Customs, certification, legal, and other regulated activities are performed by appropriately qualified providers, while Total Asset Silk Road coordinates and manages the process.</p>',
    },
    ru: {
      name: 'Выход на рынок и коммерческий консалтинг',
      short_description: 'Исследование рынка, стратегия входа, коммерческая модель, подбор партнёров и поставщиков, локализация и координация процедур.',
      full_description: '<p>Мы помогаем оценить спрос, конкуренцию, регуляторные ограничения, каналы продаж, структуру затрат и практические требования к запуску.</p><p>Таможенные, сертификационные, юридические и иные регулируемые действия выполняются соответствующими квалифицированными организациями, а Total Asset Silk Road обеспечивает координацию и управление процессом.</p>',
    },
  },
  {
    slug: 'representation-deal-execution', icon: 'ph:handshake', order: 4,
    en: {
      name: 'Representation & Deal Execution',
      short_description: 'Regulatory analysis, official stakeholder engagement, negotiations, due diligence, and delivery of agreed actions.',
      full_description: '<p>Regulatory analysis, preparation of meetings and materials, coordination of official submissions, negotiations, due diligence, and implementation of agreed actions.</p><p>Engagement with public authorities is conducted solely through established procedures and compliance requirements and does not imply informal influence or a guaranteed decision.</p>',
    },
    ru: {
      name: 'Локальное представительство и сопровождение сделок',
      short_description: 'Регуляторный анализ, подготовка встреч и материалов, координация официальных обращений, переговоров, due diligence и исполнения договорённостей.',
      full_description: '<p>Регуляторный анализ, подготовка встреч и материалов, координация официальных обращений, переговоров, due diligence и исполнения договорённостей.</p><p>Работа с государственными органами ведётся исключительно в соответствии с установленными процедурами и требованиями комплаенса; услуга не предполагает неформального влияния или гарантированного решения.</p>',
    },
  },
  {
    slug: 'client-acquisition-business-development', icon: 'ph:users-three', order: 5,
    en: {
      name: 'Client Acquisition & Business Development',
      short_description: 'Target-segment analysis, value-proposition development, channel building, lead qualification, and support for institutional partnerships.',
      full_description: '<p>Target-segment analysis, value-proposition development, channel building, lead qualification, and support for institutional partnerships.</p><p>We help create a controlled pipeline from target identification to negotiation coordination and handover of a validated opportunity to the responsible transaction party.</p>',
    },
    ru: {
      name: 'Привлечение клиентов и развитие бизнеса',
      short_description: 'Анализ целевых сегментов, формирование коммерческого предложения, развитие каналов, квалификация потенциальных клиентов и сопровождение институциональных партнёрств.',
      full_description: '<p>Анализ целевых сегментов, формирование коммерческого предложения, развитие каналов, квалификация потенциальных клиентов и сопровождение институциональных партнёрств.</p><p>Мы помогаем выстроить управляемый pipeline от определения целевой аудитории до координации переговоров и передачи подтверждённой возможности ответственному участнику сделки.</p>',
    },
  },
]

// C-20…C-23 — approved public engagement summaries
const PROJECT_SUMMARIES = {
  'jbic': {
    'en-US': { summary: 'Local analytical and coordination support relating to Uzbekistan’s investment and economic agenda. Support includes structured information gathering, analytical materials, meeting and communication coordination, language support, and periodic reporting. The public description is limited to non-confidential aspects of the engagement.' },
    'ru-RU': { summary: 'Локальная аналитическая и координационная поддержка по вопросам инвестиционной и экономической повестки Узбекистана. Объём поддержки включает сбор и структурирование информации, подготовку аналитических материалов, координацию встреч и коммуникаций, переводческое сопровождение и периодическую отчётность. Публичное описание ограничено неконфиденциальной частью задания.' },
  },
  'una-moliya': {
    'en-US': { summary: 'Advisory support for financial management and reporting. The work focused on structuring management processes, financial analysis, reporting, and elements of internal control in line with management needs and applicable local requirements. The services did not constitute a statutory audit or regulatory assurance.' },
    'ru-RU': { summary: 'Консультационная поддержка развития финансового управления и отчётности. Работа была направлена на структурирование управленческих процессов, финансового анализа, отчётности и элементов внутреннего контроля с учётом потребностей руководства и применимых локальных требований. Услуги не являлись обязательным аудитом или регуляторным заключением.' },
  },
  'toyota-tsusho-terauchi-litech': {
    'en-US': { summary: 'Analytical and coordination support for Japanese industrial companies evaluating opportunities in Uzbekistan. The work included market and regulatory assessment, evaluation of entry options, coordination of potential partners, and consideration of the operating model.' },
    'ru-RU': { summary: 'Аналитическая и координационная поддержка японских промышленных компаний, рассматривающих возможности на рынке Узбекистана. Работа включала анализ рынка и применимых требований, оценку вариантов присутствия, координацию потенциальных партнёров и обсуждение операционной модели.' },
  },
  'eurus-energy-holdings': {
    'en-US': { summary: 'Project coordination and local advisory support for renewable-energy initiatives in Uzbekistan. The scope included participant coordination, document review and control, action tracking, and support for local communications.' },
    'ru-RU': { summary: 'Проектная координация и локальная консультационная поддержка инициатив в области возобновляемой энергетики в Узбекистане. Объём работ включал координацию участников, анализ и контроль документов, мониторинг задач и поддержку локальных коммуникаций.' },
  },
}

// C-25…C-28 — approved roles/bios (instructional sentences from the register
// are intentionally NOT published).
const TEAM = {
  'botir-mutalov': {
    root: {},
    tr: {
      'en-US': {
        position: 'Founder & Managing Partner',
        biography: '<p>Botir Mutalov sets the strategy of Total Asset Silk Road and leads key client and institutional relationships. He has more than 13 years of experience in project development, infrastructure, public-private partnerships, financial operations, and business development in Uzbekistan and Japan.</p><p>Before founding Total Asset Silk Road, he held management and specialist roles at Rhythm Plus Consulting, Mitsubishi Corporation, Morgan Stanley MUFG Securities, and State Street Trust & Banking. His work focuses on structuring complex projects, financial analysis, market entry, and coordination of international stakeholders.</p>',
      },
      'ru-RU': {
        position: 'Основатель и управляющий партнёр',
        biography: '<p>Ботир Муталов определяет стратегию Total Asset Silk Road и руководит развитием ключевых клиентских и институциональных отношений. Он обладает более чем 13-летним опытом в проектном развитии, инфраструктуре, государственно-частном партнёрстве, финансовых операциях и развитии бизнеса в Узбекистане и Японии.</p><p>До основания Total Asset Silk Road занимал руководящие и экспертные позиции в Rhythm Plus Consulting, Mitsubishi Corporation, Morgan Stanley MUFG Securities и State Street Trust & Banking. Его работа сосредоточена на структурировании сложных проектов, финансовом анализе, выходе на рынок и координации международных участников.</p>',
      },
    },
  },
  'nuriddin-khusniddinov': {
    root: {},
    tr: {
      'en-US': { biography: '<p>Nuriddin Khusniddinov supports corporate-governance and compliance engagements. His work includes governance frameworks, allocation of authority, internal policies, and translation of international-standard requirements into practical management processes.</p>' },
      'ru-RU': { biography: '<p>Нуриддин Хусниддинов поддерживает проекты в области корпоративного управления и комплаенса. Его работа включает разработку структур управления, распределение полномочий, подготовку внутренних политик и перевод требований международных стандартов в практические управленческие процессы.</p>' },
    },
  },
  'abdulhamid-karimov': {
    root: { email: 'info@total-asset.uz' }, // C-27: remove personal Gmail from the public site
    tr: {
      'en-US': { biography: '<p>Abdulhamid Karimov supports financial analysis and project management in cross-border engagements. His work includes financial modelling, data analysis, workplan coordination, schedule monitoring, and preparation of management materials.</p>' },
      'ru-RU': { biography: '<p>Абдулхамид Каримов поддерживает финансовый анализ и управление проектами в рамках трансграничных заданий. Его работа включает финансовое моделирование, анализ данных, координацию рабочих планов, мониторинг сроков и подготовку управленческих материалов.</p>' },
    },
  },
  'akmal-abduazizov': {
    root: {},
    tr: {
      'en-US': { biography: '<p>Akmal Abduazizov supports strategic-development and market-positioning engagements for corporate and institutional clients in Central Asia. His work includes market assessment, growth initiatives, and stakeholder coordination.</p>' },
      'ru-RU': { biography: '<p>Акмаль Абдуазизов поддерживает проекты в области стратегического развития и рыночного позиционирования для корпоративных и институциональных клиентов в Центральной Азии. Его работа включает оценку рынка, разработку инициатив роста и координацию стейкхолдеров.</p>' },
    },
  },
}

// C-30 — first article
const NEWS_WELCOME = {
  'en-US': {
    title: 'Total Asset Silk Road: strategic advisory and execution support in Uzbekistan',
    excerpt: 'Total Asset Silk Road supports international investors, financial institutions, and corporate clients in making decisions and delivering projects in Uzbekistan.',
    body: '<p>Total Asset Silk Road supports international investors, financial institutions, and corporate clients in making decisions and delivering projects in Uzbekistan.</p><p>Our insights will cover financial modelling, market entry, investment and regulatory analysis, corporate governance, and practical project execution. Each publication reflects a general professional perspective and does not replace advice based on specific circumstances.</p>',
  },
  'ru-RU': {
    title: 'Total Asset Silk Road: стратегический консалтинг и сопровождение реализации в Узбекистане',
    excerpt: 'Total Asset Silk Road поддерживает международных инвесторов, финансовые институты и корпоративных клиентов при принятии решений и реализации проектов в Узбекистане.',
    body: '<p>Total Asset Silk Road поддерживает международных инвесторов, финансовые институты и корпоративных клиентов при принятии решений и реализации проектов в Узбекистане.</p><p>Наши материалы будут посвящены финансовому моделированию, выходу на рынок, инвестиционному и регуляторному анализу, корпоративному управлению и практическим вопросам исполнения проектов. Каждая публикация отражает общую профессиональную позицию и не заменяет консультацию с учётом конкретных обстоятельств.</p>',
  },
}

// C-31 — contact page intro without the duplicate
// The intro line lives in the page hero (i18n contact.subtitle); the CMS body
// is cleared so the sentence does not appear twice on the page.
const PAGE_CONTACT_TR = {
  'en-US': { body: '' },
  'ru-RU': { body: '' },
}

// ---------------------------------------------------------------- apply

async function applyServices() {
  console.log('services (C-09…C-14):')
  const existing = await req('GET', '/items/services?limit=-1&fields=id,slug')
  const bySlug = new Map(existing.map(s => [s.slug, s.id]))

  for (const svc of NEW_SERVICES) {
    if (bySlug.has(svc.slug)) {
      console.log(`  = ${svc.slug} already exists`)
      continue
    }
    await req('POST', '/items/services', {
      slug: svc.slug,
      icon: svc.icon,
      order: svc.order,
      translations: [
        { languages_code: 'en-US', ...svc.en },
        { languages_code: 'ru-RU', ...svc.ru },
      ],
    })
    console.log(`  ✓ created ${svc.slug}`)
  }

  const newSlugs = new Set(NEW_SERVICES.map(s => s.slug))
  for (const s of existing) {
    if (newSlugs.has(s.slug)) continue
    await req('DELETE', `/items/services/${s.id}`)
    console.log(`  ✗ removed old service ${s.slug}`)
  }
}

async function applyProjects() {
  console.log('projects (C-20…C-23):')
  const items = await req('GET', '/items/projects?limit=-1&fields=id,slug,translations.id,translations.languages_code')
  for (const p of items) {
    const wanted = PROJECT_SUMMARIES[p.slug]
    if (!wanted) continue
    for (const tr of p.translations) {
      const w = wanted[tr.languages_code]
      if (!w) continue
      // The approved wording replaces BOTH the card summary and the detail-page
      // body — the old descriptions carried the exact claims the register removes.
      await req('PATCH', `/items/projects_translations/${tr.id}`, {
        ...w,
        description: `<p>${w.summary}</p>`,
      })
    }
    console.log(`  ✓ ${p.slug} (summary + page description)`)
  }
}

async function applyTeam() {
  console.log('team (C-25…C-28):')
  const items = await req('GET', '/items/team_members?limit=-1&fields=id,slug,email,translations.id,translations.languages_code')
  for (const m of items) {
    const wanted = TEAM[m.slug]
    if (!wanted) continue
    if (Object.keys(wanted.root).length) {
      await req('PATCH', `/items/team_members/${m.id}`, wanted.root)
    }
    for (const tr of m.translations) {
      const w = wanted.tr[tr.languages_code]
      if (!w) continue
      await req('PATCH', `/items/team_members_translations/${tr.id}`, w)
    }
    console.log(`  ✓ ${m.slug}`)
  }
}

async function applyNews() {
  console.log('news (C-30):')
  const items = await req('GET', "/items/news?limit=1&filter[slug][_eq]=welcome&fields=id,translations.id,translations.languages_code")
  const welcome = items[0]
  if (!welcome) { console.log('  = welcome article not found, skipping'); return }
  for (const tr of welcome.translations) {
    const w = NEWS_WELCOME[tr.languages_code]
    if (!w) continue
    await req('PATCH', `/items/news_translations/${tr.id}`, w)
  }
  console.log('  ✓ welcome')
}

async function ensureContactCreatePermission() {
  console.log('public create permission for contact_submissions (T-15):')
  const policies = await req('GET', '/policies?limit=-1')
  const pub = policies.find(p => !p.admin_access && !p.app_access)
  if (!pub) throw new Error('Public policy not found')
  const FIELDS = ['name', 'email', 'company', 'support_area', 'preferred_contact', 'message', 'language', 'consent_version']
  const perms = await req('GET', `/permissions?filter[policy][_eq]=${pub.id}&filter[collection][_eq]=contact_submissions&limit=-1`)
  const existing = perms.find(p => p.action === 'create')
  if (existing) {
    const merged = Array.from(new Set([...(existing.fields || []), ...FIELDS]))
    await req('PATCH', `/permissions/${existing.id}`, { fields: merged })
    console.log('  ✓ existing create permission extended to all form fields')
    return
  }
  await req('POST', '/permissions', {
    policy: pub.id,
    collection: 'contact_submissions',
    action: 'create',
    permissions: {},
    validation: {},
    presets: null,
    fields: FIELDS,
  })
  console.log('  ✓ granted (create only, no read)')
}

async function main() {
  await login()
  console.log(`Connected to ${DIRECTUS_URL}\n`)

  console.log('site_settings (C-01, C-05):')
  await req('PATCH', '/items/site_settings', SITE_SETTINGS.root)
  await patchTranslations('site_settings', SITE_SETTINGS.tr)

  console.log('page_home (C-03…C-08):')
  await patchTranslations('page_home', PAGE_HOME_TR)

  console.log('page_about (C-15…C-18):')
  await patchTranslations('page_about', PAGE_ABOUT_TR)

  console.log('page_contact (C-31):')
  await patchTranslations('page_contact', PAGE_CONTACT_TR)

  await applyServices()
  await applyProjects()
  await applyTeam()
  await applyNews()
  await ensureContactCreatePermission()

  console.log('\n✅ Content register applied.')
}

main().catch((e) => { console.error(e); process.exit(1) })
