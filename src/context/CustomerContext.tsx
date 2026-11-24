'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  RestaurantProfile,
  RestaurantTable,
  TableSession,
  SessionParticipant,
  CartItem,
  Dish,
  Order,
  ServiceRequest,
  ServiceRequestType,
  Coupon,
} from '@/types';
import { createClient } from '@/lib/supabase/client';
import { customerAudio } from '@/lib/audio';
import { touchGuestSession, isSessionExpired, getGuestSession, clearGuestSession } from '@/lib/guest-session';
import { calculateDistanceMeters } from '@/lib/geofence';
import { checkIsRestaurantOpen, OperatingHoursCheck } from '@/lib/schedule';
import { fetchRestaurantAndMenuDB } from '@/lib/supabase/service';

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  type: 'success' | 'error' | 'info';
}

interface CustomerContextType {
  restaurant: RestaurantProfile | null;
  setRestaurant: (restaurant: RestaurantProfile | null) => void;
  table: RestaurantTable | null;
  setTable: (table: RestaurantTable | null) => void;
  session: TableSession | null;
  setSession: (session: TableSession | null) => void;
  participant: SessionParticipant | null;
  setParticipant: (participant: SessionParticipant | null) => void;
  menuDishes: Dish[];
  setMenuDishes: (dishes: Dish[]) => void;
  cart: CartItem[];
  addToCart: (
    dish: Dish,
    options?: {
      variantId?: string;
      variantName?: string;
      variantPrice?: number;
      selectedAddons?: { id: string; name: string; additionalPrice: number }[];
      quantity?: number;
      specialInstructions?: string;
    }
  ) => void;
  updateCartQuantity: (cartItemId: string, newQuantity: number) => void;
  removeFromCart: (cartItemId: string) => void;
  clearCart: () => void;
  clearSessionState: () => void;
  cartTotals: {
    subtotal: number;
    taxAmount: number;
    serviceFee: number;
    totalAmount: number;
    itemCount: number;
  };
  appliedCoupon: Coupon | null;
  setAppliedCoupon: (coupon: Coupon | null) => void;
  couponDiscountAmount: number;
  orders: Order[];
  refreshOrders: () => Promise<void>;
  isOrdersLoading: boolean;
  activeServiceRequests: ServiceRequest[];
  submitServiceRequest: (type: ServiceRequestType, notes?: string) => Promise<{ success: boolean; error?: string }>;
  isCallWaiterModalOpen: boolean;
  setIsCallWaiterModalOpen: (open: boolean) => void;
  isCartDrawerOpen: boolean;
  setIsCartDrawerOpen: (open: boolean) => void;
  selectedDishModal: Dish | null;
  setSelectedDishModal: (dish: Dish | null) => void;
  toasts: ToastMessage[];
  showToast: (title: string, description?: string, type?: 'success' | 'error' | 'info') => void;
  dismissToast: (id: string) => void;
  isSessionDeactivated: boolean;
  setIsSessionDeactivated: (v: boolean) => void;
  deactivateSession: (reason?: string) => Promise<void>;
  isSessionActive: boolean;
  customerLocation: { latitude: number; longitude: number } | null;
  isInsideGeofence: boolean | null;
  distanceToRestaurant: number | null;
  locationStatus: 'checking' | 'inside' | 'outside' | 'denied' | 'unsupported' | 'disabled';
  checkCustomerLocation: () => Promise<void>;
  operatingHoursStatus: OperatingHoursCheck;
  isShopOpen: boolean;
  broadcastOrderCreated: (orderData: any) => void;
}

const CustomerContext = createContext<CustomerContextType | undefined>(undefined);

