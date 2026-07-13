#!/usr/bin/env python3
"""Acceptance check: content register C-01…C-37 against the live site."""
import ssl, urllib.request, re, sys

V = 'https://total-asset-front.vercel.app'
B = 'https://total-asset-back-production.up.railway.app'
ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE

cache = {}
import html as _html
def get(url):
    if url not in cache:
        req = urllib.request.Request(url, headers={'User-Agent': 'acceptance-check', 'Accept': 'text/html'})
        raw = urllib.request.urlopen(req, context=ctx, timeout=30).read().decode('utf-8', 'replace')
        cache[url] = _html.unescape(raw)
    return cache[url]

def status_of(url):
    req = urllib.request.Request(url, headers={'Accept': 'text/html'}, method='HEAD')
    try:
        return urllib.request.urlopen(req, context=ctx, timeout=30).status
    except urllib.error.HTTPError as e:
        return e.code

results = []
def check(cid, desc, ok):
    results.append((cid, desc, bool(ok)))

home = get(V + '/'); home_ru = get(V + '/ru')
about = get(V + '/about'); about_ru = get(V + '/ru/about')
projects = get(V + '/projects'); projects_ru = get(V + '/ru/projects')
team = get(V + '/team'); team_ru = get(V + '/ru/team')
news = get(V + '/news'); news_ru = get(V + '/ru/news')
contact = get(V + '/contact'); contact_ru = get(V + '/ru/contact')

# C-01 tagline/description (API) + footer tagline
ss = get(B + '/items/site_settings?fields=translations.tagline,translations.description,translations.languages_code,address')
check('C-01', 'позиционирование в Site Settings + футер',
      'Strategic advisory and project execution support' in ss
      and 'Стратегический консалтинг и сопровождение реализации проектов' in ss
      and 'Стратегический консалтинг' in home_ru and 'Финансовый консалтинг · Ташкент' not in home_ru and 'финансовая консалтинговая фирма' not in home_ru)
check('C-02', 'hero eyebrow', 'Strategic Advisory · Tashkent' in home and 'Стратегический консалтинг · Ташкент' in home_ru)
check('C-03', 'H1 + подзаголовок', 'From strategy to execution in Uzbekistan' in home
      and 'От стратегии к реализации в Узбекистане' in home_ru
      and 'measurable financial success' not in home and 'измеримый финансовый успех' not in home_ru)
check('C-04', 'CTA текст + RU-ссылка', 'Discuss a project' in home and 'href="/ru/contact"' in home_ru and 'Обсудить проект' in home_ru)
check('C-05', 'Ventum Plaza везде, Venture нигде',
      all('Ventum Plaza' in p for p in (home, home_ru, contact)) and all('Venture Plaza' not in p for p in (home, home_ru, contact, about)))
check('C-06', 'блок организаций + оговорка',
      'Selected experience and engagements' in home and 'do not imply endorsement, partnership, or affiliation' in home
      and 'Избранный опыт и взаимодействие' in home_ru and 'не означают одобрения' in home_ru)
check('C-08', 'введение в услуги', 'Integrated decision and execution support' in home
      and 'Five connected capabilities' in home and 'Комплексная поддержка принятия решений' in home_ru)

svc = {
  'financial-advisory-modelling': ('Financial Advisory & Modelling', 'statutory audit, credit decision, or guarantee of financing'),
  'board-c-suite-advisory': ('Board & C-Suite Advisory', 'clear accountability'),
  'market-entry-commercial-advisory': ('Market Entry & Commercial Advisory', 'appropriately qualified providers'),
  'representation-deal-execution': ('Representation & Deal Execution', 'does not imply informal influence or a guaranteed decision'),
  'client-acquisition-business-development': ('Client Acquisition & Business Development', 'controlled pipeline'),
}
ok_all = True
for slug, (name, marker) in svc.items():
    page = get(f'{V}/services/{slug}')
    if name not in page or marker not in page:
        ok_all = False
check('C-09…C-13', '5 услуг: названия + дисклеймеры на страницах', ok_all and all(n in home for n, _ in svc.values()))
check('C-14', 'микрофинансирование → сектора + редирект',
      'Financial Institutions, Microfinance & Leasing' in home and 'does not accept deposits' in home
      and status_of(V + '/services/microfinancing') in (301, 308, 200)
      and 'Финансовые институты, микрофинансирование и лизинг' in home_ru)
check('C-15', 'About вступление', 'established in Tashkent in 2022' in about and 'основанная в Ташкенте в 2022' in about_ru)
check('C-16', 'миссия', 'To improve the quality of investment and management decisions' in about
      and 'Повышать качество инвестиционных и управленческих решений' in about_ru)
