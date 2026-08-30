import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import optionOrder from '../assets/option-order.js';

function clean(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function codeKey(value) {
  return clean(value).toLocaleLowerCase('en-US');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateIdList(values, label) {
  if (!Array.isArray(values) || !values.length) throw new Error(`${label} must contain at least one id.`);
  const ids = values.map(value => clean(value));
  if (ids.some(value => !value) || new Set(ids).size !== ids.length) throw new Error(`${label} contains a blank or duplicate id.`);
}

function validateOptionOrdering(config, configuredCodes) {
  const ordering = config.optionOrdering;
  if (!ordering) return;
  if (ordering.policy !== 'free-first-stable') throw new Error('Option ordering policy must be free-first-stable.');
  if (!Array.isArray(ordering.menus) || !Array.isArray(ordering.templates)) throw new Error('Option ordering must define menus and templates.');
  const menuCodes = new Set();
  for (const menu of ordering.menus) {
    const key = codeKey(menu.code);
    if (!key || menuCodes.has(key)) throw new Error(`Invalid or duplicate option-ordering menu code: ${menu.code}`);
    if (!configuredCodes.has(key)) throw new Error(`Option-ordering menu ${menu.code} is not present in the table QR layout.`);
    validateIdList(menu.templateIds, `Option-ordering menu ${menu.code}`);
    menuCodes.add(key);
  }
  const templateIds = new Set();
  for (const template of ordering.templates) {
    const id = clean(template.templateId);
    if (!id || templateIds.has(id)) throw new Error(`Invalid or duplicate option-ordering template id: ${template.templateId}`);
    validateIdList(template.valueIds, `Option-ordering template ${template.templateId}`);
    templateIds.add(id);
  }
}

function validateMenuNameOverrides(config, configuredCodes) {
  const overrides = config.menuNameOverrides;
  if (!overrides) return;
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new Error('Menu name overrides must be an object keyed by CUKCUK product code.');
  const seenCodes = new Set();
  for (const [code, names] of Object.entries(overrides)) {
    const key = codeKey(code);
    if (!key || seenCodes.has(key)) throw new Error(`Invalid or duplicate menu-name override code: ${code}`);
    if (!configuredCodes.has(key)) throw new Error(`Menu-name override ${code} is not present in the table QR layout.`);
    if (!names || typeof names !== 'object' || Array.isArray(names)) throw new Error(`Menu-name override ${code} must define localized names.`);
    const localized = ['ko', 'vi', 'zh', 'en'].filter(language => clean(names[language]));
    if (!localized.length) throw new Error(`Menu-name override ${code} has no localized name.`);
    seenCodes.add(key);
  }
}

function validateLocalizedNames(names, label) {
  if (!names || typeof names !== 'object' || Array.isArray(names)) throw new Error(`${label} must define localized names.`);
  const localized = ['ko', 'vi', 'zh', 'en'].filter(language => clean(names[language]));
  if (!localized.length) throw new Error(`${label} has no localized text.`);
}

function validateCodeOverrideMap(overrides, label, configuredCodes, validateValue) {
  if (!overrides) return;
  if (typeof overrides !== 'object' || Array.isArray(overrides)) throw new Error(`${label} must be an object keyed by CUKCUK product code.`);
  const seenCodes = new Set();
  for (const [code, value] of Object.entries(overrides)) {
    const key = codeKey(code);
    if (!key || seenCodes.has(key)) throw new Error(`Invalid or duplicate ${label} code: ${code}`);
    if (!configuredCodes.has(key)) throw new Error(`${label} ${code} is not present in the table QR layout.`);
    validateValue(value, `${label} ${code}`);
    seenCodes.add(key);
  }
}

function validateMenuSubtitleOverrides(config, configuredCodes) {
  validateCodeOverrideMap(config.menuSubtitleOverrides, 'Menu-subtitle override', configuredCodes, (override, label) => {
    if (!override || typeof override !== 'object' || Array.isArray(override)) throw new Error(`${label} must be an object.`);
    validateLocalizedNames(override.names, label);
    if (override.tone !== undefined && !['default', 'warning', 'danger'].includes(clean(override.tone))) {
      throw new Error(`${label} has an unsupported tone.`);
    }
  });
}

function validateMenuOptionOverrides(config, configuredCodes) {
  validateCodeOverrideMap(config.menuOptionOverrides, 'Menu-option override', configuredCodes, (override, label) => {
    if (!override || typeof override !== 'object' || Array.isArray(override)) throw new Error(`${label} must be an object.`);
    if (Object.hasOwn(override, 'templateIds')) {
      if (!Array.isArray(override.templateIds)) throw new Error(`${label}.templateIds must be an array.`);
      const ids = override.templateIds.map(value => clean(value));
      if (ids.some(value => !value) || new Set(ids).size !== ids.length) throw new Error(`${label}.templateIds contains a blank or duplicate id.`);
    }
    if (override.rules !== undefined && (!override.rules || typeof override.rules !== 'object' || Array.isArray(override.rules))) {
      throw new Error(`${label}.rules must be an object keyed by option template id.`);
    }
    const configuredIds = Object.hasOwn(override, 'templateIds') ? new Set(override.templateIds.map(value => clean(value))) : null;
    for (const [templateId, rule] of Object.entries(override.rules || {})) {
      const id = clean(templateId);
      if (!id || !rule || typeof rule !== 'object' || Array.isArray(rule)) throw new Error(`${label} has an invalid rule for ${templateId}.`);
      if (configuredIds && !configuredIds.has(id)) throw new Error(`${label} rule ${id} is not listed in templateIds.`);
      const min = rule.minSelections;
      const max = rule.maxSelections;
      if (min !== undefined && (!Number.isInteger(min) || min < 0)) throw new Error(`${label} rule ${id} has an invalid minSelections.`);
      if (max !== undefined && (!Number.isInteger(max) || max < 0)) throw new Error(`${label} rule ${id} has an invalid maxSelections.`);
      if (min !== undefined && max !== undefined && max < min) throw new Error(`${label} rule ${id} has maxSelections below minSelections.`);
      if (rule.required !== undefined && typeof rule.required !== 'boolean') throw new Error(`${label} rule ${id} has a non-boolean required value.`);
    }
  });
}

function reorderExistingIds(values, preferredIds) {
  const source = (Array.isArray(values) ? values : []).map(String);
  if (!Array.isArray(preferredIds) || !preferredIds.length) return source;
  const available = new Set(source);
  const preferred = preferredIds.map(String).filter(id => available.has(id));
  const preferredSet = new Set(preferred);
  return [...preferred, ...source.filter(id => !preferredSet.has(id))];
}

function normalizeTemplateValues(values, preferredIds) {
  const source = (Array.isArray(values) ? values : []).filter(Boolean);
  const byId = new Map(source.map(value => [String(value.id), value]));
  const preferred = (Array.isArray(preferredIds) ? preferredIds : []).map(String).map(id => byId.get(id)).filter(Boolean);
  const preferredSet = new Set(preferred.map(value => String(value.id)));
  const combined = [...preferred, ...source.filter(value => !preferredSet.has(String(value.id)))];
  return optionOrder.normalizeValues(combined.map((value, index) => ({ ...value, sortOrder: index })));
}

function validateConfig(config) {
  if (!config || config.includeUnlisted !== false) throw new Error('Table QR layout must set includeUnlisted to false.');
  if (!clean(config.revision)) throw new Error('Table QR layout revision is required.');
  if (!Array.isArray(config.categories) || !config.categories.length) throw new Error('Table QR layout has no categories.');
  const categoryIds = new Set();
  const codes = new Set();
  let menuCount = 0;
  for (const [categoryIndex, category] of config.categories.entries()) {
    if (!clean(category.id) || categoryIds.has(String(category.id))) throw new Error(`Invalid or duplicate category id: ${category.id}`);
    if (Number(category.sortOrder) !== categoryIndex) throw new Error(`Category ${category.id} sortOrder must be ${categoryIndex}.`);
    categoryIds.add(String(category.id));
    if (!Array.isArray(category.menus)) throw new Error(`Category ${category.id} has no menu list.`);
    for (const [menuIndex, menu] of category.menus.entries()) {
      if (Number(menu.sortOrder) !== menuIndex) throw new Error(`Product ${menu.code} sortOrder must be ${menuIndex}.`);
      const key = codeKey(menu.code);
      if (!key || codes.has(key)) throw new Error(`Invalid or duplicate CUKCUK product code: ${menu.code}`);
      codes.add(key);
      menuCount++;
    }
  }
  if (Number(config.categoryCount) !== config.categories.length) throw new Error('Configured categoryCount does not match the category list.');
  if (Number(config.menuCount) !== menuCount) throw new Error('Configured menuCount does not match the menu lists.');
  validateOptionOrdering(config, codes);
  validateMenuNameOverrides(config, codes);
  validateMenuSubtitleOverrides(config, codes);
  validateMenuOptionOverrides(config, codes);
}

function candidateCodes(menu) {
  return [menu.cukcukCode, menu.productCode, menu.code].map(codeKey).filter(Boolean);
}

function resolveByCode(rule, byCode) {
  const matches = byCode.get(codeKey(rule.code)) || [];
  if (matches.length === 1) return matches[0];
  if (!matches.length) return null;
  throw new Error(`CUKCUK product code ${rule.code} resolved to ${matches.length} candidates.`);
}

export function applyTableQrLayout(publishedInput, configInput) {
  const published = clone(publishedInput);
  const config = clone(configInput);
  validateConfig(config);

  const candidates = Array.isArray(published.menus) ? published.menus : [];
  const declaredCandidateCount = Number(published.inventoryCandidateCount);
  const candidateCount = Number.isFinite(declaredCandidateCount) && declaredCandidateCount >= candidates.length ? declaredCandidateCount : candidates.length;
  const menuOrderingByCode = new Map((config.optionOrdering?.menus || []).map(rule => [codeKey(rule.code), rule]));
  const templateOrderingById = new Map((config.optionOrdering?.templates || []).map(rule => [String(rule.templateId), rule]));
  const menuNameOverridesByCode = new Map(Object.entries(config.menuNameOverrides || {}).map(([code, names]) => [codeKey(code), names]));
  const menuSubtitleOverridesByCode = new Map(Object.entries(config.menuSubtitleOverrides || {}).map(([code, subtitle]) => [codeKey(code), subtitle]));
  const menuOptionOverridesByCode = new Map(Object.entries(config.menuOptionOverrides || {}).map(([code, override]) => [codeKey(code), override]));
  const byCode = new Map();
  for (const menu of candidates) {
    for (const key of new Set(candidateCodes(menu))) {
      if (!byCode.has(key)) byCode.set(key, []);
      byCode.get(key).push(menu);
    }
  }

  const originalCategories = new Map((published.categories || []).map(category => [String(category.id), category]));
  const categories = [];
  const menus = [];
  const selectedIds = new Set();
  const missing = [];
  let globalSortOrder = 0;

  for (const [categoryIndex, ruleCategory] of config.categories.entries()) {
    const original = originalCategories.get(String(ruleCategory.id));
    const names = {};
    for (const language of ['ko', 'vi', 'zh', 'en']) names[language] = clean(ruleCategory.names?.[language] || original?.names?.[language]);
    const categoryName = names.ko || clean(ruleCategory.sourceName || ruleCategory.code);
    categories.push({
      id: String(ruleCategory.id),
      sourceName: clean(ruleCategory.sourceName || ruleCategory.code),
      names,
      visible: ruleCategory.visible !== false,
      sortOrder: categoryIndex
    });

    for (const [categorySortOrder, ruleMenu] of ruleCategory.menus.entries()) {
      const candidate = resolveByCode(ruleMenu, byCode);
      if (!candidate) {
        missing.push(`${ruleMenu.code} · ${ruleMenu.displayName}`);
        continue;
      }
      const id = String(candidate.id || candidate.cukcukId || '');
      if (!id) throw new Error(`CUKCUK product ${ruleMenu.code} has no stable id.`);
      const rawPrice = candidate.price;
      const price = Number(rawPrice);
      if (rawPrice === null || rawPrice === undefined || clean(rawPrice) === '' || !Number.isFinite(price) || price < 0) throw new Error(`CUKCUK product ${ruleMenu.code} has an invalid price.`);
      if (selectedIds.has(id)) throw new Error(`CUKCUK product id ${id} was selected more than once.`);
      selectedIds.add(id);
      const optionOverride = menuOptionOverridesByCode.get(codeKey(ruleMenu.code));
      const sourceTemplateIds = optionOverride && Object.hasOwn(optionOverride, 'templateIds')
        ? optionOverride.templateIds.map(String)
        : candidate.optionTemplateIds;
      const orderedTemplateIds = reorderExistingIds(sourceTemplateIds, menuOrderingByCode.get(codeKey(ruleMenu.code))?.templateIds);
      const nameOverrides = menuNameOverridesByCode.get(codeKey(ruleMenu.code)) || {};
      const subtitleOverride = menuSubtitleOverridesByCode.get(codeKey(ruleMenu.code));
      const names = { ...(candidate.names || {}) };
      for (const language of ['ko', 'vi', 'zh', 'en']) if (clean(nameOverrides[language])) names[language] = clean(nameOverrides[language]);
      const publishedMenu = {
        ...candidate,
        id,
        cukcukId: String(candidate.cukcukId || id),
        cukcukCode: clean(candidate.cukcukCode || candidate.productCode || candidate.code || ruleMenu.code),
        categoryId: String(ruleCategory.id),
        categoryName,
        names,
        price,
        available: ruleMenu.outOfStock ? false : candidate.available !== false,
        optionTemplateIds: orderedTemplateIds,
        sortOrder: globalSortOrder++,
        categorySortOrder
      };
      if (subtitleOverride) {
        publishedMenu.subtitle = {
          names: Object.fromEntries(['ko', 'vi', 'zh', 'en'].map(language => [language, clean(subtitleOverride.names?.[language])])),
          tone: clean(subtitleOverride.tone) || 'default'
        };
      }
      if (optionOverride?.rules) publishedMenu.optionRules = clone(optionOverride.rules);
      menus.push(publishedMenu);
    }
  }

  if (missing.length) {
    throw new Error(`CUKCUK inventory is missing ${missing.length} table QR products:\n${missing.map(item => `- ${item}`).join('\n')}`);
  }

  const referencedTemplateIds = new Set(menus.flatMap(menu => (menu.optionTemplateIds || []).map(String)));
  const publishedTemplateIds = new Set((published.optionTemplates || []).map(template => String(template.id)));
  const missingTemplateIds = [...referencedTemplateIds].filter(id => !publishedTemplateIds.has(id));
  if (missingTemplateIds.length) {
    throw new Error(`CUKCUK menu data is missing ${missingTemplateIds.length} referenced option templates: ${missingTemplateIds.join(', ')}`);
  }
  const optionTemplates = (published.optionTemplates || [])
    .filter(template => referencedTemplateIds.has(String(template.id)))
    .map(template => ({
      ...template,
      values: normalizeTemplateValues(template.values, templateOrderingById.get(String(template.id))?.valueIds),
      menuIds: menus.filter(menu => menu.optionTemplateIds.map(String).includes(String(template.id))).map(menu => menu.id)
    }));
  const retainedTemplateIds = new Set(optionTemplates.map(template => String(template.id)));
  const retainedTemplatesById = new Map(optionTemplates.map(template => [String(template.id), template]));
  for (const menu of menus) {
    menu.optionTemplateIds = (menu.optionTemplateIds || []).map(String).filter(id => retainedTemplateIds.has(id));
    if (menu.optionRules) {
      for (const templateId of Object.keys(menu.optionRules)) {
        if (!menu.optionTemplateIds.includes(String(templateId))) {
          throw new Error(`Menu ${menu.cukcukCode} has an option rule for unattached template ${templateId}.`);
        }
        const template = retainedTemplatesById.get(String(templateId));
        const rule = menu.optionRules[templateId] || {};
        const visibleCount = (template?.values || []).filter(value => value?.visible !== false).length;
        const required = rule.required ?? template?.required === true;
        const minSelections = rule.minSelections ?? template?.minSelections ?? (required ? 1 : 0);
        const maxSelections = rule.maxSelections ?? template?.maxSelections ?? visibleCount;
        if (minSelections > visibleCount || maxSelections > visibleCount) {
          throw new Error(`Menu ${menu.cukcukCode} option rule ${templateId} requires up to ${maxSelections} selections but only ${visibleCount} visible values exist.`);
        }
      }
    }
    menu.optionGroups = menu.optionTemplateIds.length;
  }

  published.categories = categories;
  published.menus = menus;
  published.optionTemplates = optionTemplates;
  published.categoryCount = categories.length;
  published.menuCount = menus.length;
  published.optionTemplateCount = optionTemplates.length;
  published.catalogRevision = String(config.revision);
  published.tableQrLayout = {
    revision: String(config.revision),
    capturedAt: config.capturedAt,
    source: config.source,
    includeUnlisted: false,
    featuredVisible: config.featuredVisible === true,
    optionOrderingPolicy: config.optionOrdering?.policy || 'free-first-stable',
    orderedMenuCount: config.optionOrdering?.menus?.length || 0,
    orderedTemplateCount: config.optionOrdering?.templates?.length || 0,
    excludedCandidateCount: Math.max(0, candidateCount - selectedIds.size)
  };
  if (published.lastSync && typeof published.lastSync === 'object') published.lastSync.published_menu_count = menus.length;
  return published;
}

function runCli() {
  const [menuPath = 'data/cukcuk-menu.json', configPath = 'data/cukcuk-table-qr-layout.json'] = process.argv.slice(2);
  const published = JSON.parse(fs.readFileSync(menuPath, 'utf8'));
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const result = applyTableQrLayout(published, config);
  fs.writeFileSync(menuPath, JSON.stringify(result, null, 2) + '\n');
  console.log(`Applied ${result.catalogRevision}: ${result.categoryCount} categories, ${result.menuCount} menus, ${result.optionTemplateCount} option templates.`);
  console.log(`Excluded ${result.tableQrLayout.excludedCandidateCount} unlisted CUKCUK candidates.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) runCli();
