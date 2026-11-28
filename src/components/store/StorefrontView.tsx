'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Calendar,
  Clock,
  Loader2,
  RotateCcw,
  Search,
  SearchX,
  ShoppingBag,
  Star,
  Store,
  Truck,
  User,
  UtensilsCrossed,
  X,
  Zap,
} from 'lucide-react';
import { useCustomer } from '@/context/CustomerContext';
import { DishCard } from '@/components/menu/DishCard';
import { PromoBannerCarousel } from '@/components/store/PromoBannerCarousel';
import { StorefrontBottomNav } from '@/components/store/StorefrontBottomNav';
import { CustomerAuthModal } from '@/components/auth/CustomerAuthModal';
import { createClient } from '@/lib/supabase/client';
import { fetchRestaurantAndMenuDB } from '@/lib/supabase/service';
import { formatCurrency } from '@/lib/format';
import { Category, Dish } from '@/types';

interface StorefrontViewProps {
  restaurantSlug: string;
}

export function StorefrontView({ restaurantSlug }: StorefrontViewProps) {
  const router = useRouter();
  const {
    setRestaurant: setGlobalRestaurant,
    setMenuDishes,
    cart,
    addToCart,
    updateCartQuantity,
    cartTotals,
    setSelectedDishModal,
    isShopOpen,
    operatingHoursStatus,
  } = useCustomer();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restaurant, setRestaurant] = useState<any>(null);
  const [bookingCfg, setBookingCfg] = useState<any>({});
  const [deliveryCfg, setDeliveryCfg] = useState<any>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);

  const [activeCategoryId, setActiveCategoryId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [vegOnly, setVegOnly] = useState(false);
  const [fastOnly, setFastOnly] = useState(false);
  const [bestsellerOnly, setBestsellerOnly] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setCurrentUser(data.user);
    });
  }, []);

  useEffect(() => {
    let active = true;
    const cacheKey = `ceova_storefront_cache_${restaurantSlug}`;

    // Instant render from sessionStorage cache while refreshing in background
    let hasCached = false;
    try {
      const cachedRaw = sessionStorage.getItem(cacheKey);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (cached?.restaurant?.id) {
          hasCached = true;
          setRestaurant(cached.restaurant);
          setGlobalRestaurant(cached.restaurant);
          setBookingCfg(cached.booking || {});
          setDeliveryCfg(cached.delivery || {});
          setCategories(cached.categories || []);
          setDishes(cached.dishes || []);
          setMenuDishes(cached.dishes || []);
          setLoading(false);
        }
      }
    } catch {}

    async function load() {
      if (!hasCached) setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/restaurant/info?slug=${encodeURIComponent(restaurantSlug)}`,
          { cache: 'no-store' }
        );
        const json = await res.json();
        if (!active) return;

        if (!res.ok || !json.success || !json.restaurant) {
          if (!hasCached) setError(json.error || 'Restaurant not found.');
          setLoading(false);
          return;
        }

        const rest = json.restaurant;
        const bCfg = rest.booking || json.booking || {};
        const dCfg = rest.delivery || json.delivery || {};
        setRestaurant(rest);
        setGlobalRestaurant(rest);
        setBookingCfg(bCfg);
        setDeliveryCfg(dCfg);

        const menu = await fetchRestaurantAndMenuDB(rest.id);
        if (!active) return;
        const cats = menu.categories || [];
        const dsh = menu.dishes || [];
        setCategories(cats);
        setDishes(dsh);
        setMenuDishes(dsh);

        try {
          sessionStorage.setItem(
            cacheKey,
            JSON.stringify({
              restaurant: rest,
              booking: bCfg,
              delivery: dCfg,
              categories: cats,
              dishes: dsh,
            })
          );
        } catch {}
      } catch (err: any) {
        if (active && !hasCached) setError(err?.message || 'Failed to load restaurant menu.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [restaurantSlug, setGlobalRestaurant, setMenuDishes]);

  // Keep delivery checkout sessionStorage in sync with CustomerContext cart
  useEffect(() => {
    try {
      const simplified = cart.map((c) => ({
        dishId: c.dishId,
        dishName: c.dishName,
        price: Number(c.unitPrice || 0),
        quantity: c.quantity,
      }));
      sessionStorage.setItem(
        `ceova_delivery_cart_${restaurantSlug}`,
        JSON.stringify(simplified)
      );
    } catch {}
  }, [cart, restaurantSlug]);

  const cartQuantityMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cart) {
      map.set(item.dishId, (map.get(item.dishId) || 0) + item.quantity);
    }
    return map;
  }, [cart]);

  const filteredDishes = useMemo(() => {
    return dishes.filter((d) => {
      if (!d.isAvailable || d.isArchived) return false;
      if (activeCategoryId !== 'all' && d.categoryId !== activeCategoryId) return false;
      if (vegOnly) {
        const dType = (d.dietaryType || '').toLowerCase();
        if (!(dType === 'vegetarian' || dType === 'veg' || dType === 'vegan')) return false;
      }
      if (fastOnly && (d.prepTime || 15) > 10) return false;
      if (bestsellerOnly && !((d as any).isPopular || (d as any).isRecommended || (d.ordersCount || 0) > 0)) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          d.name.toLowerCase().includes(q) ||
          (d.description || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [dishes, activeCategoryId, vegOnly, fastOnly, bestsellerOnly, searchQuery]);

  const groupedDishes = useMemo(() => {
    const groups: { category: Category; dishes: Dish[] }[] = [];
    for (const cat of categories) {
      const catDishes = filteredDishes.filter((d) => d.categoryId === cat.id);
      if (catDishes.length > 0) {
        groups.push({ category: cat, dishes: catDishes });
      }
    }
    const uncategorized = filteredDishes.filter(
      (d) => !categories.some((c) => c.id === d.categoryId)
    );
    if (uncategorized.length > 0) {
      groups.push({
        category: {
          id: 'other',
          restaurantId: restaurant?.id || '',
          name: 'Other Items',
          displayOrder: 999,
          isActive: true,
        },
        dishes: uncategorized,
      });
    }
    return groups;
  }, [categories, filteredDishes, restaurant?.id]);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3 p-6">
        <Loader2 className="w-8 h-8 text-light-primary animate-spin" />
        <p className="font-body text-sm text-light-on-surface-variant">Loading menu...</p>
      </div>
    );
  }

  if (error || !restaurant) {
    return (
      <main className="min-h-[70vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-light-surface-container-lowest border border-light-outline-variant/60 rounded-2xl p-8 text-center space-y-3">
          <Store className="w-10 h-10 text-light-outline mx-auto" />
          <h1 className="font-headline text-lg font-bold text-light-on-surface">
            Restaurant Unavailable
          </h1>
          <p className="font-body text-sm text-light-on-surface-variant">
            {error || 'This restaurant menu could not be loaded.'}
          </p>
        </div>
      </main>
    );
  }

  const restaurantName = restaurant.name || 'Barista';
  const restaurantDesc =
    restaurant.description ||
    'Freshly brewed single-origin coffees, handcrafted artisanal beverages, and bistro bites prepared to order.';
  const coverImage =
    restaurant.coverImageUrl ||
    restaurant.cover_image_url ||
    'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1600&q=80';
  const currency = restaurant.currency || 'INR';

  return (
    <div className="space-y-6 pb-28">
      {/* 1. Hero Banner (Identical to Table Menu Page) */}
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-5 pb-1">
        <div className="relative overflow-hidden rounded-2xl bg-light-surface-container border border-light-outline-variant/40 min-h-[190px] sm:min-h-[230px] flex flex-col justify-end p-5 sm:p-7 shadow-xs">
          <Image
            src={coverImage}
            alt={restaurantName}
            fill
            priority
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#2D312E]/95 via-[#2D312E]/60 to-transparent" />
          {/* Top-right Profile Button */}
          <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
            <Link
              href={`/store/${restaurantSlug}/profile`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/20 backdrop-blur-md border border-white/25 text-white font-label text-xs font-semibold hover:bg-white/30 transition-colors shadow-xs"
            >
              <User className="w-3.5 h-3.5" />
              <span>
                {currentUser
                  ? currentUser.user_metadata?.full_name || currentUser.email
                  : 'Profile'}
              </span>
            </Link>
          </div>
          <div className="relative z-10 text-white flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 bg-light-primary text-light-on-primary px-2.5 py-1 rounded-full shadow-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-light-on-primary-container animate-pulse" />
                  <span className="font-label text-xs uppercase tracking-wider font-semibold">
                    {isShopOpen ? 'Kitchen Open' : 'Kitchen Closed'}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-md text-white px-2.5 py-1 rounded-full text-xs font-semibold">
                  <UtensilsCrossed className="w-3.5 h-3.5" />
                  <span className="font-label text-xs">
                    {deliveryCfg?.enabled ? 'Dine-In & Delivery' : 'Dine-In Menu'}
                  </span>
                </span>
              </div>
              <h1 className="font-headline text-2xl sm:text-3xl lg:text-4xl text-white mb-1 tracking-tight">
                {restaurantName} Craft Menu
              </h1>
              <p className="font-body text-xs sm:text-sm text-[#EEF2EC]/90 line-clamp-2 leading-relaxed">
                {restaurantDesc}
              </p>
            </div>

            {/* Book Table & Delivery Quick Actions */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {bookingCfg?.enabled && (
                <Link
                  href={`/store/${restaurantSlug}/book`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white text-slate-900 font-label text-xs font-bold hover:bg-slate-100 transition-colors shadow-sm"
                >
                  <Calendar className="w-3.5 h-3.5 text-light-primary" />
                  <span>Book a Table</span>
                  {Number(bookingCfg.feeAmount || 0) > 0 && (
                    <span className="text-[11px] text-light-primary">
                      ({formatCurrency(Number(bookingCfg.feeAmount), currency)})
                    </span>
                  )}
                </Link>
              )}
              {deliveryCfg?.enabled && (
                <span className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-full bg-emerald-600/90 backdrop-blur-md text-white font-label text-xs font-semibold">
                  <Truck className="w-3.5 h-3.5" />
                  <span>Delivery up to {Math.min(20, Number(deliveryCfg.radiusKm || 5))} km</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Promotional Rectangular Banners */}
      <PromoBannerCarousel banners={restaurant?.promoBanners} placement="online" />

      {/* Shop Closed Warning Banner */}
      {!isShopOpen && (
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
          <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl space-y-2 text-xs shadow-xs">
            <div className="flex items-center gap-2 text-amber-900 font-bold">
              <Store className="w-4 h-4 text-amber-600" />
              <span>Restaurant is Currently Closed</span>
            </div>
            <p className="text-amber-950 font-medium leading-relaxed">
              {operatingHoursStatus.reason ||
                'Online food ordering is temporarily paused outside of restaurant operating hours.'}
            </p>
          </div>
        </div>
      )}

      {/* 2. Sticky Search & Quick Dietary Filters */}
      <div className="sticky top-0 z-30 bg-light-surface/95 backdrop-blur-md border-b border-light-outline-variant/40 py-2.5 px-4 sm:px-6 shadow-2xs">
        <div className="max-w-[1200px] mx-auto flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-light-outline pointer-events-none" />
              <input
                id="dish-search-input"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search coffee, tea, breakfast, pastries..."
                className="w-full bg-light-surface-container-lowest border border-light-outline-variant/80 rounded-full pl-10 pr-10 py-2.5 font-body text-xs sm:text-sm text-light-on-surface placeholder:text-light-outline focus:outline-none focus:ring-2 focus:ring-light-primary/30 focus:border-light-primary transition-all shadow-2xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-light-surface-variant flex items-center justify-center text-light-on-surface-variant hover:bg-light-outline-variant transition-colors"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setVegOnly(!vegOnly)}
                aria-pressed={vegOnly}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full border text-xs font-label font-semibold transition-all cursor-pointer shadow-2xs ${
                  vegOnly
                    ? 'border-veg bg-veg text-white shadow-xs'
                    : 'border-light-outline-variant/80 bg-light-surface-container-lowest text-light-on-surface hover:bg-light-surface-container'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${vegOnly ? 'bg-white' : 'bg-veg'}`} />
                <span>Pure Veg</span>
              </button>

              <button
                onClick={() => setFastOnly(!fastOnly)}
                aria-pressed={fastOnly}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full border text-xs font-label font-semibold transition-all cursor-pointer shadow-2xs ${
                  fastOnly
                    ? 'border-amber-600 bg-amber-600 text-white shadow-xs'
                    : 'border-light-outline-variant/80 bg-light-surface-container-lowest text-light-on-surface hover:bg-light-surface-container'
                }`}
              >
                <Zap className={`w-3.5 h-3.5 ${fastOnly ? 'text-white' : 'text-warning fill-warning'}`} />
                <span>Under 10m</span>
              </button>

              <button
                onClick={() => setBestsellerOnly(!bestsellerOnly)}
                aria-pressed={bestsellerOnly}
                className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-full border text-xs font-label font-semibold transition-all cursor-pointer shadow-2xs ${
                  bestsellerOnly
                    ? 'border-amber-500 bg-amber-500 text-white shadow-xs'
                    : 'border-light-outline-variant/80 bg-light-surface-container-lowest text-light-on-surface hover:bg-light-surface-container'
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${bestsellerOnly ? 'text-white fill-white' : 'text-amber-500 fill-amber-500'}`} />
                <span>Bestsellers</span>
              </button>
            </div>
          </div>

          {/* Horizontal Category Tabs Strip */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 -mx-4 sm:-mx-6 px-4 sm:px-6">
            <button
              onClick={() => setActiveCategoryId('all')}
              className={`category-pill shrink-0 inline-flex items-center px-4 py-2 rounded-full font-label text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                activeCategoryId === 'all'
                  ? 'bg-light-primary text-light-on-primary shadow-xs'
                  : 'bg-light-surface-container-lowest border border-light-outline-variant/80 text-light-on-surface hover:bg-light-surface-container'
              }`}
            >
              <span>All Items</span>
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategoryId(cat.id)}
                className={`category-pill shrink-0 inline-flex items-center px-4 py-2 rounded-full font-label text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  activeCategoryId === cat.id
                    ? 'bg-light-primary text-light-on-primary shadow-xs'
                    : 'bg-light-surface-container-lowest border border-light-outline-variant/80 text-light-on-surface hover:bg-light-surface-container'
                }`}
              >
                <span>
                  {cat.name.replace(/^[\p{Emoji}\u200d\uFE0F\s]+/u, '').trim() || cat.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Main Categorized Dishes Grid */}
      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-2 flex-1 space-y-10">
        {groupedDishes.length === 0 ? (
          <div className="py-16 text-center space-y-3 bg-light-surface-container-lowest border border-dashed border-light-outline-variant/80 rounded-2xl p-8">
            <div className="w-14 h-14 mx-auto rounded-full bg-light-surface-container flex items-center justify-center text-light-outline">
              <SearchX className="w-7 h-7" />
            </div>
            <h3 className="font-headline text-lg font-bold text-light-on-surface">
              No matching dishes found
            </h3>
            <p className="font-body text-xs sm:text-sm text-light-on-surface-variant max-w-sm mx-auto">
              We couldn&apos;t find anything matching your search or filters.
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setVegOnly(false);
                setFastOnly(false);
                setBestsellerOnly(false);
                setActiveCategoryId('all');
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-light-primary text-light-on-primary rounded-full font-label text-xs font-semibold hover:bg-light-primary-container transition-colors cursor-pointer shadow-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Show All Items</span>
            </button>
          </div>
        ) : (
          groupedDishes.map((group) => (
            <section key={group.category.id} className="menu-section space-y-4 scroll-mt-36">
              <div className="flex items-baseline justify-between gap-3 border-b border-light-outline-variant/50 pb-2">
                <div>
                  <h2 className="font-headline text-xl sm:text-2xl font-semibold text-light-on-surface">
                    {group.category.name.replace(/^[\p{Emoji}\u200d\uFE0F\s]+/u, '').trim() ||
                      group.category.name}
                  </h2>
                  {(group.category as any)?.description && (
                    <p className="font-body text-xs sm:text-sm text-light-on-surface-variant mt-0.5">
                      {(group.category as any).description}
                    </p>
                  )}
                </div>
                <span className="font-label text-xs text-light-outline shrink-0 bg-light-surface-container px-2.5 py-1 rounded-full font-medium">
                  {group.dishes.length} {group.dishes.length === 1 ? 'item' : 'items'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {group.dishes.map((dish) => (
                  <DishCard
                    key={dish.id}
                    dish={dish}
                    currency={currency}
                    cartQuantity={cartQuantityMap.get(dish.id) || 0}
                    onOpenDetail={(d) => setSelectedDishModal(d)}
                    onQuickAdd={(d) => addToCart(d)}
                    onDecrement={(d) => {
                      const existingCartItem = cart.find((item) => item.dishId === d.id);
                      if (existingCartItem) {
                        updateCartQuantity(
                          existingCartItem.cartItemId,
                          existingCartItem.quantity - 1
                        );
                      }
                    }}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      {/* Floating Cart Pill above Bottom Nav */}
      {cartTotals.itemCount > 0 && (
        <div className="fixed bottom-20 inset-x-4 z-40 max-w-md mx-auto">
          <button
            type="button"
            onClick={() => router.push(`/store/${restaurantSlug}/checkout`)}
            className="w-full bg-light-primary text-light-on-primary rounded-full px-4 py-3 shadow-xl flex items-center justify-between gap-4 hover:opacity-95 transition-opacity cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-sm font-bold">
                {cartTotals.itemCount}
              </span>
              <div className="text-left leading-tight">
                <p className="text-[11px] opacity-85">
                  {cartTotals.itemCount} {cartTotals.itemCount === 1 ? 'item' : 'items'}
                </p>
                <p className="text-sm font-bold">
                  {formatCurrency(cartTotals.subtotal, currency)}
                </p>
              </div>
            </div>

            <span className="inline-flex items-center gap-1.5 text-sm font-bold pr-1">
              <span>View Cart</span>
              <ArrowRight className="w-4 h-4" />
            </span>
          </button>
        </div>
      )}
      <StorefrontBottomNav restaurantSlug={restaurantSlug} />
      <CustomerAuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={(u) => setCurrentUser(u)}
      />
    </div>
  );
}