check('C-17', 'видение', 'To be the trusted local adviser' in about and 'Стать доверенным локальным консультантом' in about_ru)
check('C-18', 'три принципа', all(x in about for x in ('Analytical rigour', 'Local execution', 'Integrity and independence'))
      and all(x in about_ru for x in ('Аналитическая точность', 'Локальная реализация', 'Добросовестность и независимость'))
      and 'Institutional discipline' not in about)
check('C-19', 'проекты: заголовок + оговорка', 'Selected experience' in projects
      and 'do not imply endorsement or affiliation' in projects and 'Избранный опыт' in projects_ru
      and 'Reference Projects' not in projects)

prj = {
  'jbic': ('Local analytical and coordination support', 'sovereign-level'),
  'una-moliya': ('Advisory support for financial management and reporting', 'Implemented financial infrastructure'),
  'toyota-tsusho-terauchi-litech': ('Analytical and coordination support for Japanese industrial companies', 'Developed market entry strategies'),
  'eurus-energy-holdings': ('Project coordination and local advisory support', 'ensuring alignment between global strategy'),
}
ok_all = True; bad = []
for slug, (new, old) in prj.items():
    page = get(f'{V}/projects/{slug}')
    if new not in page or old in page:
        ok_all = False; bad.append(slug)
check('C-20…C-23', f'кейсы: новые тексты, старых нет {"" if ok_all else bad}', ok_all)
check('C-24', 'команда: вступление', 'A multidisciplinary team with experience' in team and 'Междисциплинарная команда' in team_ru)

botir = get(V + '/team/botir-mutalov'); botir_ru = get(V + '/ru/team/botir-mutalov')
check('C-25', 'Ботир: должность + био + имя',
      'Botir Mutalov' in botir and 'Founder' in botir and 'Managing Partner' in botir and 'Rhythm Plus' in botir
      and 'Chief Representative' not in botir and 'Ботир Муталов' in botir_ru and 'Основатель и управляющий партнёр' in botir_ru)
nur = get(V + '/team/nuriddin-khusniddinov')
check('C-26', 'Нуриддин: новая био', 'corporate-governance and compliance engagements' in nur and 'must be added before publication' not in nur)
abd = get(V + '/team/abdulhamid-karimov')
check('C-27', 'Абдулхамид: био + без Gmail', 'financial analysis and project management in cross-border engagements' in abd
      and 'gmail.com' not in abd and 'info@total-asset.uz' in abd)
akm = get(V + '/team/akmal-abduazizov')
check('C-28', 'Акмаль: новая био', 'strategic-development and market-positioning engagements' in akm)
check('C-29', 'News → Insights/Аналитика', '>Insights<' in home and 'Аналитика' in home_ru
      and 'Practical analysis of investment' in news and 'Практическая аналитика по инвестициям' in news_ru)
welcome = get(V + '/news/welcome')
check('C-30', 'welcome-статья', 'strategic advisory and execution support in Uzbekistan' in welcome
      and 'does not replace advice based on specific circumstances' in welcome)
check('C-31', 'контакты: без дубля + SLA', 'Briefly describe your organisation' in contact
      and 'We generally acknowledge receipt' in contact and 'Расскажите о вашем проекте' not in contact_ru
      and 'Tell us about your project' not in contact)
check('C-32', 'форма: направление + способ связи', 'Support area' in contact and 'Preferred contact method' in contact
      and contact.count('<select') == 2 and 'Направление поддержки' in contact_ru)
check('C-33', 'форма: согласие', 'I have read the' in contact and 'consent to TOTAL ASSET SILK ROAD LLC processing' in contact
      and 'даю согласие ООО' in contact_ru and 'type="checkbox"' in contact)
check('C-34', 'форма: предупреждение', 'Do not submit state secrets' in contact and 'Не направляйте через публичную форму' in contact_ru)
check('C-35', 'футер: реквизиты', 'TIN 309373012' in home and 'established 14 March 2022' in home
      and 'STIR/ИНН 309373012' in home_ru and 'зарегистрировано 14.03.2022' in home_ru)
check('C-36', 'футер: 4 юрссылки', all(f'/legal/{s}' in home for s in ('privacy-policy', 'legal-notice', 'compliance', 'cookie-notice')))
check('C-37', 'соцблок скрыт', 'Follow us</div>' not in home and 'Мы в соцсетях</div>' not in home_ru and '>—<' not in home)

fails = [r for r in results if not r[2]]
for cid, desc, ok in results:
    print(f'{"✅" if ok else "❌"} {cid}: {desc}')
print(f'\n{len(results) - len(fails)}/{len(results)} passed')
sys.exit(1 if fails else 0)
