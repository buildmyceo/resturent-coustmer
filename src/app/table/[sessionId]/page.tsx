'use client';

import React, { useEffect, useState, useMemo, use } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useCustomer } from '@/context/CustomerContext';
import { getGuestSession } from '@/lib/guest-session';
import { createClient } from '@/lib/supabase/client';
import { Category, Dish } from '@/types';
import { DishCard } from '@/components/menu/DishCard';
import {
  Search,
  X,
  Zap,
  Star,
  UtensilsCrossed,
  Clock,
  ArrowRight,
  RotateCcw,
  SearchX,
  AlertCircle,
  MapPinOff,
  QrCode,
  RefreshCw,
  CheckCircle2,
  Store,
  Loader2,
  Coffee,
} from 'lucide-react';
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
    setMenuDishes,
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
    isShopOpen,
    operatingHoursStatus,
    setIsSessionDeactivated,
    clearSessionState,
  } = useCustomer();

  const [categories, setCategories] = useState<Category[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter & Search states
  const [activeCategoryId, setActiveCategoryId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [vegOnly, setVegOnly] = useState(false);
  const [fastOnly, setFastOnly] = useState(false);
  const [bestsellerOnly, setBestsellerOnly] = useState(false);

  // Check if previous table orders are fully settled and no active session
  const isSessionSettled = useMemo(() => {
    const stored = getGuestSession();
    if (!stored && orders.length > 0 && orders.every((o) => o.paymentStatus === 'paid' || o.status === 'completed')) {
      return true;
    }
    return false;
  }, [orders]);

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
          if (data.isExpired || data.isDeactivated || data.sessionStatus === 'cancelled' || !data.success) {
            clearSessionState();
            setIsSessionDeactivated(true);
            setIsLoading(false);
            return;
          }
          if (data.success && data.session) {
            if (data.session.restaurantId && !data.session.restaurantId.startsWith('11111111')) {
              targetRestId = data.session.restaurantId;
            }
            if (data.session.tableNumber) {
              setTable({
                id: data.session.tableId || '24f7b562-0d70-4f5e-bde4-9bd01639dbb6',
                restaurantId: targetRestId || 'a9feec11-8dee-4202-be6e-a097e45266e6',
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
          targetRestId = 'a9feec11-8dee-4202-be6e-a097e45266e6';
        }

        if (targetRestId) {
          const { restaurant: fetchedRest, categories: fetchedCats, dishes: fetchedDishes } =
            await fetchRestaurantAndMenuDB(targetRestId);

          if (fetchedRest) setRestaurant(fetchedRest);
          setCategories(fetchedCats);
          setDishes(fetchedDishes);
          setMenuDishes(fetchedDishes);

          // If table is still not set in context, set it from stored or default table
          if (stored?.tableNumber && stored.tableNumber !== 'Table 05' && (!table || table.number !== stored.tableNumber)) {
            setTable({
              id: stored.tableId && !stored.tableId.startsWith('44444444') ? stored.tableId : '24f7b562-0d70-4f5e-bde4-9bd01639dbb6',
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

  // Filter dishes by Category, Search Query, Veg, Speed, and Bestseller
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

      // 4. Quick filter: Veg Only
      if (vegOnly) {
        const dType = (dish.dietaryType || '').toLowerCase();
        if (!(dType === 'vegetarian' || dType === 'veg' || dType === 'vegan')) return false;
      }

      // 5. Quick filter: Fast / Under 10m
      if (fastOnly) {
        const prep = dish.prepTime || 12;
        if (prep > 10) return false;
      }

      // 6. Quick filter: Bestsellers / Signature
      if (bestsellerOnly) {
        const isPop = dish.isSignature === true || (dish.ordersCount && dish.ordersCount > 2);
        if (!isPop) return false;
      }

      return true;
    });
  }, [dishes, activeCategoryId, searchQuery, vegOnly, fastOnly, bestsellerOnly]);

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
      <div className="py-28 text-center space-y-3">
        <Loader2 className="w-8 h-8 text-light-primary animate-spin mx-auto" />
        <h3 className="text-sm font-bold text-light-on-surface">Loading Chef&apos;s Menu...</h3>
        <p className="text-xs text-light-on-surface-variant">Fetching live dishes from restaurant</p>
      </div>
    );
  }

  const restaurantName = restaurant?.name || 'Barista';
  const restaurantDesc =
    restaurant?.description ||
    'Freshly brewed single-origin coffees, handcrafted artisanal beverages, and European bistro bites prepared to order for your table.';
  const coverImage =
    restaurant?.coverImageUrl ||
    'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1600&q=80';

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Hero Banner */}
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
          <div className="relative z-10 text-white max-w-2xl">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 bg-light-primary text-light-on-primary px-2.5 py-1 rounded-full shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-light-on-primary-container animate-pulse" />
                <span className="font-label text-xs uppercase tracking-wider font-semibold">
                  {isShopOpen ? 'Kitchen Open' : 'Kitchen Closed'}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-md text-white px-2.5 py-1 rounded-full text-xs font-semibold">
                <UtensilsCrossed className="w-3.5 h-3.5" />
                <span className="font-label text-xs">Table Service Active</span>
              </span>
            </div>
            <h1 className="font-headline text-2xl sm:text-3xl lg:text-4xl text-white mb-1 tracking-tight">
              {restaurantName} Craft Menu
            </h1>
            <p className="font-body text-xs sm:text-sm text-[#EEF2EC]/90 line-clamp-2 leading-relaxed">
              {restaurantDesc}
            </p>
          </div>
        </div>
      </div>

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
            <div className="flex items-center gap-1.5 text-[11px] text-amber-800 pt-0.5">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>
                Schedule ({operatingHoursStatus.currentDayName}):{' '}
                {operatingHoursStatus.todaySchedule?.closed
                  ? 'Closed all day'
                  : `${operatingHoursStatus.todaySchedule?.open} to ${operatingHoursStatus.todaySchedule?.close}`}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Location Checking Indicator */}
      {locationStatus === 'checking' && (
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
          <div className="px-3.5 py-2.5 bg-light-secondary-container/60 border border-light-secondary text-xs text-light-on-secondary-container rounded-xl flex items-center justify-between shadow-xs animate-pulse">
            <div className="flex items-center gap-2 font-medium">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-light-primary" />
              <span>Verifying location for restaurant ordering circle...</span>
            </div>
            <span className="text-[10px] font-bold text-light-primary bg-light-surface-container px-2 py-0.5 rounded-md">
              GPS Check
            </span>
          </div>
        </div>
      )}

      {/* Location Geofence Boundary Alert */}
      {isInsideGeofence === false && (
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
          <div className="p-5 bg-gradient-to-br from-rose-50 to-amber-50 border-2 border-rose-300 rounded-3xl space-y-4 shadow-lg animate-in fade-in">
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
              <div className="bg-white/95 p-3.5 rounded-2xl border border-rose-300 text-xs text-rose-900 space-y-1 shadow-xs">
                <div className="flex items-center gap-1.5 font-bold text-rose-800">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Location Permission Required</span>
                </div>
                <p className="text-[11px] text-slate-700 leading-relaxed">
                  Your browser or device has blocked location access. Please tap the lock/tune icon in the browser address bar to <strong>Allow Location</strong>, then click <strong>Re-check Location</strong> below.
                </p>
              </div>
            )}

            {locationStatus === 'outside' && distanceToRestaurant !== null && (
              <div className="bg-white/90 backdrop-blur-xs p-3.5 rounded-2xl border border-amber-200 text-xs text-slate-700 space-y-1.5 shadow-xs">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Your current distance:</span>
                  <span className="font-bold text-rose-700 font-mono">
                    {formatDistance(distanceToRestaurant)} away
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Permitted dining circle:</span>
                  <span className="font-bold text-slate-800 font-mono">
                    within {restaurant?.settings?.geofence?.radiusMeters || 200}m
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 pt-0.5">
                  Indoor GPS or Wi-Fi can sometimes take a moment to calibrate. If you are already at the table, tap <strong>Re-check Location</strong>.
                </p>
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
        </div>
      )}

      {/* Settled Dining Session Notice */}
      {isSessionSettled && (
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
          <div className="p-4 bg-light-secondary-container/80 border border-light-secondary rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-light-primary text-light-on-primary flex items-center justify-center shrink-0 shadow-xs">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-light-on-surface uppercase tracking-wide">
                  Table Bill Settled & Paid
                </p>
                <p className="text-[11px] text-light-on-surface-variant mt-0.5">
                  All dishes for this dining session have been paid. To order new food, please scan the table QR code.
                </p>
              </div>
            </div>
            <Link href="/" className="shrink-0 w-full sm:w-auto">
              <Button size="sm" className="w-full sm:w-auto bg-light-primary hover:bg-light-primary-container text-light-on-primary gap-2 text-xs shadow-xs">
                <QrCode className="w-4 h-4" />
                <span>Scan QR Code</span>
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* 2. Sticky Search & Quick Dietary Filters */}
      <div className="sticky top-[64px] z-30 bg-light-surface/95 backdrop-blur-md border-b border-light-outline-variant/40 py-2.5 px-4 sm:px-6 shadow-2xs">
        <div className="max-w-[1200px] mx-auto flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            {/* Search Input */}
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
                  id="clear-search-btn"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-light-surface-variant flex items-center justify-center text-light-on-surface-variant hover:bg-light-outline-variant transition-colors"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick Filter Chips */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                id="filter-veg-btn"
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
                id="filter-speed-btn"
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
                id="filter-bestseller-btn"
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
                <span>{cat.name.replace(/^[\p{Emoji}\u200d\uFE0F\s]+/u, '').trim() || cat.name}</span>
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
            <h3 className="font-headline text-lg font-bold text-light-on-surface">No matching dishes found</h3>
            <p className="font-body text-xs sm:text-sm text-light-on-surface-variant max-w-sm mx-auto">
              We couldn&apos;t find anything matching your search or filters. Try searching for &quot;Cappuccino&quot;, &quot;Paneer&quot;, or reset your filters.
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
                    {group.category.name.replace(/^[\p{Emoji}\u200d\uFE0F\s]+/u, '').trim() || group.category.name}
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

              {/* Responsive Grid matching user design: 1-col on mobile, 2-col on sm, 4-col on lg */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
          ))
        )}
      </main>

      {/* Modern Compact Floating View Cart Pill */}
      {cartTotals.itemCount > 0 && (
        <div className="fixed bottom-20 left-0 right-0 z-40 px-4 pointer-events-none flex justify-center">
          <div className="w-full max-w-sm pointer-events-auto animate-in slide-in-from-bottom-3 duration-200">
            <Link
              href={`/table/${sessionId}/cart`}
              className="flex items-center justify-between bg-light-primary hover:bg-light-primary-container text-light-on-primary px-4 py-3 rounded-full shadow-xl shadow-light-primary/25 active:scale-[0.98] transition-all cursor-pointer border border-light-on-primary/20"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-light-on-primary/20 flex items-center justify-center font-bold text-xs">
                  {cartTotals.itemCount}
                </div>
                <div className="leading-tight">
                  <span className="text-[10px] text-light-on-primary/80 font-medium block">
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
    </div>
  );
}
