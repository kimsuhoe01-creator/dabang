import fs from 'node:fs';
import crypto from 'node:crypto';

const DATA_PATH = 'data/cukcuk-menu.json';
const CACHE_PATH = 'data/translation-cache.json';
const LANGUAGES = ['ko', 'vi', 'zh', 'en'];
const MODEL = process.env.OPENAI_TRANSLATION_MODEL || 'gpt-5.6-terra';
const API_KEY = process.env.OPENAI_API_KEY || '';
const BATCH_SIZE = 24;

const published = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
let cache = { version: 1, items: {} };
try {
  cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
} catch {}
if (!cache || typeof cache !== 'object') cache = { version: 1, items: {} };
if (!cache.items || typeof cache.items !== 'object') cache.items = {};

const entities = [];
function cleanNames(names = {}) {
  return Object.fromEntries(LANGUAGES.map(code => [code, String(names?.[code] || '').replace(/\s+/g, ' ').trim()]));
}
function entityFingerprint(entity) {
  return crypto.createHash('sha256').update(JSON.stringify({ sourceName: entity.sourceName, names: entity.currentNames })).digest('hex');
}
function addEntity(key, kind, sourceName, names, apply) {
  const currentNames = cleanNames(names);
  const source = String(sourceName || currentNames.ko || currentNames.en || '').replace(/\s+/g, ' ').trim();
  if (!source) return;
  entities.push({ key, kind, sourceName: source, currentNames, apply });
}

for (const category of published.categories || []) addEntity(`category:${category.id}`, 'category', category.sourceName, category.names, names => category.names = names);
for (const menu of published.menus || []) addEntity(`menu:${menu.id}`, 'menu', menu.sourceName, menu.names, names => menu.names = names);
for (const template of published.optionTemplates || []) {
  addEntity(`option-group:${template.id}`, 'option group', template.sourceName || template.names?.ko, template.names, names => template.names = names);
  for (const value of template.values || []) addEntity(`option-value:${template.id}:${value.id}`, 'option item', value.sourceName || value.names?.ko, value.names, names => value.names = names);
}

const pending = [];
let cacheHits = 0;
for (const entity of entities) {
  entity.fingerprint = entityFingerprint(entity);
  const saved = cache.items[entity.key];
  if (saved?.fingerprint === entity.fingerprint && LANGUAGES.every(code => String(saved.names?.[code] || '').trim())) {
    entity.apply(cleanNames(saved.names));
    cacheHits++;
  } else pending.push(entity);
}

const schema = {
  type: 'object',
  properties: {
    translations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          ko: { type: 'string' },
          vi: { type: 'string' },
          zh: { type: 'string' },
          en: { type: 'string' }
        },
        required: ['id', 'ko', 'vi', 'zh', 'en'],
        additionalProperties: false
      }
    }
  },
  required: ['translations'],
  additionalProperties: false
};

function responseText(result) {
  if (typeof result.output_text === 'string') return result.output_text;
  return (result.output || []).flatMap(item => item.content || []).filter(item => item.type === 'output_text' && typeof item.text === 'string').map(item => item.text).join('');
}

async function translateBatch(batch) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      store: false,
      reasoning: { effort: 'none' },
      max_output_tokens: 12000,
      input: [
        {
          role: 'system',
          content: 'You translate restaurant menu labels for a Korean chicken restaurant in Vietnam. Return exactly one translation object for every input id, keeping each id unchanged. Return concise, natural customer-facing names in Korean, Vietnamese, Simplified Chinese, and English. The source may already mix several languages; extract useful existing translations, correct spacing and awkward phrasing, and translate anything missing. Preserve brand names, product codes, sizes, numbers, and proper nouns. Do not add explanations, prices, or marketing claims. Use common restaurant wording in each language.'
        },
        {
          role: 'user',
          content: JSON.stringify(batch.map(entity => ({ id: entity.key, kind: entity.kind, sourceName: entity.sourceName, currentNames: entity.currentNames })))
        }
      ],
      text: { format: { type: 'json_schema', name: 'menu_translations', strict: true, schema } }
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error?.message || `OpenAI HTTP ${response.status}`);
  const text = responseText(result);
  if (!text) throw new Error('OpenAI returned no translation text.');
  return JSON.parse(text).translations || [];
}

let translated = 0;
let translationError = '';
if (pending.length && API_KEY) {
  try {
    for (let index = 0; index < pending.length; index += BATCH_SIZE) {
      const batch = pending.slice(index, index + BATCH_SIZE);
      const results = await translateBatch(batch);
      const byId = new Map(results.map(item => [item.id, item]));
      for (const entity of batch) {
        const result = byId.get(entity.key);
        if (!result || !LANGUAGES.every(code => String(result[code] || '').trim())) continue;
        const names = cleanNames(result);
        entity.apply(names);
        cache.items[entity.key] = { fingerprint: entity.fingerprint, sourceName: entity.sourceName, names, updatedAt: new Date().toISOString() };
        translated++;
      }
      console.log(`AI translation batch completed: ${Math.min(index + BATCH_SIZE, pending.length)}/${pending.length}`);
    }
  } catch (error) {
    translationError = error.message || 'translation failed';
    console.log(`::warning::AI translation skipped: ${translationError}`);
  }
}

const remaining = entities.filter(entity => {
  const names = entity.kind === 'category'
    ? (published.categories || []).find(item => `category:${item.id}` === entity.key)?.names
    : null;
  const cached = cache.items[entity.key];
  return !LANGUAGES.every(code => String(cached?.names?.[code] || names?.[code] || '').trim());
}).length;
published.translation = {
  provider: 'openai',
  model: MODEL,
  status: translationError ? 'error' : remaining ? (API_KEY ? 'partial' : 'not_configured') : 'ready',
  entityCount: entities.length,
  cacheHits,
  translated,
  pendingCount: remaining,
  updatedAt: new Date().toISOString()
};

fs.writeFileSync(DATA_PATH, JSON.stringify(published, null, 2) + '\n');
fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n');

if (!API_KEY && pending.length) console.log('::warning::OPENAI_API_KEY is not configured. Add it as a GitHub Actions repository secret to enable natural translations.');
console.log(`Translation summary: ${entities.length} entities, ${cacheHits} cache hits, ${translated} newly translated, ${remaining} pending.`);
