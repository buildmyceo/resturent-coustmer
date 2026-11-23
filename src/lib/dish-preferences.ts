/**
 * AI Culinary Intelligence Engine
 * Automatically classifies dishes and determines which customer preferences
 * (Spice Level, Temperature, Sweetness Level) make culinary sense.
 */

export interface DishPreferenceConfig {
  allowSpiceLevel: boolean;
  allowTemperature: boolean;
  allowSweetnessLevel: boolean;
  rationale: string;
  dishType: 'beverage' | 'savory' | 'dessert' | 'other';
}

const BEVERAGE_KEYWORDS = [
  'coffee', 'latte', 'cappuccino', 'espresso', 'mocha', 'macchiato', 'americano',
  'frappe', 'cold brew', 'iced tea', 'shake', 'smoothie', 'juice', 'tea', 'chai',
  'cooler', 'mocktail', 'cocktail', 'lemonade', 'soda', 'brew', 'beverage', 'drink',
  'hot chocolate', 'slush', 'matcha', 'affogato', 'infusion', 'boba', 'kombucha'
];

const DESSERT_KEYWORDS = [
  'cheesecake', 'cake', 'brownie', 'pastry', 'tiramisu', 'ice cream', 'gelato',
  'sorbet', 'pancake', 'waffle', 'donut', 'doughnut', 'muffin', 'cookie', 'cupcake',
  'tart', 'pie', 'pudding', 'sundae', 'croissant', 'dessert', 'sweet', 'churros',
  'custard', 'baklava', 'halwa', 'gulab jamun', 'mousse'
];

const SAVORY_KEYWORDS = [
  'sandwich', 'burger', 'pizza', 'pasta', 'fries', 'wrap', 'roll', 'tikka',
  'paneer', 'chicken', 'arrabbiata', 'alfredo', 'maggi', 'maggie', 'corn',
  'toast', 'garlic bread', 'nachos', 'wings', 'taco', 'burrito',
  'quesadilla', 'momo', 'momos', 'samosa', 'noodle', 'noodles', 'curry',
  'biryani', 'dal', 'sub', 'panini', 'starter', 'appetizer', 'snack', 'platter',
  'soup', 'salad', 'rice', 'kebab', 'chaat', 'chili', 'chilli', 'crispy',
  'bowl', 'curries', 'gravy', 'bread', 'roti', 'naan', 'sizzler', 'meat',
  'fish', 'prawn', 'egg', 'mutton', 'lamb', 'bbq', 'barbecue'
];

export function determineDishPreferences(
  name: string,
  categoryName?: string,
  description?: string
): DishPreferenceConfig {
  const combined = `${name || ''} ${categoryName || ''} ${description || ''}`.toLowerCase();

  // 1. Check for Desserts / Sweets
  const isDessertCategory = categoryName ? /dessert|sweet|bakery|cake|pastry|ice\s*cream/i.test(categoryName) : false;
  const hasDessertKeywords = DESSERT_KEYWORDS.some((kw) => combined.includes(kw));

  // 2. Check for Beverages
  const isBeverageCategory = categoryName ? /beverage|drink|coffee|tea|shake|cooler|juice|bar/i.test(categoryName) : false;
  const hasBeverageKeywords = BEVERAGE_KEYWORDS.some((kw) => combined.includes(kw));

  // 3. Check for Savory Food (avoid false positives like "cheesecake" matching "cheese")
  const sanitizedForSavory = combined.replace(/cheesecake/g, '');
  const isSavoryCategory = categoryName ? /sandwich|burger|pizza|pasta|starter|snack|main|appetizer|food|meal/i.test(categoryName) : false;
  const hasSavoryKeywords = SAVORY_KEYWORDS.some((kw) => sanitizedForSavory.includes(kw)) || /\bcheese\b/.test(sanitizedForSavory);

  // Evaluation Priority:

  // A. Beverages (e.g. Mocha, Cold Coffee, Latte, Masala Chai)
  if (isBeverageCategory || (hasBeverageKeywords && !isDessertCategory && !isSavoryCategory)) {
    return {
      allowSpiceLevel: false,
      allowTemperature: true,
      allowSweetnessLevel: true,
      dishType: 'beverage',
      rationale: 'Beverage: Temperature and sweetness customizable. Spice level omitted.',
    };
  }

  // B. Desserts & Sweets (e.g. Chocolate Brownie, Lava Cake, Classic Cheesecake, Tiramisu)
  if (isDessertCategory || (hasDessertKeywords && !isSavoryCategory)) {
    return {
      allowSpiceLevel: false,
      allowTemperature: false,
      allowSweetnessLevel: false, // Standard baked desserts have fixed recipes
      dishType: 'dessert',
      rationale: 'Dessert: Fixed artisanal recipe. Temperature, spice, and sugar omitted.',
    };
  }

  // C. Savory Meals (e.g. Cheese Corn Sandwich, Margherita Pizza, Veg Burger, Alfredo Pasta)
  if (isSavoryCategory || hasSavoryKeywords) {
    return {
      allowSpiceLevel: true,
      allowTemperature: false,
      allowSweetnessLevel: false,
      dishType: 'savory',
      rationale: 'Savory food: Spice level customizable. Temperature and sugar omitted.',
    };
  }

  // D. Fallback default for unknown items
  return {
    allowSpiceLevel: false,
    allowTemperature: false,
    allowSweetnessLevel: false,
    dishType: 'other',
    rationale: 'Standard dish: Custom preferences disabled by default.',
  };
}

/**
 * Resolves effective preferences for a dish, taking admin overrides into account
 * and falling back to AI culinary heuristics.
 */
export function getEffectiveDishPreferences(dish: {
  name: string;
  categoryName?: string;
  description?: string;
  allowSpiceLevel?: boolean;
  allowTemperature?: boolean;
  allowSweetnessLevel?: boolean;
}) {
  const ai = determineDishPreferences(dish.name, dish.categoryName, dish.description);

  return {
    allowSpiceLevel: dish.allowSpiceLevel !== undefined ? dish.allowSpiceLevel : ai.allowSpiceLevel,
    allowTemperature: dish.allowTemperature !== undefined ? dish.allowTemperature : ai.allowTemperature,
    allowSweetnessLevel: dish.allowSweetnessLevel !== undefined ? dish.allowSweetnessLevel : ai.allowSweetnessLevel,
    aiSuggested: ai,
  };
}
