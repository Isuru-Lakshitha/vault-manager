/**
 * Automated Transaction Rules Engine ("IFTTT for Finance")
 * Allows conditional pattern matching and automated action execution
 * across incoming and historical transactions.
 */

export const RULE_FIELDS = [
  { value: 'description', label: 'Description / Merchant / Note' },
  { value: 'amount', label: 'Amount' },
  { value: 'type', label: 'Transaction Type (Expense/Income)' },
  { value: 'category', label: 'Current Category' },
];

export const RULE_OPERATORS = [
  { value: 'contains', label: 'Contains (case-insensitive)', types: ['string'] },
  { value: 'not_contains', label: 'Does not contain', types: ['string'] },
  { value: 'equals', label: 'Equals exactly', types: ['string', 'number'] },
  { value: 'starts_with', label: 'Starts with', types: ['string'] },
  { value: 'greater_than', label: 'Is greater than (>)', types: ['number'] },
  { value: 'less_than', label: 'Is less than (<)', types: ['number'] },
];

export const DEFAULT_RULES = [
  {
    id: 'rule_uber',
    name: 'Uber Rides → Transport',
    active: true,
    matchMode: 'all',
    conditions: [
      { field: 'description', operator: 'contains', value: 'uber' },
    ],
    actions: {
      set_category: '🚗 Transport',
      add_tags: ['#commute'],
    },
  },
  {
    id: 'rule_sub',
    name: 'Streaming Services → Bills & Subscriptions',
    active: true,
    matchMode: 'any',
    conditions: [
      { field: 'description', operator: 'contains', value: 'netflix' },
      { field: 'description', operator: 'contains', value: 'spotify' },
      { field: 'description', operator: 'contains', value: 'youtube' },
      { field: 'description', operator: 'contains', value: 'apple' },
    ],
    actions: {
      set_category: '💳 Bills',
      add_tags: ['#subscription'],
    },
  },
  {
    id: 'rule_salary',
    name: 'Salary & Payroll → Income',
    active: true,
    matchMode: 'all',
    conditions: [
      { field: 'description', operator: 'contains', value: 'salary' },
    ],
    actions: {
      set_category: '💰 Salary',
      add_tags: ['#paycheck'],
    },
  },
  {
    id: 'rule_biz_tax',
    name: 'Software & Tools → Tax Deductible (Business)',
    active: true,
    matchMode: 'any',
    conditions: [
      { field: 'description', operator: 'contains', value: 'github' },
      { field: 'description', operator: 'contains', value: 'aws' },
      { field: 'description', operator: 'contains', value: 'chatgpt' },
      { field: 'description', operator: 'contains', value: 'google cloud' },
    ],
    actions: {
      set_category: '💼 Business',
      set_tax_deductible: true,
      tax_category: 'Business',
      add_tags: ['#tax-deductible', '#software'],
    },
  },
];

/**
 * Checks if a single condition matches against a transaction
 */
export const checkCondition = (condition, tx) => {
  if (!condition || !condition.field) return false;
  const { field, operator, value } = condition;
  if (value === undefined || value === null || value === '') return false;

  let txVal = '';
  if (field === 'description') {
    txVal = `${tx.notes || ''} ${tx.description || ''} ${tx.category || ''}`.trim().toLowerCase();
  } else if (field === 'amount') {
    txVal = parseFloat(tx.amount || 0);
  } else if (field === 'type') {
    txVal = String(tx.type || '').toLowerCase();
  } else if (field === 'category') {
    txVal = String(tx.category || '').toLowerCase();
  }

  const targetStr = String(value).trim().toLowerCase();
  const targetNum = parseFloat(value);

  switch (operator) {
    case 'contains':
      return String(txVal).includes(targetStr);
    case 'not_contains':
      return !String(txVal).includes(targetStr);
    case 'equals':
      if (typeof txVal === 'number' && !isNaN(targetNum)) return txVal === targetNum;
      return String(txVal).trim() === targetStr;
    case 'starts_with':
      return String(txVal).startsWith(targetStr);
    case 'greater_than':
      return typeof txVal === 'number' && !isNaN(targetNum) && txVal > targetNum;
    case 'less_than':
      return typeof txVal === 'number' && !isNaN(targetNum) && txVal < targetNum;
    default:
      return false;
  }
};

/**
 * Evaluates whether an entire rule triggers on a transaction
 */
export const evaluateRule = (rule, tx) => {
  if (!rule || !rule.active || !Array.isArray(rule.conditions) || rule.conditions.length === 0) {
    return false;
  }

  const matchMode = rule.matchMode || 'all';
  if (matchMode === 'all') {
    return rule.conditions.every(cond => checkCondition(cond, tx));
  } else {
    return rule.conditions.some(cond => checkCondition(cond, tx));
  }
};

/**
 * Applies a rule's actions to a transaction, returning a modified clone
 */
export const applyRuleActions = (rule, tx) => {
  if (!rule || !rule.actions) return tx;
  const { actions } = rule;
  const next = { ...tx };

  // Set category
  if (actions.set_category) {
    next.category = actions.set_category;
  }

  // Set tax deductible
  if (actions.set_tax_deductible !== undefined) {
    next.is_tax_deductible = actions.set_tax_deductible;
    if (actions.tax_category) {
      next.tax_category = actions.tax_category;
    }
  }

  // Add tags
  if (Array.isArray(actions.add_tags) && actions.add_tags.length > 0) {
    const existingTags = Array.isArray(next.tags) ? next.tags : (next.tags ? [next.tags] : []);
    const merged = Array.from(new Set([...existingTags, ...actions.add_tags]));
    next.tags = merged;
  }

  // Set note prefix
  if (actions.notes_prefix && !String(next.notes || '').includes(actions.notes_prefix)) {
    next.notes = `${actions.notes_prefix} ${next.notes || ''}`.trim();
  }

  return next;
};

/**
 * Executes a list of rules in priority order on a single transaction
 * @param {Array} rules
 * @param {Object} tx
 * @returns {{ transaction: Object, matchedRules: Array }}
 */
export const executeRulesOnTransaction = (rules, tx) => {
  if (!Array.isArray(rules) || rules.length === 0 || !tx) {
    return { transaction: tx, matchedRules: [] };
  }

  let currentTx = { ...tx };
  const matched = [];

  for (const rule of rules) {
    if (evaluateRule(rule, currentTx)) {
      matched.push(rule);
      currentTx = applyRuleActions(rule, currentTx);
    }
  }

  return { transaction: currentTx, matchedRules: matched };
};

/**
 * Evaluates all rules across an entire transaction dataset
 * Used for batch preview and retroactive rule application
 */
export const previewRulesBatch = (rules, transactions) => {
  if (!Array.isArray(rules) || !Array.isArray(transactions)) return { matches: [], count: 0 };

  const matches = [];

  for (const tx of transactions) {
    const { transaction: updatedTx, matchedRules } = executeRulesOnTransaction(rules, tx);
    if (matchedRules.length > 0) {
      // Check if any actual field changed
      const categoryChanged = updatedTx.category !== tx.category;
      const taxChanged = updatedTx.is_tax_deductible !== tx.is_tax_deductible;
      const tagsChanged = JSON.stringify(updatedTx.tags) !== JSON.stringify(tx.tags);
      const notesChanged = updatedTx.notes !== tx.notes;

      if (categoryChanged || taxChanged || tagsChanged || notesChanged) {
        matches.push({
          id: tx.id,
          original: tx,
          updated: updatedTx,
          matchedRules: matchedRules.map(r => r.name),
        });
      }
    }
  }

  return { matches, count: matches.length };
};
