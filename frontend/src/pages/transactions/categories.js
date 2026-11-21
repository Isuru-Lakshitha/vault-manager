// Category suggestions and keyword auto-categorisation for the
// Transactions page and its add/edit form.
export const SUGGESTED_CATEGORIES = [
  '🍔 Food','🚗 Transport','🏠 Rent','⚡ Utilities','🛍️ Shopping',
  '💊 Health','📚 Education','🎭 Entertainment','✈️ Travel','💰 Salary',
  '💼 Business','🐷 Savings','💳 Bills','🔧 Maintenance','📱 Phone',
];

export const getCategories = () => {
  try {
    const custom = JSON.parse(localStorage.getItem('vm_custom_categories'));
    if (custom && Array.isArray(custom)) {
      return custom.map(c => typeof c === 'string' ? c : `${c.emoji || '📋'} ${c.name || 'Category'}`);
    }
  } catch {}
  return SUGGESTED_CATEGORIES;
};

// Auto-categorization keyword map
export const KEYWORD_MAP = [
  { words: ['uber','lyft','taxi','grab','ola','bus','train','metro','fuel','petrol','diesel','parking','toll'], cat: 'Transport' },
  { words: ['food','restaurant','kfc','mcdonalds','pizza','burger','cafe','coffee','starbucks','zomato','swiggy','uber eat','doordash','lunch','dinner','breakfast','meal','sushi','noodle','biryani'], cat: 'Food' },
  { words: ['rent','house','apartment','flat','housing','lease','mortgage'], cat: 'Rent' },
  { words: ['electricity','water','gas','wifi','internet','broadband','utility','phone bill','mobile bill','postpaid'], cat: 'Utilities' },
  { words: ['amazon','flipkart','shopee','lazada','ebay','walmart','mall','shopping','clothes','shoes','shirt','jacket'], cat: 'Shopping' },
  { words: ['doctor','hospital','pharmacy','medicine','clinic','health','dental','eye','optical','gym','fitness'], cat: 'Health' },
  { words: ['school','tuition','college','course','book','study','exam','library','education','training'], cat: 'Education' },
  { words: ['movie','cinema','netflix','spotify','concert','game','play','entertainment','show','ticket'], cat: 'Entertainment' },
  { words: ['flight','hotel','airbnb','vacation','holiday','trip','travel','visa','passport'], cat: 'Travel' },
  { words: ['salary','paycheck','wage','income','bonus','commission'], cat: 'Salary' },
  { words: ['insurance','premium','emi','loan payment','instalment','installment'], cat: 'Bills' },
  { words: ['phone','mobile','iphone','samsung','laptop','computer','gadget','repair','service'], cat: 'Phone' },
];

export const autoCategorize = (notes) => {
  if (!notes || notes.length < 2) return null;
  const lower = notes.toLowerCase();
  for (const { words, cat } of KEYWORD_MAP) {
    if (words.some(w => lower.includes(w))) return cat;
  }
  return null;
};
