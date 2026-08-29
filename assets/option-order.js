(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DABANG_OPTION_ORDER = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function amount(value) {
    const number = Number(value?.additionalPrice);
    return Number.isFinite(number) ? number : 0;
  }

  function sourceOrder(value, fallback = 0) {
    const number = Number(value?.sortOrder);
    return Number.isFinite(number) ? number : fallback;
  }

  function isPaid(value) {
    return amount(value) > 0;
  }

  function compareValues(left, right) {
    const tier = Number(isPaid(left)) - Number(isPaid(right));
    if (tier) return tier;
    return sourceOrder(left) - sourceOrder(right);
  }

  function sortValues(values) {
    return (Array.isArray(values) ? values : [])
      .map((value, index) => ({ value, index }))
      .sort((left, right) => compareValues(left.value, right.value) || left.index - right.index)
      .map(entry => entry.value);
  }

  function normalizeValues(values) {
    return sortValues(values).map((value, index) => ({
      ...value,
      additionalPrice: amount(value),
      sortOrder: index
    }));
  }

  function isFreeFirst(values) {
    let paidSeen = false;
    for (const value of Array.isArray(values) ? values : []) {
      if (!isPaid(value)) {
        if (paidSeen) return false;
        continue;
      }
      paidSeen = true;
    }
    return true;
  }

  return { amount, isPaid, compareValues, sortValues, normalizeValues, isFreeFirst };
});
