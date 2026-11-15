const CATEGORY_MAP = [
  { keywords: ['food','grocer','eat','restaurant','meal','lunch','dinner','breakfast','snack','cafe','kfc','mcdo','pizza','burger'], emoji: '🍔' },
  { keywords: ['rent','hous','home','flat','apartment','accommodation','mortgage'], emoji: '🏠' },
  { keywords: ['transport','fuel','petrol','gas','vehicle','uber','taxi','bus','train','commute','travel fare'], emoji: '🚗' },
  { keywords: ['entertain','movie','cinema','game','sport','music','concert','fun','netflix','streaming'], emoji: '🎬' },
  { keywords: ['health','medical','doctor','pharmacy','medicine','hospital','clinic','dental','optician'], emoji: '💊' },
  { keywords: ['shop','cloth','fashion','wear','amazon','purchase','retail','market'], emoji: '🛍️' },
  { keywords: ['util','electric','water','internet','phone','bill','power','wifi'], emoji: '⚡' },
  { keywords: ['educat','school','university','course','tutor','learn','training'], emoji: '📚' },
  { keywords: ['salary','wage','pay','earn','revenue','freelan','business income'], emoji: '💰' },
  { keywords: ['loan','debt','emi','credit','borrow','repay','interest payment'], emoji: '🏦' },
  { keywords: ['loan payment'], emoji: '🏦' },
  { keywords: ['travel','holiday','trip','flight','hotel','vacation','tour','airbnb'], emoji: '✈️' },
  { keywords: ['saving','invest','fund','deposit'], emoji: '🐷' },
  { keywords: ['subscript','spotify','app','software','saas'], emoji: '📱' },
  { keywords: ['gift','present','donation','charity'], emoji: '🎁' },
  { keywords: ['pet','dog','cat','animal','vet'], emoji: '🐾' },
  { keywords: ['gym','fitness','workout','yoga','exercise'], emoji: '💪' },
  { keywords: ['beauty','hair','salon','cosmetic','makeup','skin'], emoji: '💅' },
  { keywords: ['goal','contribution'], emoji: '🎯' },
  { keywords: ['transfer'], emoji: '🔄' },
  { keywords: ['income'], emoji: '💵' },
  { keywords: ['expense'], emoji: '📤' },
  { keywords: ['book'], emoji: '📖' },
  { keywords: ['insurance'], emoji: '🛡️' },
  { keywords: ['tax'], emoji: '📋' },
  { keywords: ['repair','mainten','fix'], emoji: '🔧' },
  { keywords: ['baby','child','kid','school fee'], emoji: '👶' },
  { keywords: ['party','wedding','event','celeb'], emoji: '🎉' },
];

export const getCategoryEmoji = (name = '') => {
  if (!name) return '📋';
  const lower = name.toLowerCase().trim();
  for (const entry of CATEGORY_MAP) {
    if (entry.keywords.some(k => lower.includes(k))) return entry.emoji;
  }
  return '📋';
};

export default getCategoryEmoji;