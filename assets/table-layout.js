(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DABANG_TABLE_LAYOUT = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const AREA_ORDER = ['A', 'B', 'C', 'D', 'Z', '배달', '기타'];
  const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

  function text(value) {
    return String(value ?? '').trim();
  }

  function normalizeAreaName(value) {
    const raw = text(value);
    const compact = raw.replace(/\s+/g, '');
    const letter = compact.match(/^([A-D])(?:-|구역|TABLES?)?$/i);
    if (letter) return letter[1].toUpperCase();
    if (/^(Z|PC)(?:-|구역|TABLES?)?$/i.test(compact)) return 'Z';
    if (/배달|take|ship/i.test(compact)) return '배달';
    return raw || '기타';
  }

  function inferArea(table) {
    const name = text(table?.name);
    const letter = name.match(/^([A-D])\s*[-_ ]?\s*0*\d+/i);
    if (letter) return letter[1].toUpperCase();
    if (/^PC\s*0*\d+/i.test(name)) return 'Z';
    if (/^(take|ship)\s*0*\d+/i.test(name)) return '배달';
    return normalizeAreaName(table?.sourceArea ?? table?.area);
  }

  function areaRank(value) {
    const normalized = normalizeAreaName(value);
    const index = AREA_ORDER.indexOf(normalized);
    return index < 0 ? AREA_ORDER.length : index;
  }

  function compareAreaNames(left, right) {
    const rank = areaRank(left) - areaRank(right);
    return rank || collator.compare(normalizeAreaName(left), normalizeAreaName(right));
  }

  function trailingNumber(value) {
    const match = text(value).match(/(\d+)\s*$/);
    return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
  }

  function compareTables(left, right) {
    const area = compareAreaNames(inferArea(left), inferArea(right));
    if (area) return area;
    const number = trailingNumber(left?.name) - trailingNumber(right?.name);
    return number || collator.compare(text(left?.name), text(right?.name));
  }

  function buildDefaultGroups(tables) {
    const groups = new Map();
    for (const table of Array.isArray(tables) ? tables : []) {
      const name = inferArea(table);
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(table);
    }
    return [...groups.entries()]
      .sort(([left], [right]) => compareAreaNames(left, right))
      .map(([name, rows]) => ({ name, tables: rows.slice().sort(compareTables) }));
  }

  return { AREA_ORDER, normalizeAreaName, inferArea, compareAreaNames, compareTables, buildDefaultGroups };
});
