'use client';

import React, { useEffect, useState, useMemo, use } from 'react';
import Image from 'next/image';
import { useCustomer } from '@/context/CustomerContext';
import { getGuestSession } from '@/lib/guest-session';
import { createClient } from '@/lib/supabase/client';
import { Category, Dish, DietaryType } from '@/types';
import { CategoryBar } from '@/components/menu/CategoryBar';
import { DishCard } from '@/components/menu/DishCard';
import { Search, Flame, Sparkles, Filter, AlertCircle, Loader2 } from 'lucide-react';
import { fetchRestaurantAndMenuDB } from '@/lib/supabase/service';

interface MenuPageProps {
  params: Promise<{ sessionId: string }>;
}

export default function DigitalMenuPage({ params }: MenuPageProps) {
  const resolvedParams = use(params);
  const sessionId = resolvedParams.sessionId;

  const {
    restaurant,
    setRestaurant,
    table,
    setTable,
    cart,
    addToCart,
    setSelectedDishModal,
  } = useCustomer();

  const [categories, setCategories] = useState<Category[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter & Search states
  const [activeCategoryId, setActiveCategoryId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dietaryFilter, setDietaryFilter] = useState<'all' | 'veg' | 'non-veg' | 'vegan'>('all');

  // Load Restaurant & Menu from Supabase
  useEffect(() => {
    async function loadMenu() {
      setIsLoading(true);
      try {
        let targetRestId = restaurant?.id;

        // 1. Check guest session from localStorage / cookies
        const stored = getGuestSession();
        if ((!targetRestId || targetRestId.startsWith('11111111')) && stored?.restaurantId && !stored.restaurantId.startsWith('11111111')) {
          targetRestId = stored.restaurantId;
        }

        // 2. Query /api/session/verify
        if (!targetRestId || targetRestId.startsWith('11111111')) {
          const res = await fetch(`/api/session/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              restaurantId: stored?.restaurantId,
              restaurantSlug: stored?.restaurantSlug,
            }),
          });
          const data = await res.json();
          if (data.success && data.session) {
            if (data.session.restaurantId && !data.session.restaurantId.startsWith('11111111')) {
              targetRestId = data.session.restaurantId;
            }
            if (data.session.tableNumber) {
              setTable({
                id: data.session.tableId || 'ebfc2c24-6cf7-4adf-aef9-c0238b5eaa6a',
                restaurantId: targetRestId || '07e9a4c7-edae-4bf0-8786-fc220c152d43',
                number: data.session.tableNumber,
                name: data.session.tableName || `Table ${data.session.tableNumber}`,
                capacity: 4,
                isActive: true,
              });
            }
          }
        }

        // 3. Fallback directly to Supabase client if still missing
        if (!targetRestId || targetRestId.startsWith('11111111')) {
          const supabase = createClient();
          const { data: defaultRests } = await supabase
            .from('restaurants')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1);
          if (defaultRests && defaultRests.length > 0) {
            targetRestId = defaultRests[0].id;
          }
        }

        // Default to known active restaurant ID if all else fails
        if (!targetRestId || targetRestId.startsWith('11111111')) {
          targetRestId = '07e9a4c7-edae-4bf0-8786-fc220c152d43';
        }

        if (targetRestId) {
          const { restaurant: fetchedRest, categories: fetchedCats, dishes: fetchedDishes } =
            await fetchRestaurantAndMenuDB(targetRestId);

          if (fetchedRest) setRestaurant(fetchedRest);
          setCategories(fetchedCats);
          setDishes(fetchedDishes);

          // If table is still not set in context, set it from stored or default table
          if (stored?.tableNumber && stored.tableNumber !== 'Table 05' && (!table || table.number !== stored.tableNumber)) {
            setTable({
              id: stored.tableId && !stored.tableId.startsWith('44444444') ? stored.tableId : 'ebfc2c24-6cf7-4adf-aef9-c0238b5eaa6a',
              restaurantId: targetRestId,
              number: stored.tableNumber,
              name: stored.tableName || `Table ${stored.tableNumber}`,
              capacity: 4,
              isActive: true,
            });
          }
        }
      } catch (err) {
        console.warn('Error fetching menu from Supabase:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadMenu();
  }, [sessionId, restaurant?.id, setRestaurant, setTable]);

  // Cart quantity map by dishId
  const cartQuantityMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cart) {
      map.set(item.dishId, (map.get(item.dishId) || 0) + item.quantity);
    }
    return map;
  }, [cart]);

  // Filter dishes by Category, Search Query, and Dietary Preference
  const filteredDishes = useMemo(() => {
    return dishes.filter((dish) => {
      // 1. Availability filter (only available dishes)
      if (!dish.isAvailable || dish.isArchived) return false;

      // 2. Category filter
      if (activeCategoryId !== 'all' && dish.categoryId !== activeCategoryId) {
        return false;
      }

      // 3. Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = dish.name.toLowerCase().includes(query);
        const matchesDesc = (dish.description || '').toLowerCase().includes(query);
        if (!matchesName && !matchesDesc) return false;
      }

      // 4. Dietary filter
      if (dietaryFilter !== 'all') {
        const dType = (dish.dietaryType || '').toLowerCase();
        if (dietaryFilter === 'veg' && !(dType === 'vegetarian' || dType === 'veg')) return false;
        if (dietaryFilter === 'non-veg' && !(dType.includes('non') || dType === 'non_vegetarian'))
          return false;
        if (dietaryFilter === 'vegan' && !dType.includes('vegan')) return false;
      }

      return true;
    });
  }, [dishes, activeCategoryId, searchQuery, dietaryFilter]);

  // Popular / Chef's Recommendation dishes (top 4 based on ordersCount)
  const popularDishes = useMemo(() => {
    return [...dishes]
      .filter((d) => d.isAvailable && !d.isArchived)
      .sort((a, b) => (b.ordersCount || 0) - (a.ordersCount || 0))
      .slice(0, 3);
  }, [dishes]);

  // Group filtered dishes by Category
  const groupedDishes = useMemo(() => {
    if (activeCategoryId !== 'all') {
      const cat = categories.find((c) => c.id === activeCategoryId);
      return [
        {
          category: cat || { id: activeCategoryId, name: 'Menu Selection' },
          dishes: filteredDishes,
        },
      ];
    }

    const groups: { category: Category | { id: string; name: string }; dishes: Dish[] }[] = [];

    for (const cat of categories) {
      const itemsInCat = filteredDishes.filter((d) => d.categoryId === cat.id);
      if (itemsInCat.length > 0) {
        groups.push({ category: cat, dishes: itemsInCat });
      }
    }

    // Include uncategorized dishes or dishes whose category is not in the active categories list
    const uncategorized = filteredDishes.filter(
      (d) => !d.categoryId || !categories.some((c) => c.id === d.categoryId)
    );
    if (uncategorized.length > 0) {
      groups.push({
        category: {
          id: 'uncat',
          name: categories.length === 0 ? 'All Dishes' : 'Chef Specials & Beverages',
        },
        dishes: uncategorized,
      });
    }

    return groups;
  }, [categories, filteredDishes, activeCategoryId]);

  if (isLoading) {
    return (
      <div className="py-24 text-center space-y-3">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
        <h3 className="text-sm font-bold text-slate-800">Loading Chef&apos;s Menu...</h3>
        <p className="text-xs text-slate-400">Fetching live dishes from Supabase database</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Restaurant Hero Cover Image */}
      <div className="relative h-44 sm:h-56 w-full bg-slate-900 overflow-hidden sm:rounded-b-3xl">
        <Image
          src={
            restaurant?.coverImageUrl ||
            'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&auto=format&fit=crop&q=80'
          }
          alt={restaurant?.name || 'Restaurant Cover'}
          fill
          priority
          className="object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/30 to-transparent" />

        <div className="absolute bottom-4 left-4 right-4 text-white">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-300 bg-blue-950/60 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-blue-400/30">
              {restaurant?.restaurantType || 'Fine Dining & Lounge'}
            </span>
            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Kitchen Open
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white leading-tight">
            {restaurant?.name}
          </h2>
          <p className="text-xs text-slate-300 line-clamp-1 mt-0.5 max-w-xl">
            {restaurant?.description}
          </p>
        </div>
      </div>

      {/* 2. Search & Dietary Filter Bar */}
      <div className="px-4 space-y-3">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search dishes, pastas, cocktails, burrata..."
            className="w-full text-xs pl-10 pr-4 py-3 rounded-2xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-xs placeholder:text-slate-400 transition-all text-slate-900"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full w-5 h-5 flex items-center justify-center"
            >
              ×
            </button>
          )}
        </div>

        {/* Dietary Quick Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setDietaryFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold select-none transition-colors shrink-0 ${
              dietaryFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            All Diets
          </button>
          <button
            onClick={() => setDietaryFilter('veg')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold select-none transition-colors shrink-0 ${
              dietaryFilter === 'veg'
                ? 'bg-emerald-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            🌱 Vegetarian Only
          </button>
          <button
            onClick={() => setDietaryFilter('non-veg')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold select-none transition-colors shrink-0 ${
              dietaryFilter === 'non-veg'
                ? 'bg-rose-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            🍗 Non-Vegetarian
          </button>
          <button
            onClick={() => setDietaryFilter('vegan')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold select-none transition-colors shrink-0 ${
              dietaryFilter === 'vegan'
                ? 'bg-emerald-700 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            🌿 100% Vegan
          </button>
        </div>
      </div>

      {/* 3. Horizontal Sticky Category Bar */}
      <CategoryBar
        categories={categories}
        activeCategoryId={activeCategoryId}
        onSelectCategory={(id) => {
          setActiveCategoryId(id);
        }}
      />

      {/* 4. Popular / Chef's Recommendation Section (if searching is idle and "all" is active) */}
      {!searchQuery && activeCategoryId === 'all' && popularDishes.length > 0 && (
        <section className="px-4 space-y-3">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-500 fill-amber-500" />
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Chef&apos;s Signature Highlights
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {popularDishes.map((dish) => (
              <DishCard
                key={`pop-${dish.id}`}
                dish={dish}
                currency={restaurant?.currency}
                cartQuantity={cartQuantityMap.get(dish.id) || 0}
                onOpenDetail={(d) => setSelectedDishModal(d)}
                onQuickAdd={(d) => addToCart(d)}
              />
            ))}
          </div>
        </section>
      )}

      {/* 5. Main Categorized Dishes Grid */}
      <div className="px-4 space-y-8">
        {groupedDishes.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-3xl border border-slate-100 p-8 space-y-3">
            <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
            <h3 className="font-bold text-slate-800 text-sm">No dishes match your filter</h3>
            <p className="text-xs text-slate-400">Try adjusting your search query or dietary filters.</p>
            <button
              onClick={() => {
                setSearchQuery('');
                setDietaryFilter('all');
                setActiveCategoryId('all');
              }}
              className="text-xs text-blue-600 font-semibold underline mt-2"
            >
              Reset All Filters
            </button>
          </div>
        ) : (
          groupedDishes.map((group) => (
            <section key={group.category.id} className="space-y-3 scroll-mt-24">
              <div className="flex items-baseline justify-between border-b border-slate-100 pb-2">
                <h3 className="font-extrabold text-slate-900 text-lg tracking-tight">
                  {group.category.name}
                </h3>
                <span className="text-xs font-semibold text-slate-400">
                  {group.dishes.length} {group.dishes.length === 1 ? 'item' : 'items'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {group.dishes.map((dish) => (
                  <DishCard
                    key={dish.id}
                    dish={dish}
                    currency={restaurant?.currency}
                    cartQuantity={cartQuantityMap.get(dish.id) || 0}
                    onOpenDetail={(d) => setSelectedDishModal(d)}
                    onQuickAdd={(d) => addToCart(d)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