export function CustomerProvider({
  children,
  initialRestaurant,
  initialTable,
  initialSession,
  initialParticipant,
}: {
  children: React.ReactNode;
  initialRestaurant?: RestaurantProfile | null;
  initialTable?: RestaurantTable | null;
  initialSession?: TableSession | null;
  initialParticipant?: SessionParticipant | null;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [restaurant, setRestaurant] = useState<RestaurantProfile | null>(initialRestaurant || null);
  const [table, setTable] = useState<RestaurantTable | null>(initialTable || null);
  const [session, setSession] = useState<TableSession | null>(initialSession || null);
  const [participant, setParticipant] = useState<SessionParticipant | null>(initialParticipant || null);
  const [menuDishes, setMenuDishes] = useState<Dish[]>([]);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isOrdersLoading, setIsOrdersLoading] = useState(false);
  const [activeServiceRequests, setActiveServiceRequests] = useState<ServiceRequest[]>([]);

  const [isCallWaiterModalOpen, setIsCallWaiterModalOpen] = useState(false);
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
  const [selectedDishModal, setSelectedDishModal] = useState<Dish | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isSessionDeactivated, setIsSessionDeactivated] = useState(false);

  // Toast Notification Manager
  const showToast = useCallback((title: string, description?: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, title, description, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Geofence & Location Enforcement State
  const [customerLocation, setCustomerLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [distanceToRestaurant, setDistanceToRestaurant] = useState<number | null>(null);
  const [locationStatus, setLocationStatus] = useState<'checking' | 'inside' | 'outside' | 'denied' | 'unsupported' | 'disabled'>('checking');
  const [isInsideGeofence, setIsInsideGeofence] = useState<boolean | null>(null);

  const checkCustomerLocation = useCallback(async () => {
    // If restaurant details haven't loaded yet, remain in checking state; do not prematurely bypass geofence
    if (!restaurant) {
      return;
    }

    const geo = restaurant?.settings?.geofence;
    const hasCoordinates = typeof geo?.latitude === 'number' && typeof geo?.longitude === 'number';
    const isEnforced = Boolean(geo && (geo.enabled !== false || hasCoordinates));

    if (!isEnforced) {
      setIsInsideGeofence(true);
      setLocationStatus('disabled');
      return;
    }

    if (typeof window === 'undefined' || !navigator.geolocation) {
      setLocationStatus('unsupported');
      setIsInsideGeofence(false);
      showToast('Location Unsupported', 'Your browser does not support geolocation.', 'error');
      return;
    }

    setLocationStatus('checking');

    // Helper to evaluate coordinates against restaurant location
    const handlePosition = (pos: GeolocationPosition) => {
      const userLat = pos.coords.latitude;
      const userLon = pos.coords.longitude;
      const accuracy = pos.coords.accuracy || 0;
      setCustomerLocation({ latitude: userLat, longitude: userLon });

      const restaurantLat = geo?.latitude || 25.618193;
      const restaurantLon = geo?.longitude || 85.039305;
      const dist = calculateDistanceMeters(
        userLat,
        userLon,
        restaurantLat,
        restaurantLon
      );
      setDistanceToRestaurant(dist);

      const configuredRadius = geo?.radiusMeters || 200;
      // Compensate for mobile indoor GPS inaccuracy/cell tower drift (up to pos.coords.accuracy or minimum 60m indoor margin)
      const accuracyMargin = Math.max(60, Math.min(accuracy, 1000));
      const effectiveRadius = configuredRadius + accuracyMargin;

      if (dist <= effectiveRadius) {
        setIsInsideGeofence(true);
        setLocationStatus('inside');
        showToast('Location Verified', 'Welcome! You are within the restaurant dining area.', 'success');
      } else {
        setIsInsideGeofence(false);
        setLocationStatus('outside');
        showToast('Outside Restaurant Area', `You are approx ${dist}m away (allowed: ${configuredRadius}m).`, 'error');
      }
    };

    // Primary attempt: high accuracy with fallback to low accuracy / IP-network geolocation
    navigator.geolocation.getCurrentPosition(
      (pos) => handlePosition(pos),
      (err) => {
        console.warn('Geolocation highAccuracy error, trying standard accuracy fallback:', err.message);
        // Fallback: standard/network geolocation without maximumAge restriction
        navigator.geolocation.getCurrentPosition(
          (fallbackPos) => handlePosition(fallbackPos),
          (fallbackErr) => {
            console.warn('Geolocation fallback error:', fallbackErr.message);
            setLocationStatus('denied');
            setIsInsideGeofence(false);
            if (fallbackErr.code === 1) { // PERMISSION_DENIED
              showToast('Location Denied', 'Please allow location permission in your browser settings and try again.', 'error');
            } else if (fallbackErr.code === 2) { // POSITION_UNAVAILABLE
              showToast('Location Unavailable', 'GPS signal unavailable. Please ensure location/GPS is toggled ON on your device.', 'error');
            } else {
              showToast('Location Timeout', 'Location request timed out. Please tap Re-check Location again.', 'error');
            }
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 }
        );
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }, [restaurant, showToast]);

  useEffect(() => {
    checkCustomerLocation();
  }, [checkCustomerLocation]);

  // Cart Management
  const addToCart = useCallback(
    (
      dish: Dish,
      options?: {
        variantId?: string;
        variantName?: string;
        variantPrice?: number;
        selectedAddons?: { id: string; name: string; additionalPrice: number }[];
        quantity?: number;
        specialInstructions?: string;
      }
    ) => {
      touchGuestSession();
      customerAudio.playTap();

      // Enforce Restaurant Location Geofence
      const geo = restaurant?.settings?.geofence;
      const hasCoordinates = typeof geo?.latitude === 'number' && typeof geo?.longitude === 'number';
      const isGeofenceConfigured = Boolean(geo && (geo.enabled !== false || hasCoordinates));

      if (isGeofenceConfigured && isInsideGeofence !== true) {
        showToast(
          'Location Restriction',
          'Visit restaurant to order food, or scan QR code if you are in a different restaurant.',
          'error'
        );
        return;
      }

      const quantity = Math.max(1, options?.quantity || 1);
      const variantId = options?.variantId;
      const variantName = options?.variantName;
      const variantPrice = options?.variantPrice;
      const selectedAddons = options?.selectedAddons || [];
      const specialInstructions = (options?.specialInstructions || '').trim();

      const unitBasePrice = variantPrice !== undefined ? variantPrice : dish.price;
      const addonsPrice = selectedAddons.reduce((sum, a) => sum + a.additionalPrice, 0);
      const unitPrice = unitBasePrice + addonsPrice;
      const totalPrice = unitPrice * quantity;

      // Unique hash key for cart item based on customizations
      const addonKey = selectedAddons.map((a) => a.id).sort().join('-');
      const cartItemId = `${dish.id}_${variantId || 'base'}_${addonKey}_${specialInstructions}`;

      setCart((prevCart) => {
        const existingIndex = prevCart.findIndex((item) => item.cartItemId === cartItemId);
        if (existingIndex > -1) {
          const updated = [...prevCart];
          const newQty = updated[existingIndex].quantity + quantity;
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: newQty,
            totalPrice: updated[existingIndex].unitPrice * newQty,
          };
          return updated;
        } else {
          const newItem: CartItem = {
            cartItemId,
            dishId: dish.id,
            categoryId: dish.categoryId,
            dishName: dish.name,
            dishImage: dish.image,
            dietaryType: dish.dietaryType,
            basePrice: dish.price,
            variantId,
            variantName,
            variantPrice,
            selectedAddons,
            quantity,
            specialInstructions: specialInstructions || undefined,
            unitPrice,
            totalPrice,
          };
          return [...prevCart, newItem];
        }
      });
    },
    []
  );

  const updateCartQuantity = useCallback((cartItemId: string, newQuantity: number) => {
    touchGuestSession();
    customerAudio.playTap();
    setCart((prevCart) => {
      if (newQuantity <= 0) {
        return prevCart.filter((item) => item.cartItemId !== cartItemId);
      }
      return prevCart.map((item) =>
        item.cartItemId === cartItemId
          ? {
              ...item,
              quantity: newQuantity,
              totalPrice: item.unitPrice * newQuantity,
            }
          : item
      );
    });
  }, []);

  const removeFromCart = useCallback((cartItemId: string) => {
    touchGuestSession();
    customerAudio.playTap();
    setCart((prevCart) => prevCart.filter((item) => item.cartItemId !== cartItemId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const clearSessionState = useCallback(() => {
    clearGuestSession();
    setCart([]);
    setOrders([]);
    setSession(null);
    setParticipant(null);
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('zovo_cart');
        localStorage.removeItem('zovo_guest_session');
        sessionStorage.clear();
      } catch {}
    }
  }, []);

  const deactivateSession = useCallback(
    async (reason?: string) => {
      setIsSessionDeactivated(true);
      try {
        if (session?.id) {
          await fetch('/api/session/deactivate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: session.id,
              reason: reason || '1 hour temporary customer inactivity without ordering',
            }),
          });
        }
      } catch (err) {
        console.warn('Deactivate session error:', err);
      }

      clearSessionState();

      if (typeof window !== 'undefined') {
        setTimeout(() => {
          window.location.reload();
        }, 500);
      }
    },
    [session?.id, clearSessionState]
  );

  // Auto-hydrate restaurant from Supabase if missing from context
  useEffect(() => {
    if (!restaurant?.id) {
      const stored = getGuestSession();
      const targetRestId = stored?.restaurantId || 'a9feec11-8dee-4202-be6e-a097e45266e6';
      fetchRestaurantAndMenuDB(targetRestId)
        .then(({ restaurant: r, dishes }) => {
          if (r) setRestaurant(r);
          if (dishes && dishes.length > 0) setMenuDishes(dishes);
        })
        .catch(() => {});
    }
  }, [restaurant?.id]);

  // Server-matching Cart Totals Calculation with Coupon Discounts
  const { cartTotals, couponDiscountAmount } = useMemo(() => {
    const subtotal = Number(cart.reduce((sum, item) => sum + item.totalPrice, 0).toFixed(2));
    const hasGst = Boolean(restaurant?.settings?.gstNumber && restaurant.settings.gstNumber.trim().length > 0);
    const taxRate = hasGst && restaurant?.settings?.taxEnabled !== false ? Number(restaurant?.settings?.taxPercentage ?? 5.0) : 0;
    const serviceFeeRate = restaurant?.settings?.serviceChargeEnabled === true ? Number(restaurant?.settings?.serviceChargePercentage ?? 0) : 0;

    // Calculate coupon discount
    let discount = 0;
    if (appliedCoupon && appliedCoupon.isActive) {
      // Check minimum order amount requirement
      if (!appliedCoupon.minOrderAmount || subtotal >= appliedCoupon.minOrderAmount) {
        if (appliedCoupon.appliesTo === 'category' && appliedCoupon.targetCategoryId) {
          // Calculate sum only on items matching target category
          const eligibleItemsSubtotal = cart
            .filter((item) => item.categoryId === appliedCoupon.targetCategoryId)
            .reduce((sum, item) => sum + item.totalPrice, 0);

          if (eligibleItemsSubtotal > 0) {
            if (appliedCoupon.discountType === 'percentage') {
              discount = (eligibleItemsSubtotal * appliedCoupon.discountValue) / 100;
            } else {
              discount = Math.min(appliedCoupon.discountValue, eligibleItemsSubtotal);
            }
          }
        } else if (appliedCoupon.appliesTo === 'dishes' && Array.isArray(appliedCoupon.targetDishIds) && appliedCoupon.targetDishIds.length > 0) {
          // Calculate sum only on selected dishes
          const eligibleItemsSubtotal = cart
            .filter((item) => appliedCoupon.targetDishIds?.includes(item.dishId))
            .reduce((sum, item) => sum + item.totalPrice, 0);

          if (eligibleItemsSubtotal > 0) {
            if (appliedCoupon.discountType === 'percentage') {
              discount = (eligibleItemsSubtotal * appliedCoupon.discountValue) / 100;
            } else {
              discount = Math.min(appliedCoupon.discountValue, eligibleItemsSubtotal);
            }
          }
        } else {
          // Applies to all items
          if (appliedCoupon.discountType === 'percentage') {
            discount = (subtotal * appliedCoupon.discountValue) / 100;
          } else {
            discount = Math.min(appliedCoupon.discountValue, subtotal);
          }
        }

        // Cap discount if maxDiscountAmount is configured
        if (appliedCoupon.maxDiscountAmount && discount > appliedCoupon.maxDiscountAmount) {
          discount = appliedCoupon.maxDiscountAmount;
        }
      }
    }

    const calculatedDiscount = Number(Math.min(discount, subtotal).toFixed(2));
    const discountedSubtotal = Math.max(0, subtotal - calculatedDiscount);

    const taxAmount = Number(((discountedSubtotal * taxRate) / 100).toFixed(2));
    const serviceFee = Number(((discountedSubtotal * serviceFeeRate) / 100).toFixed(2));
    const totalAmount = Number((discountedSubtotal + taxAmount + serviceFee).toFixed(2));
    const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

    return {
      cartTotals: { subtotal, taxAmount, serviceFee, totalAmount, itemCount },
      couponDiscountAmount: calculatedDiscount,
    };
  }, [cart, restaurant, appliedCoupon]);

  // Fetch Table Orders
  const refreshOrders = useCallback(async () => {
    const stored = getGuestSession();
    const effectiveSessionId = session?.id || stored?.sessionId;
    const effectiveTableId = table?.id || stored?.tableId;
    const effectiveRestId = restaurant?.id || stored?.restaurantId;

    if (!effectiveSessionId && !effectiveTableId) return;

    setIsOrdersLoading(true);
    try {
      const params = new URLSearchParams();
      if (effectiveSessionId) params.set('sessionId', effectiveSessionId);
      if (effectiveTableId) params.set('tableId', effectiveTableId);
      if (effectiveRestId) params.set('restaurantId', effectiveRestId);

      const res = await fetch(`/api/orders/track?${params.toString()}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.orders)) {
        setOrders(data.orders);
      }
    } catch (err) {
      console.warn('Error refreshing orders:', err);
    } finally {
      setIsOrdersLoading(false);
    }
  }, [session?.id, table?.id, restaurant?.id]);

  useEffect(() => {
    refreshOrders();
  }, [refreshOrders]);

  // Supabase Realtime channel reference
  const realtimeChannelRef = React.useRef<any>(null);

  // Submit Call Waiter Service Request
  const submitServiceRequest = useCallback(
    async (type: ServiceRequestType, notes?: string): Promise<{ success: boolean; error?: string }> => {
      if (!restaurant?.id || !table?.id) {
        return { success: false, error: 'Restaurant or table is not identified.' };
      }

      try {
        const res = await fetch('/api/service-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurantId: restaurant.id,
            tableId: table.id,
            sessionId: session?.id,
            requestType: type,
            notes,
            requestedByName: participant?.name || 'Guest',
          }),
        });

        const data = await res.json();
        if (data.success) {
          customerAudio.playServiceAlert();

          // Instant direct client-side broadcast to waiter devices
          try {
            if (realtimeChannelRef.current) {
              const tableNum = table.number || table.name || 'T-01';
              const broadcastPayload = {
                id: data.request?.id || `req_${Date.now()}`,
                restaurant_id: restaurant.id,
                table_id: table.id,
                table_number: tableNum,
                request_type: type,
                notes: notes || 'Customer called for waiter',
                requested_by_name: participant?.name || 'Guest',
                status: 'pending',
                created_at: new Date().toISOString(),
              };
              realtimeChannelRef.current.send({
                type: 'broadcast',
                event: 'SERVICE_REQUEST',
                payload: broadcastPayload,
              });
              realtimeChannelRef.current.send({
                type: 'broadcast',
                event: 'call_waiter',
                payload: broadcastPayload,
              });
            }
          } catch (e) {
            console.warn('Realtime client broadcast error:', e);
          }

          showToast(
            'Request Sent',
            `Waiter notified for "${type.replace('_', ' ')}". They will assist you shortly.`,
            'info'
          );
          return { success: true };
        } else {
          return { success: false, error: data.error };
        }
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to dispatch request.' };
      }
    },
    [restaurant, table, session, participant, showToast]
  );

  // Active orders state reference for transition sound/toast detection
  const previousOrdersRef = React.useRef<Order[]>([]);

  useEffect(() => {
    if (orders.length > 0 && previousOrdersRef.current.length > 0) {
      orders.forEach((newOrder) => {
        const prevOrder = previousOrdersRef.current.find((p) => p.id === newOrder.id);
        if (prevOrder && prevOrder.status !== 'ready' && newOrder.status === 'ready') {
          customerAudio.playFoodReady();
          showToast(
            'Order Prepared! 🍽️',
            `Order #${newOrder.orderNumber} is freshly prepared! Waiter & kitchen notified.`,
            'success'
          );
        } else if (prevOrder && prevOrder.status === 'pending' && newOrder.status === 'preparing') {
          customerAudio.playTap();
          showToast(
            'Receipt Approved! 👨‍🍳',
            `Cashier approved Order #${newOrder.orderNumber}! Kitchen has started preparing.`,
            'info'
          );
        }
      });
    }
    previousOrdersRef.current = orders;
  }, [orders, showToast]);

  // Supabase Realtime Subscriptions for Live Order Tracking and Table Session Status
  useEffect(() => {
    const activeRestId = restaurant?.id || getGuestSession()?.restaurantId;
    if (!activeRestId) return;

    const channel = supabase.channel(`restaurant:${activeRestId}`, {
      config: { broadcast: { self: false } },
    });
    realtimeChannelRef.current = channel;

    let debounceTimer: NodeJS.Timeout | null = null;
    const debouncedRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        refreshOrders();
      }, 300);
    };

    // 1. Listen for instant broadcast order updates from Kitchen or Staff
    channel.on(
      'broadcast',
      { event: 'ORDER_UPDATED' },
      (payload: any) => {
        const orderData = payload?.payload;
        if (orderData) {
          const newStatus = orderData.status;

          // Instant optimistic local state update so customer sees progress with 0ms delay
          setOrders((prev) =>
            prev.map((o) => {
              if (o.id === orderData.id || o.orderNumber === orderData.order_number) {
                return {
                  ...o,
                  status: newStatus,
                  items: o.items.map((it) => ({
                    ...it,
                    status: newStatus === 'ready' ? 'ready' : newStatus === 'served' ? 'served' : it.status,
                  })),
                };
              }
              return o;
            })
          );

          if (newStatus === 'accepted' || newStatus === 'sent_to_kitchen') {
            customerAudio.playTap();
            showToast(
              'Order Accepted! 👨‍🍳',
              `Your order #${orderData.order_number || ''} was accepted and sent to kitchen!`,
              'success'
            );
          } else if (newStatus === 'preparing') {
            customerAudio.playTap();
            showToast('Preparing Food 🔥', 'The kitchen has started preparing your dishes.', 'info');
          } else if (newStatus === 'ready') {
            customerAudio.playFoodReady();
            showToast(
              'Your Food is Ready! 🍽️',
              `Order #${orderData.order_number || ''} has been prepared and is on its way!`,
              'success'
            );
          } else if (newStatus === 'served') {
            customerAudio.playTap();
            showToast('Food Served ✨', `Order #${orderData.order_number || ''} has been served. Enjoy!`, 'info');
          } else if (newStatus === 'cancelled') {
            showToast('Order Cancelled', `Order #${orderData.order_number || ''} was cancelled.`, 'error');
          }
        }
        debouncedRefresh();
      }
    );

    // 1b. Listen for bill settlement event
    channel.on(
      'broadcast',
      { event: 'BILL_SETTLED' },
      (payload: any) => {
        const currentTableId = table?.id || getGuestSession()?.tableId;
        if (!payload?.payload?.table_id || payload.payload.table_id === currentTableId) {
          clearGuestSession();
          clearCart();
          setOrders([]);
          showToast('Bill Settled & Table Closed', 'Thank you for dining with us! The table has been refreshed.', 'info');
          debouncedRefresh();
          // Optionally refresh table page if on orders or bill
          if (typeof window !== 'undefined' && (window.location.pathname.includes('/orders') || window.location.pathname.includes('/bill'))) {
            setTimeout(() => {
              window.location.reload();
            }, 800);
          }
        }
      }
    );

    // 2. Listen for service request updates
    channel.on(
      'broadcast',
      { event: 'SERVICE_REQUEST_UPDATED' },
      (payload: any) => {
        const reqData = payload?.payload;
        const currentTableId = table?.id || getGuestSession()?.tableId;
        if (!reqData || !currentTableId || reqData.table_id === currentTableId) {
          if (reqData?.status === 'acknowledged') {
            customerAudio.playServiceAlert();
            showToast('Waiter Coming 🔔', 'A waiter acknowledged your request and is heading to your table!', 'info');
          }
        }
      }
    );

    // 3. Fallback: Listen for postgres changes if enabled in DB
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders' },
      () => debouncedRefresh()
    );

    channel.subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [restaurant?.id, table?.id, supabase, refreshOrders, showToast]);

  // Adaptive background heartbeat (every 5s while order is being prepared/tracked; 20s otherwise)
  useEffect(() => {
    const activeRestId = restaurant?.id || getGuestSession()?.restaurantId;
    const activeTableId = table?.id || getGuestSession()?.tableId;
    if (!activeRestId && !activeTableId) return;

    let timer: NodeJS.Timeout | null = null;

    const startTimer = () => {
      if (timer) clearInterval(timer);
      const hasActiveOrders = orders.some((o) =>
        ['pending', 'waiting_for_waiter', 'accepted', 'sent_to_kitchen', 'preparing', 'ready'].includes(o.status)
      );
      const intervalMs = hasActiveOrders ? 4000 : 20000;
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') {
          refreshOrders();
        }
      }, intervalMs);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Immediate sync upon returning to tab
        refreshOrders();
        startTimer();
      } else {
        // Stop polling completely while customer has screen locked or switched app
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
      }
    };

    if (document.visibilityState === 'visible') {
      startTimer();
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [restaurant?.id, table?.id, orders, refreshOrders]);

  const isSessionActive = useMemo(() => {
    return !!session && session.status !== 'completed' && session.status !== 'cancelled';
  }, [session]);

  // Operational Hours & Timezone Status
  const operatingHoursStatus = useMemo(() => {
    return checkIsRestaurantOpen(
      restaurant?.settings?.openingHours,
      restaurant?.timezone || restaurant?.settings?.timezone
    );
  }, [restaurant]);

  // Shop is open ONLY if restaurant status is active/open AND within operating hours schedule
  const isShopOpen = useMemo(() => {
    if (!restaurant) return true;
    if (restaurant.status === 'inactive' || restaurant.status === 'suspended') return false;
    return operatingHoursStatus.isOpen;
  }, [restaurant, operatingHoursStatus]);

  const broadcastOrderCreated = useCallback((orderData: any) => {
    try {
      const activeRestId = restaurant?.id || getGuestSession()?.restaurantId;
      if (!activeRestId) return;

      let channel = realtimeChannelRef.current;
      if (!channel) {
        channel = supabase.channel(`restaurant:${activeRestId}`, {
          config: { broadcast: { self: true } },
        });
        channel.subscribe();
      }

      channel.send({
        type: 'broadcast',
        event: 'ORDER_CREATED',
        payload: orderData,
      });
      channel.send({
        type: 'broadcast',
        event: 'new_order',
        payload: orderData,
      });
    } catch (err) {
      console.warn('broadcastOrderCreated error:', err);
    }
  }, [restaurant?.id, supabase]);

  return (
    <CustomerContext.Provider
      value={{
        restaurant,
        setRestaurant,
        table,
        setTable,
        session,
        setSession,
        participant,
        setParticipant,
        menuDishes,
        setMenuDishes,
        cart,
        addToCart,
        updateCartQuantity,
        removeFromCart,
        clearCart,
        clearSessionState,
        cartTotals,
        appliedCoupon,
        setAppliedCoupon,
        couponDiscountAmount,
        orders,
        refreshOrders,
        isOrdersLoading,
        activeServiceRequests,
        submitServiceRequest,
        isCallWaiterModalOpen,
        setIsCallWaiterModalOpen,
        isCartDrawerOpen,
        setIsCartDrawerOpen,
        selectedDishModal,
        setSelectedDishModal,
        toasts,
        showToast,
        dismissToast,
        isSessionDeactivated,
        setIsSessionDeactivated,
        deactivateSession,
        isSessionActive,
        customerLocation,
        isInsideGeofence,
        distanceToRestaurant,
        locationStatus,
        checkCustomerLocation,
        operatingHoursStatus,
        isShopOpen,
        broadcastOrderCreated,
      }}
    >
      {children}
    </CustomerContext.Provider>
  );
}

export function useCustomer(): CustomerContextType {
  const context = useContext(CustomerContext);
  if (!context) {
    throw new Error('useCustomer must be used within a CustomerProvider');
  }
  return context;
}

