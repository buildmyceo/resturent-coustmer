export type DietaryType =
  | 'vegetarian'
  | 'non_vegetarian'
  | 'vegan'
  | 'egg'
  | 'Veg'
  | 'Non-Veg'
  | 'Vegan'
  | 'Gluten-Free';

export interface DishVariant {
  id: string;
  dishId: string;
  name: string;
  price: number;
  isActive: boolean;
  createdAt?: string;
}

export interface DishAddon {
  id: string;
  dishId: string;
  name: string;
  additionalPrice: number;
  isActive: boolean;
  createdAt?: string;
}

export interface Dish {
  id: string;
  restaurantId: string;
  name: string;
  description: string;
  price: number;
  categoryId: string;
  categoryName?: string;
  image: string;
  prepTime: number; // in minutes
  dietaryType: DietaryType;
  allergens: string[];
  isAvailable: boolean;
  isArchived: boolean;
  variants?: DishVariant[];
  addons?: DishAddon[];
  ordersCount?: number;
  createdAt?: string;
}

export interface Category {
  id: string;
  restaurantId: string;
  name: string;
  description?: string;
  image?: string;
  displayOrder: number;
  isActive: boolean;
  itemCount?: number;
}

export type TableStatus = 'available' | 'occupied' | 'reserved' | 'payment_pending' | 'inactive';

export interface RestaurantTable {
  id: string;
  restaurantId: string;
  number: string;
  name: string;
  capacity: number;
  isActive: boolean;
}

export interface TableQRCode {
  id: string;
  restaurantId: string;
  tableId: string;
  publicIdentifier: string;
  isActive: boolean;
  createdAt: string;
}

export type TableSessionStatus = 'occupied' | 'payment_pending' | 'completed' | 'cancelled';

export interface TableSession {
  id: string;
  restaurantId: string;
  tableId: string;
  status: TableSessionStatus;
  guestCount: number;
  customerName?: string;
  openedAt: string;
  closedAt?: string;
  notes?: string;
  subtotal: number;
  taxAmount: number;
  serviceFee: number;
  discountAmount: number;
  totalAmount: number;
  totalPaid: number;
  initialClaimExpiresAt?: string | null;
  firstOrderSubmittedAt?: string | null;
  isClaimPermanent?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SessionParticipant {
  id: string;
  sessionId: string;
  name: string;
  guestToken?: string;
  isHost: boolean;
  joinedAt: string;
  lastActiveAt?: string;
}

export type OrderStatus =
  | 'pending'
  | 'waiting_for_waiter'
  | 'waiter_accepted'
  | 'sent_to_kitchen'
  | 'accepted_by_kitchen'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'completed'
  | 'cancelled'
  | 'rejected';
export type OrderSource = 'Customer' | 'Staff';

export interface OrderItem {
  id: string;
  orderId?: string;
  dishId: string;
  dishName: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
  variantName?: string;
  addons?: { name: string; price: number }[];
  status?: 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';
}

export interface Order {
  id: string;
  restaurantId: string;
  tableId: string;
  tableSessionId?: string;
  participantId?: string;
  participantName?: string;
  orderNumber: string;
  tableNumber: string;
  orderSource: OrderSource;
  items: OrderItem[];
  subtotal: number;
  taxAmount: number;
  serviceFee: number;
  totalAmount: number;
  status: OrderStatus;
  orderTime: string;
  createdAt?: string;
  customerNote?: string;
  paymentMethod?: string;
  paymentStatus: 'paid' | 'pending';
  assignedWaiterId?: string | null;
  assignedWaiterName?: string | null;
  assignedAt?: string | null;
  assignmentMethod?: string;
  assignmentStatus?: string;
  rejectionReason?: string | null;
  rejectedAt?: string | null;
}

export interface CartItemAddon {
  id: string;
  name: string;
  additionalPrice: number;
}

export interface CartItem {
  cartItemId: string; // unique string for identical dishes with different variants/notes
  dishId: string;
  dishName: string;
  dishImage: string;
  dietaryType: DietaryType;
  basePrice: number;
  variantId?: string;
  variantName?: string;
  variantPrice?: number;
  selectedAddons: CartItemAddon[];
  quantity: number;
  specialInstructions?: string;
  unitPrice: number;
  totalPrice: number;
}

export type ServiceRequestType = 'call_waiter' | 'water' | 'assistance' | 'request_bill' | 'cleaning' | 'other';
export type ServiceRequestStatus = 'pending' | 'acknowledged' | 'in_progress' | 'resolved' | 'cancelled';

export interface ServiceRequest {
  id: string;
  restaurantId: string;
  tableId: string;
  sessionId?: string;
  requestType: ServiceRequestType;
  status: ServiceRequestStatus;
  notes?: string;
  requestedByName?: string;
  createdAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
}

export interface PaymentRecord {
  id: string;
  restaurantId: string;
  sessionId: string;
  orderId?: string;
  amount: number;
  paymentMethod: 'cash' | 'card' | 'upi' | 'online' | 'razorpay' | 'other';
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  transactionId?: string;
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  createdAt: string;
}

export interface Invoice {
  id: string;
  restaurantId: string;
  sessionId: string;
  invoiceNumber: string;
  tableNumber: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  subtotal: number;
  taxAmount: number;
  serviceFee: number;
  discountAmount: number;
  totalAmount: number;
  totalPaid: number;
  status: 'draft' | 'issued' | 'paid' | 'cancelled';
  itemsSnapshot: OrderItem[];
  taxBreakdown: {
    taxRate: number;
    taxAmount: number;
    serviceFeeRate: number;
    serviceFeeAmount: number;
  };
  paymentReference?: string;
  createdAt: string;
}

export interface RestaurantSettings {
  taxEnabled: boolean;
  taxPercentage: number;
  serviceChargeEnabled: boolean;
  serviceChargePercentage: number;
  currency: string;
  timezone: string;
  receiptFooter: string;
  openingHours?: Record<string, { open: string; close: string; closed: boolean }>;
}

export interface RestaurantProfile {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  restaurantType?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  currency: string;
  timezone: string;
  status: 'active' | 'inactive' | 'suspended';
  settings?: RestaurantSettings;
}

