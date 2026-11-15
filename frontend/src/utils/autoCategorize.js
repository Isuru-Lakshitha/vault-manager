/**
 * Smart Auto-Categorization & Merchant Rules Engine
 * Maps merchant names, memos, and keywords to categories with self-learning support.
 */

const KEYWORD_RULES = [
  // Food & Groceries
  {
    category: '🍔 Food',
    keywords: [
      'uber eats', 'pickme food', 'keells', 'cargills', 'spar', 'supermarket',
      'grocery', 'groceries', 'mcdonald', 'kfc', 'pizza', 'domino', 'starbucks',
      'cafe', 'coffee', 'restaurant', 'bakery', 'bread', 'subway', 'burger',
      'tea', 'lunch', 'dinner', 'breakfast', 'food', 'market'
    ]
  },
  // Transport
  {
    category: '🚗 Transport',
    keywords: [
      'uber', 'pickme', 'taxi', 'cab', 'fuel', 'petrol', 'diesel', 'ceypetco',
      'ioc', 'sinopec', 'parking', 'train', 'bus', 'toll', 'expressway',
      'highway', 'flight', 'airline', 'air ticket', 'gas station'
    ]
  },
  // Housing / Rent
  {
    category: '🏠 Rent',
    keywords: [
      'rent', 'landlord', 'apartment', 'condo', 'lease', 'mortgage', 'maintenance fee'
    ]
  },
  // Utilities
  {
    category: '⚡ Utilities',
    keywords: [
      'ceb', 'electricity', 'water board', 'water bill', 'gas cylinder', 'litro', 'laugfs',
      'garbage', 'power bill'
    ]
  },
  // Phone, Internet & Subscriptions
  {
    category: '📱 Phone',
    keywords: [
      'dialog', 'mobitel', 'slt', 'airtel', 'hutch', 'fiber', 'internet', 'broadband',
      'wifi', 'recharge', 'reload', 'phone bill'
    ]
  },
  {
    category: '💳 Bills',
    keywords: [
      'netflix', 'spotify', 'youtube premium', 'prime video', 'apple music',
      'icloud', 'google one', 'chatgpt', 'gemini', 'adobe', 'canva', 'subscription',
      'insurance', 'annual fee', 'bill'
    ]
  },
  // Shopping
  {
    category: '🛍️ Shopping',
    keywords: [
      'amazon', 'daraz', 'aliexpress', 'ebay', 'clothing', 'zara', 'h&m',
      'shoes', 'fashion', 'mall', 'retail', 'electronics', 'gadget'
    ]
  },
  // Health & Medicine
  {
    category: '💊 Health',
    keywords: [
      'pharmacy', 'asiri', 'nawaloka', 'lanka hospital', 'durdans', 'doctor',
      'medicine', 'clinic', 'dental', 'dentist', 'hospital', 'optician', 'vision care',
      'lab test', 'fitness', 'gym'
    ]
  },
  // Education
  {
    category: '📚 Education',
    keywords: [
      'coursera', 'udemy', 'tuition', 'school', 'university', 'college', 'campus',
      'books', 'exam', 'class', 'course', 'training'
    ]
  },
  // Entertainment
  {
    category: '🎭 Entertainment',
    keywords: [
      'cinema', 'movie', 'theatre', 'steam', 'playstation', 'ps5', 'xbox',
      'nintendo', 'game', 'gaming', 'concert', 'event', 'party', 'bowling'
    ]
  },
  // Income Sources
  {
    category: '💰 Salary',
    keywords: [
      'salary', 'payroll', 'wages', 'compensation', 'stipend'
    ]
  },
  {
    category: '💼 Business',
    keywords: [
      'client payment', 'freelance', 'consulting', 'invoice', 'sales', 'revenue',
      'upwork', 'fiverr', 'contract'
    ]
  },
  {
    category: '🐷 Savings',
    keywords: [
      'deposit', 'fixed deposit', 'fd', 'interest earned', 'dividend', 'treasury'
    ]
  }
];

/**
 * Predicts the most likely category based on a text string (notes, description, merchant name).
 * Checks learned user rules first, then falls back to keyword dictionary.
 */
export function predictCategory(text, _type = 'Expense') {
  if (!text || typeof text !== 'string') return null;
  const clean = text.trim().toLowerCase();
  if (clean.length < 2) return null;

  // 1. Check custom user learned rules in localStorage
  try {
    const learnedRules = JSON.parse(localStorage.getItem('vm_merchant_rules') || '{}');
    if (learnedRules[clean]) {
      return {
        category: learnedRules[clean],
        confidence: 'high',
        source: 'learned',
        matched: clean
      };
    }
    // Partial matches in learned rules
    for (const [merchant, cat] of Object.entries(learnedRules)) {
      if (clean.includes(merchant) || merchant.includes(clean)) {
        return {
          category: cat,
          confidence: 'medium',
          source: 'learned',
          matched: merchant
        };
      }
    }
  } catch {
  // Ignore JSON parse errors
}

  // 2. Keyword dictionary search
  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      // Word boundary or substring match
      const regex = new RegExp(`(^|\\s|[^a-zA-Z0-9])${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\s|[^a-zA-Z0-9])`, 'i');
      if (regex.test(clean) || clean.includes(kw)) {
        return {
          category: rule.category,
          confidence: 'high',
          source: 'dictionary',
          matched: kw
        };
      }
    }
  }

  return null;
}

/**
 * Saves a user-confirmed merchant-to-category mapping for future auto-predictions.
 */
export function learnMerchantRule(merchantOrNotes, category) {
  if (!merchantOrNotes || !category) return;
  const clean = merchantOrNotes.trim().toLowerCase();
  if (clean.length < 2) return;

  try {
    const rules = JSON.parse(localStorage.getItem('vm_merchant_rules') || '{}');
    rules[clean] = category;
    // Keep max 200 learned rules
    const keys = Object.keys(rules);
    if (keys.length > 200) {
      delete rules[keys[0]];
    }
    localStorage.setItem('vm_merchant_rules', JSON.stringify(rules));
  } catch {
  // Ignore localStorage errors
}
}
