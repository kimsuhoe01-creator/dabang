import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LANGUAGES = ['ko', 'vi', 'zh', 'en'];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clean(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function exactId(value, label) {
  if (typeof value !== 'string') throw new Error(`${label} is blank or contains whitespace.`);
  const raw = value;
  const id = raw.trim();
  if (!id || id !== raw || /\s/.test(id)) throw new Error(`${label} is blank or contains whitespace.`);
  return id;
}

function detailId(detail) {
  return detail?.Id ?? detail?.ID ?? detail?.id ?? detail?.InventoryItemID ?? detail?.InventoryItemId;
}

function additionId(addition) {
  return addition?.Id ?? addition?.ID ?? addition?.id ?? addition?.AdditionID ?? addition?.AdditionId;
}

function localizedNames(value, label) {
  const source = typeof value === 'string'
    ? { ko: value }
    : value?.names && typeof value.names === 'object' && !Array.isArray(value.names)
      ? value.names
      : value;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error(`${label} must be a string or localized-name object.`);
  }
  const names = Object.fromEntries(LANGUAGES.map(language => [language, clean(source[language])]));
  if (!LANGUAGES.some(language => names[language])) throw new Error(`${label} has no localized name.`);
  return {
    sourceName: clean(value?.sourceName || value?.name || names.ko || names.vi || names.en || names.zh),
    names
  };
}

function configuredTemplateNames(value, count, code) {
  const entries = Array.isArray(value) ? value : [value];
  if (entries.length !== count) {
    throw new Error(`Detail option source ${code} expected ${count} template names but received ${entries.length}.`);
  }
  return entries.map((entry, index) => localizedNames(entry, `Detail option source ${code} templateNames[${index}]`));
}

function expectedPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer.`);
  return value;
}

function additionPrice(value, code, id) {
  if ((typeof value !== 'number' && typeof value !== 'string') || clean(value) === '') {
    throw new Error(`Detail option ${code} addition ${id} has an invalid price.`);
  }
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) throw new Error(`Detail option ${code} addition ${id} has an invalid price.`);
  return price;
}

function valueNames(description) {
  const parts = description.split('|').map(clean);
  if (parts.length === 2 && parts.every(Boolean)) {
    const firstHasKorean = /[\u3131-\u318e\uac00-\ud7a3]/u.test(parts[0]);
    const secondHasKorean = /[\u3131-\u318e\uac00-\ud7a3]/u.test(parts[1]);
    const [ko, vi] = !firstHasKorean && secondHasKorean
      ? [parts[1], parts[0]]
      : [parts[0], parts[1]];
    return {
      names: { ko, vi, zh: '', en: '' },
      receiptNames: { ko, vi }
    };
  }
  return { names: { ko: description, vi: '', zh: '', en: '' } };
}

function activeCategories(detail, code) {
  if (!Array.isArray(detail.AdditionCategories)) {
    throw new Error(`CUKCUK detail for ${code} has no AdditionCategories array.`);
  }
  const categories = [];
  for (const [sourceIndex, category] of detail.AdditionCategories.entries()) {
    if (!category || typeof category !== 'object' || Array.isArray(category)) {
      throw new Error(`CUKCUK detail for ${code} category ${sourceIndex} is invalid.`);
    }
    if (category.InActive === true) continue;
    if (!Array.isArray(category.Additions)) {
      throw new Error(`CUKCUK detail for ${code} category ${sourceIndex} has no Additions array.`);
    }
    const additions = category.Additions.filter(addition => addition?.InActive !== true);
    if (!additions.length) throw new Error(`CUKCUK detail for ${code} category ${sourceIndex} has no active additions.`);
    categories.push({ category, additions });
  }
  return categories;
}

function preparedValues(additions, code) {
  const seenIds = new Set();
  return additions.map((addition, sortOrder) => {
    if (!addition || typeof addition !== 'object') throw new Error(`Detail option ${code} contains an invalid addition.`);
    const id = exactId(additionId(addition), `Detail option ${code} addition id`);
    if (seenIds.has(id)) throw new Error(`Detail option ${code} contains duplicate addition id ${id}.`);
    seenIds.add(id);
    if (typeof addition.Description !== 'string') throw new Error(`Detail option ${code} addition ${id} has a blank Description.`);
    const sourceName = clean(addition.Description);
    if (!sourceName) throw new Error(`Detail option ${code} addition ${id} has a blank Description.`);
    return {
      id,
      sourceName,
      ...valueNames(sourceName),
      additionalPrice: additionPrice(addition.Price, code, id),
      visible: true,
      sortOrder
    };
  });
}

function filteredRules(menu, config, code, templateIds) {
  const configured = config.menuOptionOverrides?.[code]?.rules;
  const candidates = { ...(menu.optionRules || {}), ...(configured || {}) };
  const allowed = new Set(templateIds);
  return Object.fromEntries(Object.entries(candidates).filter(([id]) => allowed.has(String(id))));
}

export function mergeCukcukDetailOptions(publishedInput, configInput, detailInput) {
  const published = clone(publishedInput);
  const config = clone(configInput || {});
  const sources = config.detailOptionSources;
  if (sources === undefined || sources === null) return published;
  if (typeof sources !== 'object' || Array.isArray(sources)) {
    throw new Error('detailOptionSources must be an object keyed by exact CUKCUK product code.');
  }
  const sourceEntries = Object.entries(sources);
  if (!sourceEntries.length) return published;
  if (!Array.isArray(published.menus)) throw new Error('Published menu data has no menus array.');
  if (!Array.isArray(published.optionTemplates)) throw new Error('Published menu data has no optionTemplates array.');
  if (!Array.isArray(detailInput?.details)) throw new Error('CUKCUK detail input has no details array.');

  const existingTemplateIds = new Set();
  for (const template of published.optionTemplates) {
    const id = exactId(template?.id, 'Published option template id');
    if (existingTemplateIds.has(id)) throw new Error(`Published option templates contain duplicate id ${id}.`);
    existingTemplateIds.add(id);
  }

  const prepared = [];
  const targetMenuIds = new Set();
  const generatedTemplateIds = new Set();
  for (const [code, sourceConfig] of sourceEntries) {
    if (!code.trim()) throw new Error('detailOptionSources contains a blank CUKCUK product code.');
    if (!sourceConfig || typeof sourceConfig !== 'object' || Array.isArray(sourceConfig)) {
      throw new Error(`Detail option source ${code} must be an object.`);
    }
    const expectedCategoryCount = expectedPositiveInteger(sourceConfig.expectedCategoryCount, `Detail option source ${code} expectedCategoryCount`);
    const expectedValueCount = expectedPositiveInteger(sourceConfig.expectedValueCount, `Detail option source ${code} expectedValueCount`);
    const matchingMenus = published.menus.filter(menu => String(menu?.cukcukCode ?? '') === code);
    if (matchingMenus.length !== 1) {
      throw new Error(`CUKCUK product code ${code} resolved to ${matchingMenus.length} published menus; expected exactly 1.`);
    }
    const menu = matchingMenus[0];
    const menuId = exactId(menu.id, `Published menu ${code} id`);
    if (targetMenuIds.has(menuId)) throw new Error(`Published menu ${menuId} is configured more than once in detailOptionSources.`);
    targetMenuIds.add(menuId);

    const matchingDetails = detailInput.details.filter(detail => String(detailId(detail) ?? '') === menuId);
    if (matchingDetails.length !== 1) {
      throw new Error(`CUKCUK detail for ${code} (${menuId}) resolved to ${matchingDetails.length} records; expected exactly 1.`);
    }
    const categories = activeCategories(matchingDetails[0], code);
    if (categories.length !== expectedCategoryCount) {
      throw new Error(`Detail option source ${code} expected ${expectedCategoryCount} active categories but received ${categories.length}.`);
    }
    const totalValueCount = categories.reduce((sum, entry) => sum + entry.additions.length, 0);
    if (totalValueCount !== expectedValueCount) {
      throw new Error(`Detail option source ${code} expected ${expectedValueCount} active values but received ${totalValueCount}.`);
    }
    const names = configuredTemplateNames(sourceConfig.templateNames, expectedCategoryCount, code);
    const seenMenuValueIds = new Set();
    const templates = categories.map(({ additions }, index) => {
      const id = `cukcuk-detail:${menuId}:${index}`;
      if (generatedTemplateIds.has(id)) throw new Error(`Generated detail option template id collision: ${id}.`);
      generatedTemplateIds.add(id);
      const values = preparedValues(additions, code);
      for (const value of values) {
        if (seenMenuValueIds.has(value.id)) throw new Error(`Detail option ${code} contains duplicate addition id ${value.id} across categories.`);
        seenMenuValueIds.add(value.id);
      }
      return {
        id,
        sourceName: names[index].sourceName,
        names: names[index].names,
        required: false,
        minSelections: 0,
        maxSelections: values.length,
        revision: 1,
        values,
        menuIds: [menuId]
      };
    });
    prepared.push({ code, menu, menuId, templates });
  }

  for (const entry of prepared) {
    for (const template of entry.templates) {
      const collision = published.menus.some(menu => String(menu.id) !== entry.menuId
        && (menu.optionTemplateIds || []).map(String).includes(template.id));
      if (collision) throw new Error(`Generated detail option template ${template.id} is already attached to another menu.`);
    }
  }

  const replacedTemplateIds = new Set();
  for (const { code, menu, templates } of prepared) {
    for (const id of menu.optionTemplateIds || []) replacedTemplateIds.add(String(id));
    const templateIds = templates.map(template => template.id);
    menu.optionTemplateIds = templateIds;
    menu.optionGroups = templateIds.length;
    const rules = filteredRules(menu, config, code, templateIds);
    if (Object.keys(rules).length) menu.optionRules = rules;
    else delete menu.optionRules;
  }

  const generatedIds = new Set(prepared.flatMap(entry => entry.templates.map(template => template.id)));
  const references = new Map();
  for (const menu of published.menus) {
    for (const rawId of menu.optionTemplateIds || []) {
      const id = String(rawId);
      if (!references.has(id)) references.set(id, []);
      references.get(id).push(String(menu.id));
    }
  }
  const existing = published.optionTemplates
    .filter(template => !generatedIds.has(String(template.id)))
    .filter(template => !(replacedTemplateIds.has(String(template.id)) && !references.has(String(template.id))))
    .map(template => ({ ...template, menuIds: references.get(String(template.id)) || [] }));
  published.optionTemplates = [...existing, ...prepared.flatMap(entry => entry.templates)];
  published.optionTemplateCount = published.optionTemplates.length;
  return published;
}

function runCli() {
  const [
    menuPath = 'data/cukcuk-menu.json',
    configPath = 'data/cukcuk-table-qr-layout.json',
    detailPath = 'work/cukcuk-inventory-details.json'
  ] = process.argv.slice(2);
  const published = JSON.parse(fs.readFileSync(menuPath, 'utf8'));
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const details = JSON.parse(fs.readFileSync(detailPath, 'utf8'));
  const result = mergeCukcukDetailOptions(published, config, details);
  fs.writeFileSync(menuPath, JSON.stringify(result, null, 2) + '\n');
  console.log(`Merged CUKCUK detail options for ${Object.keys(config.detailOptionSources || {}).length} menus; ${result.optionTemplateCount} option templates published.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) runCli();
