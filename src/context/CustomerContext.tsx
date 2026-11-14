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
} from '@/types';
import { createClient } from '@/lib/supabase/client';
import { customerAudio } from '@/lib/audio';
import { touchGuestSession, isSessionExpired, getGuestSession, clearGuestSession } from '@/lib/guest-session';
import { calculateDistanceMeters } from '@/lib/geofence';

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
  isSessionActive: boolean;
  customerLocation: { latitude: number; longitude: number } | null;
  isInsideGeofence: boolean | null;
  distanceToRestaurant: number | null;
  locationStatus: 'checking' | 'inside' | 'outside' | 'denied' | 'unsupported' | 'disabled';
  checkCustomerLocation: () => Promise<void>;
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

  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isOrdersLoading, setIsOrdersLoading] = useState(false);
  const [activeServiceRequests, setActiveServiceRequests] = useState<ServiceRequest[]>([]);

  const [isCallWaiterModalOpen, setIsCallWaiterModalOpen] = useState(false);
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
  const [selectedDishModal, setSelectedDishModal] = useState<Dish | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

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
      return;
    }

    setLocationStatus('checking');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userLat = pos.coords.latitude;
        const userLon = pos.coords.longitude;
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

        const allowedRadius = Math.min(200, Math.max(10, geo?.radiusMeters || 50));
        if (dist <= allowedRadius) {
          setIsInsideGeofence(true);
          setLocationStatus('inside');
        } else {
          setIsInsideGeofence(false);
          setLocationStatus('outside');
        }
      },
      (err) => {
        console.warn('Geolocation error:', err.message);
        setLocationStatus('denied');
        setIsInsideGeofence(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, [restaurant]);

  useEffect(() => {
    checkCustomerLocation();
  }, [checkCustomerLocation]);

  // Restore stored session on mount
  useEffect(() => {
    const stored = getGuestSession();
    if (stored) {
      if (stored.tableNumber && !table) {
        setTable({
          id: stored.tableId || 'ebfc2c24-6cf7-4adf-aef9-c0238b5eaa6a',
          restaurantId: stored.restaurantId || '07e9a4c7-edae-4bf0-8786-fc220c152d43',
          number: stored.tableNumber,
          name: stored.tableName || `Table ${stored.tableNumber}`,
          capacity: 4,
          isActive: true,
        });
      }
      if (stored.participantId && !participant) {
        setParticipant({
          id: stored.participantId,
          sessionId: stored.sessionId,
          name: stored.guestName || 'Guest',
          guestToken: stored.guestToken || '',
          isHost: stored.isHost || false,
          joinedAt: new Date().toISOString(),
        });
      }
    }
  }, []);

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

      showToast(`Added to cart`, `${quantity}x ${dish.name}`, 'success');
    },
    [showToast]
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

  // Server-matching Cart Totals Calculation
  const cartTotals = useMemo(() => {
    const subtotal = Number(cart.reduce((sum, item) => sum + item.totalPrice, 0).toFixed(2));
    const taxRate = restaurant?.settings?.taxEnabled ? Number(restaurant?.settings?.taxPercentage ?? 8.5) : 0;
    const serviceFeeRate = restaurant?.settings?.serviceChargeEnabled ? Number(restaurant?.settings?.serviceChargePercentage ?? 10.0) : 0;

    const taxAmount = Number(((subtotal * taxRate) / 100).toFixed(2));
    const serviceFee = Number(((subtotal * serviceFeeRate) / 100).toFixed(2));
    const totalAmount = Number((subtotal + taxAmount + serviceFee).toFixed(2));
    const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

    return { subtotal, taxAmount, serviceFee, totalAmount, itemCount };
  }, [cart, restaurant]);

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

  // Supabase Realtime Subscriptions for Live Order Tracking and Table Session Status
  useEffect(() => {
    const activeRestId = restaurant?.id || getGuestSession()?.restaurantId;
    if (!activeRestId) return;

    const channel = supabase.channel(`restaurant:${activeRestId}`, {
      config: { broadcast: { self: false } },
    });

    // 1. Listen for instant broadcast order updates from Kitchen or Staff
    channel.on(
      'broadcast',
      { event: 'ORDER_UPDATED' },
      (payload: any) => {
        const orderData = payload?.payload;
        if (orderData) {
          const newStatus = orderData.status;
          if (newStatus === 'ready') {
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
        refreshOrders();
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
      () => refreshOrders()
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurant?.id, table?.id, supabase, refreshOrders, showToast]);

  // Periodic background polling (every 3.5s) to guarantee zero manual reload needed
  useEffect(() => {
    const activeRestId = restaurant?.id || getGuestSession()?.restaurantId;
    const activeTableId = table?.id || getGuestSession()?.tableId;
    if (!activeRestId && !activeTableId) return;

    const interval = setInterval(async () => {
      await refreshOrders();
    }, 3500);

    // Refresh immediately when returning to tab
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshOrders();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [restaurant?.id, table?.id, refreshOrders]);

  const isSessionActive = useMemo(() => {
    return !!session && session.status !== 'completed' && session.status !== 'cancelled';
  }, [session]);

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
        cart,
        addToCart,
        updateCartQuantity,
        removeFromCart,
        clearCart,
        clearSessionState,
        cartTotals,
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
        isSessionActive,
        customerLocation,
        isInsideGeofence,
        distanceToRestaurant,
        locationStatus,
        checkCustomerLocation,
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

