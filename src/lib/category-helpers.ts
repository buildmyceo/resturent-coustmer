export function isEmoji(str?: string | null): boolean {
  if (!str) return false;
  const trimmed = str.trim();
  if (trimmed.startsWith('http') || trimmed.startsWith('/') || trimmed.startsWith('data:')) {
    return false;
  }
  return trimmed.length > 0 && trimmed.length <= 8;
}

export function getCategoryEmoji(category?: { name?: string; image?: string; icon?: string } | null): string {
  if (!category) return '🍽️';
  if (category.icon && isEmoji(category.icon)) return category.icon.trim();
  if (category.image && isEmoji(category.image)) return category.image.trim();

  const name = (category.name || '').toLowerCase();
  if (name.includes('hot') || name.includes('coffee') || name.includes('espresso') || name.includes('brew')) return '☕';
  if (name.includes('cold') || name.includes('shake') || name.includes('cooler') || name.includes('beverage') || name.includes('drink') || name.includes('mocktail')) return '🍹';
  if (name.includes('tea') || name.includes('chai') || name.includes('classic')) return '🍵';
  if (name.includes('sandwich') || name.includes('wrap') || name.includes('sub')) return '🥪';
  if (name.includes('burger')) return '🍔';
  if (name.includes('pizza')) return '🍕';
  if (name.includes('pasta') || name.includes('noodle') || name.includes('spaghetti')) return '🍝';
  if (name.includes('dessert') || name.includes('cake') || name.includes('pastry') || name.includes('sweet')) return '🍰';
  if (name.includes('ice cream') || name.includes('gelato')) return '🍦';
  if (name.includes('bakery') || name.includes('bread') || name.includes('croissant')) return '🥐';
  if (name.includes('salad') || name.includes('healthy') || name.includes('bowl')) return '🥗';
  if (name.includes('snack') || name.includes('starter') || name.includes('appetizer') || name.includes('fry') || name.includes('fries')) return '🍟';
  if (name.includes('taco') || name.includes('mexican')) return '🌮';
  if (name.includes('soup')) return '🍲';
  if (name.includes('rice') || name.includes('biryani') || name.includes('curry')) return '🍛';
  return '🍽️';
}
