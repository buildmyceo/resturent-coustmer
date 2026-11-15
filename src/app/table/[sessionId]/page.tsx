'use client';

import React, { useEffect, useState, useMemo, use } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useCustomer } from '@/context/CustomerContext';
import { getGuestSession } from '@/lib/guest-session';
import { createClient } from '@/lib/supabase/client';
import { Category, Dish, DietaryType } from '@/types';
import { CategoryBar } from '@/components/menu/CategoryBar';
import { DishCard } from '@/components/menu/DishCard';
import { Search, Flame, Sparkles, Filter, AlertCircle, Loader2, CheckCircle2, QrCode, MapPinOff, RefreshCw, AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { fetchRestaurantAndMenuDB } from '@/lib/supabase/service';
import { formatDistance } from '@/lib/geofence';
import { formatCurrency } from '@/lib/format';

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
    orders,
    isInsideGeofence,
    distanceToRestaurant,
    locationStatus,
    checkCustomerLocation,
    cartTotals,
    updateCartQuantity,
  } = useCustomer();

  const [categories, setCategories] = useState<Category[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Check if previous table orders are fully settled and no active session
  const isSessionSettled = useMemo(() => {
    const stored = getGuestSession();
    if (!stored && orders.length > 0 && orders.every((o) => o.paymentStatus === 'paid' || o.status === 'completed')) {
      return true;
    }
    return false;
  }, [orders]);

  // Filter & Search states
  const [activeCategoryId, setActiveCategoryId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dietaryFilter, setDietaryFilter] = useState<'all' | 'veg' | 'non-veg' | 'vegan'>('all');
  const [priceSort, setPriceSort] = useState<'default' | 'low-high' | 'high-low'>('default');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

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

  // Filter dishes by Category, Search Query, Dietary Preference, and Price Sort
  const filteredDishes = useMemo(() => {
    let result = dishes.filter((dish) => {
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

    if (priceSort === 'low-high') {
      result = [...result].sort((a, b) => a.price - b.price);
    } else if (priceSort === 'high-low') {
      result = [...result].sort((a, b) => b.price - a.price);
    }

    return result;
  }, [dishes, activeCategoryId, searchQuery, dietaryFilter, priceSort]);

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
      {/* 1. Restaurant Hero Cover Image (16:9 Landscape Aspect Ratio) */}
      <div className="relative aspect-[16/9] max-h-56 w-full bg-slate-900 overflow-hidden sm:rounded-b-3xl">
        <Image
          src={
            restaurant?.coverImageUrl ||
            'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&auto=format&fit=crop&q=80'
          }
          alt={restaurant?.name || 'Restaurant Cover'}
          fill
          priority
          className="object-cover opacity-85"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/35 to-transparent" />

        <div className="absolute bottom-3 left-3.5 right-3.5 text-white">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-300 bg-blue-950/70 backdrop-blur-md px-2 py-0.5 rounded-full border border-blue-400/30">
              {restaurant?.restaurantType || 'Fine Dining & Lounge'}
            </span>
            <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1 bg-slate-900/40 backdrop-blur-xs px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Kitchen Open
            </span>
          </div>
          <h2 className="text-lg sm:text-2xl font-black text-white leading-tight drop-shadow-xs">
            {restaurant?.name}
          </h2>
          {restaurant?.description && (
            <p className="text-[11px] sm:text-xs text-slate-200 line-clamp-1 mt-0.5 max-w-xl drop-shadow-xs">
              {restaurant?.description}
            </p>
          )}
        </div>
      </div>

      {/* Location Checking Indicator */}
      {locationStatus === 'checking' && (
        <div className="mx-4 px-3.5 py-2.5 bg-blue-50 border border-blue-200/80 rounded-xl flex items-center justify-between text-xs text-blue-800 shadow-xs animate-pulse">
          <div className="flex items-center gap-2 font-medium">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
            <span>Verifying location for restaurant ordering circle...</span>
          </div>
          <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md">
            GPS Check
          </span>
        </div>
      )}

      {/* Location Geofence Boundary Alert */}
      {isInsideGeofence === false && (
        <div className="mx-4 p-5 bg-gradient-to-br from-rose-50 to-amber-50 border-2 border-rose-300 rounded-3xl space-y-4 shadow-lg animate-in fade-in">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-md">
              <MapPinOff className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full border border-rose-200 inline-block">
                Location Verification
              </span>
              <h3 className="text-base font-black text-slate-900 leading-tight">
                Outside Restaurant Ordering Area
              </h3>
              <p className="text-xs font-semibold text-rose-900 leading-relaxed pt-0.5">
                Visit restaurant to order food, or scan QR code if you are in a different restaurant.
              </p>
            </div>
          </div>

          {locationStatus === 'denied' && (
            <div className="bg-white/90 p-3 rounded-2xl border border-rose-200 text-xs text-rose-800">
              <span className="font-bold">Location Permission Required:</span> Please enable location/GPS in your browser settings so we can verify you are at the restaurant dining area.
            </div>
          )}

          {distanceToRestaurant !== null && (
            <div className="bg-white/80 backdrop-blur-xs p-3 rounded-2xl border border-rose-200/80 text-xs text-slate-600 space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Your current distance:</span>
                <span className="font-bold text-rose-700 font-mono">
                  {formatDistance(distanceToRestaurant)} away
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Permitted dining circle:</span>
                <span className="font-bold text-slate-800 font-mono">
                  within {restaurant?.settings?.geofence?.radiusMeters || 200}m
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <Link href="/" className="flex-1">
              <Button size="md" className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold gap-2 py-3 rounded-xl shadow-xs">
                <QrCode className="w-4 h-4 text-emerald-400" />
                <span>Scan QR Code (Different Restaurant)</span>
              </Button>
            </Link>

            <Button
              variant="outline"
              size="md"
              onClick={checkCustomerLocation}
              isLoading={locationStatus === 'checking'}
              className="border-rose-300 text-rose-800 hover:bg-rose-100/60 text-xs font-semibold gap-1.5 py-3 rounded-xl"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Re-check Location</span>
            </Button>
          </div>
        </div>
      )}

      {/* Settled Dining Session Notice */}
      {isSessionSettled && (
        <div className="mx-4 p-4 bg-emerald-50/95 border border-emerald-200/90 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
                Table Bill Settled & Paid
              </p>
              <p className="text-[11px] text-emerald-800 mt-0.5">
                All dishes for this dining session have been paid. To order new food, please scan the table QR code.
              </p>
            </div>
          </div>
          <Link href="/" className="shrink-0 w-full sm:w-auto">
            <Button size="sm" className="w-full sm:w-auto bg-emerald-700 hover:bg-emerald-800 text-white gap-2 text-xs shadow-xs">
              <QrCode className="w-4 h-4" />
              <span>Scan QR Code</span>
            </Button>
          </Link>
        </div>
      )}

      {/* 2. Search & Filter Bar */}
      <div className="px-4">
        <div className="flex items-center gap-2">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search dishes, drinks, desserts..."
              className="w-full text-xs pl-10 pr-8 py-3 rounded-2xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-xs placeholder:text-slate-400 transition-all text-slate-900"
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

          {/* Filter Trigger Button */}
          <button
            onClick={() => setIsFilterModalOpen(true)}
            className={`p-3 rounded-2xl border flex items-center justify-center gap-1.5 text-xs font-bold transition-all shadow-xs cursor-pointer shrink-0 ${
              dietaryFilter !== 'all' || priceSort !== 'default'
                ? 'bg-emerald-600 border-emerald-600 text-white shadow-emerald-500/20'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
            title="Open Filters"
          >
            <Filter className="w-4 h-4" />
            <span>Filter</span>
            {(dietaryFilter !== 'all' || priceSort !== 'default') && (
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            )}
          </button>
        </div>

        {/* Active Filter Badges (if any applied) */}
        {(dietaryFilter !== 'all' || priceSort !== 'default') && (
          <div className="flex items-center gap-2 mt-2 pt-1 flex-wrap">
            {dietaryFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                {dietaryFilter === 'veg' ? 'Veg Only' : dietaryFilter === 'non-veg' ? 'Non-Veg Only' : 'Vegan Only'}
                <button
                  onClick={() => setDietaryFilter('all')}
                  className="hover:text-emerald-950 font-black ml-0.5"
                >
                  ×
                </button>
              </span>
            )}
            {priceSort !== 'default' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200 px-2.5 py-0.5 rounded-full">
                {priceSort === 'low-high' ? 'Price: Low to High' : 'Price: High to Low'}
                <button
                  onClick={() => setPriceSort('default')}
                  className="hover:text-slate-950 font-black ml-0.5"
                >
                  ×
                </button>
              </span>
            )}
            <button
              onClick={() => {
                setDietaryFilter('all');
                setPriceSort('default');
              }}
              className="text-[11px] text-slate-400 hover:text-slate-600 font-semibold underline"
            >
              Clear all
            </button>
          </div>
        )}
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

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-3">
            {popularDishes.map((dish) => (
              <DishCard
                key={`pop-${dish.id}`}
                dish={dish}
                currency={restaurant?.currency}
                cartQuantity={cartQuantityMap.get(dish.id) || 0}
                onOpenDetail={(d) => setSelectedDishModal(d)}
                onQuickAdd={(d) => addToCart(d)}
                onDecrement={(d) => {
                  const existingCartItem = cart.find((item) => item.dishId === d.id);
                  if (existingCartItem) {
                    updateCartQuantity(existingCartItem.cartItemId, existingCartItem.quantity - 1);
                  }
                }}
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
          groupedDishes.map((group) => {
            const catImage = (group.category as any)?.image;
            const hasCatImage = Boolean(catImage && catImage.trim() !== '');

            return (
              <section key={group.category.id} className="space-y-3.5 scroll-mt-24">
                {/* Category Header with Banner Image (Consistent 16:9 Landscape Aspect Ratio matching Admin) */}
                {hasCatImage ? (
                  <div className="relative aspect-[16/9] max-h-48 sm:max-h-56 w-full rounded-2xl overflow-hidden shadow-xs border border-slate-100 group">
                    <img
                      src={catImage}
                      alt={group.category.name}
                      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/25 to-transparent" />
                    <div className="absolute bottom-2.5 left-3.5 right-3.5 flex items-end justify-between text-white">
                      <div>
                        <h3 className="font-black text-lg sm:text-xl tracking-tight text-white drop-shadow-sm leading-tight">
                          {group.category.name}
                        </h3>
                        {(group.category as any)?.description && (
                          <p className="text-[11px] sm:text-xs text-white/80 line-clamp-1 mt-0.5">
                            {(group.category as any).description}
                          </p>
                        )}
                      </div>
                      <span className="text-[11px] sm:text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-md border border-white/20 text-white shrink-0">
                        {group.dishes.length} {group.dishes.length === 1 ? 'item' : 'items'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-baseline justify-between border-b border-slate-100 pb-2">
                    <h3 className="font-extrabold text-slate-900 text-lg tracking-tight">
                      {group.category.name}
                    </h3>
                    <span className="text-xs font-semibold text-slate-400">
                      {group.dishes.length} {group.dishes.length === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-3">
                  {group.dishes.map((dish) => (
                    <DishCard
                      key={dish.id}
                      dish={dish}
                      currency={restaurant?.currency}
                      cartQuantity={cartQuantityMap.get(dish.id) || 0}
                      onOpenDetail={(d) => setSelectedDishModal(d)}
                      onQuickAdd={(d) => addToCart(d)}
                      onDecrement={(d) => {
                        const existingCartItem = cart.find((item) => item.dishId === d.id);
                        if (existingCartItem) {
                          updateCartQuantity(existingCartItem.cartItemId, existingCartItem.quantity - 1);
                        }
                      }}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>

      {/* Modern Compact Floating View Cart Pill */}
      {cartTotals.itemCount > 0 && (
        <div className="fixed bottom-20 left-0 right-0 z-40 px-4 pointer-events-none flex justify-center">
          <div className="w-full max-w-sm pointer-events-auto animate-in slide-in-from-bottom-3 duration-200">
            <Link
              href={`/table/${sessionId}/cart`}
              className="flex items-center justify-between bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2.5 rounded-full shadow-lg shadow-emerald-950/25 active:scale-[0.98] transition-all cursor-pointer border border-emerald-600/40"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs">
                  {cartTotals.itemCount}
                </div>
                <div className="leading-tight">
                  <span className="text-[10px] text-emerald-100 font-medium block">
                    {cartTotals.itemCount} {cartTotals.itemCount === 1 ? 'item' : 'items'}
                  </span>
                  <span className="text-xs font-black font-mono">
                    {formatCurrency(cartTotals.subtotal, restaurant?.currency)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 font-bold text-xs tracking-wide">
                <span>View Cart</span>
                <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* Filter Modal (Price & Veg/Non-Veg options) */}
      {isFilterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200 p-0 sm:p-4">
          <div
            className="fixed inset-0"
            onClick={() => setIsFilterModalOpen(false)}
          />

          <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 space-y-5 z-10 animate-in slide-in-from-bottom duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-emerald-600" />
                <h3 className="font-black text-base text-slate-900">Filter Menu</h3>
              </div>
              <button
                onClick={() => setIsFilterModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Section 1: Food Preference (Veg / Non-Veg) */}
            <div className="space-y-2.5">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                Food Preference
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDietaryFilter('all')}
                  className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    dietaryFilter === 'all'
                      ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>All Dishes</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDietaryFilter('veg')}
                  className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    dietaryFilter === 'veg'
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                      : 'bg-emerald-50/50 border-emerald-200 text-emerald-800 hover:bg-emerald-100/60'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span>Veg Only</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDietaryFilter('non-veg')}
                  className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    dietaryFilter === 'non-veg'
                      ? 'bg-rose-600 border-rose-600 text-white shadow-xs'
                      : 'bg-rose-50/50 border-rose-200 text-rose-800 hover:bg-rose-100/60'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  <span>Non-Veg Only</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDietaryFilter('vegan')}
                  className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    dietaryFilter === 'vegan'
                      ? 'bg-teal-700 border-teal-700 text-white shadow-xs'
                      : 'bg-teal-50/50 border-teal-200 text-teal-800 hover:bg-teal-100/60'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                  <span>Vegan Only</span>
                </button>
              </div>
            </div>

            {/* Section 2: Price Sorting */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                Sort by Price
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPriceSort('default')}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer ${
                    priceSort === 'default'
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Featured
                </button>

                <button
                  type="button"
                  onClick={() => setPriceSort('low-high')}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer ${
                    priceSort === 'low-high'
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  ₹ Low to High
                </button>

                <button
                  type="button"
                  onClick={() => setPriceSort('high-low')}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer ${
                    priceSort === 'high-low'
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  ₹ High to Low
                </button>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setDietaryFilter('all');
                  setPriceSort('default');
                }}
                className="flex-1 py-3 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Reset All
              </button>
              <button
                type="button"
                onClick={() => setIsFilterModalOpen(false)}
                className="flex-1 py-3 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

