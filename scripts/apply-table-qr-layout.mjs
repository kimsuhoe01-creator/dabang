import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function clean(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function codeKey(value) {
  return clean(value).toLocaleLowerCase('en-US');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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
      menus.push({
        ...candidate,
        id,
        cukcukId: String(candidate.cukcukId || id),
        cukcukCode: clean(candidate.cukcukCode || candidate.productCode || candidate.code || ruleMenu.code),
        categoryId: String(ruleCategory.id),
        categoryName,
        price,
        available: ruleMenu.outOfStock ? false : candidate.available !== false,
        sortOrder: globalSortOrder++,
        categorySortOrder
      });
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
      menuIds: (template.menuIds || []).map(String).filter(id => selectedIds.has(id))
    }));
  const retainedTemplateIds = new Set(optionTemplates.map(template => String(template.id)));
  for (const menu of menus) {
    menu.optionTemplateIds = (menu.optionTemplateIds || []).map(String).filter(id => retainedTemplateIds.has(id));
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
    excludedCandidateCount: Math.max(0, candidates.length - selectedIds.size)
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
