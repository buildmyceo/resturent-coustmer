'use client';

import React from 'react';
import { OrderStatus } from '@/types';
import {
  Clock,
  UserCheck,
  Send,
  UtensilsCrossed,
  Sparkles,
  CheckCircle2,
  XCircle,
  ConciergeBell,
} from 'lucide-react';

interface OrderProgressStepperProps {
  status: OrderStatus;
  rejectionReason?: string | null;
  assignedWaiterName?: string | null;
}

const steps = [
  { key: 'submitted', label: 'Submitted', icon: Clock },
  { key: 'waiting_for_waiter', label: 'Waiter', icon: UserCheck },
  { key: 'order_confirmed', label: 'Confirmed', icon: CheckCircle2 },
  { key: 'sent_to_kitchen', label: 'In Kitchen', icon: Send },
  { key: 'preparing', label: 'Preparing', icon: UtensilsCrossed },
  { key: 'ready', label: 'Ready', icon: Sparkles },
  { key: 'served', label: 'Served', icon: ConciergeBell },
];

export function OrderProgressStepper({
  status,
  rejectionReason,
  assignedWaiterName,
}: OrderProgressStepperProps) {
  if (status === 'cancelled' || status === 'rejected') {
    return (
      <div className="p-3 bg-light-error-container/40 border border-light-error text-light-on-error-container rounded-xl text-xs font-semibold space-y-1">
        <div className="flex items-center gap-1.5 text-light-error">
          <XCircle className="w-4 h-4 shrink-0" />
          <span className="font-bold">Order Declined or Cancelled</span>
        </div>
        {rejectionReason && (
          <p className="text-[11px] text-light-error pl-5">
            Reason: &quot;{rejectionReason}&quot;
          </p>
        )}
      </div>
    );
  }

  // Map order status to progress index (0 to 6)
  const getStatusIndex = (st: OrderStatus): number => {
    switch (st) {
      case 'pending':
        return 0;
      case 'waiting_for_waiter':
        return 1;
      case 'waiter_accepted':
        return 2;
      case 'sent_to_kitchen':
      case 'accepted':
      case 'accepted_by_kitchen':
        return 3;
      case 'preparing':
        return 4;
      case 'ready':
        return 5;
      case 'served':
      case 'completed':
        return 6;
      default:
        return 1;
    }
  };

  const currentIndex = getStatusIndex(status);

  return (
    <div className="w-full py-2 space-y-3">
      {/* Waiter assignment status pill (if assigned) */}
      {assignedWaiterName && (
        <div className="flex items-center justify-between text-xs px-3 py-1.5 bg-light-surface-container-low border border-light-outline-variant/60 rounded-xl text-light-on-surface-variant">
          <span className="flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-light-primary" />
            <span>Assigned Waiter:</span>
            <strong className="text-light-on-surface font-semibold">{assignedWaiterName}</strong>
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-light-primary bg-light-secondary-container px-2 py-0.5 rounded-md">
            {status === 'waiting_for_waiter' ? 'Awaiting Review' : 'Validated'}
          </span>
        </div>
      )}

      {/* 7-Step Grid Stepper matching mockup */}
      <div
        aria-label="Order progress"
        className="grid grid-cols-4 sm:grid-cols-7 gap-2 sm:gap-3 pt-1"
      >
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isCompleted = idx < currentIndex;
          const isCurrent = idx === currentIndex;

          return (
            <div key={step.key} className="flex flex-col items-center text-center gap-1.5">
              <span
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                  isCurrent
                    ? 'bg-light-primary text-light-on-primary ring-4 ring-light-secondary-container shadow-sm animate-pulse'
                    : isCompleted
                    ? 'bg-light-primary text-light-on-primary shadow-2xs'
                    : 'bg-light-surface-container-low border border-light-outline-variant text-light-on-surface-variant'
                }`}
              >
                <Icon className="w-4 h-4" />
              </span>
              <span
                className={`font-label text-[11px] sm:text-xs select-none ${
                  isCurrent
                    ? 'text-light-primary font-bold'
                    : isCompleted
                    ? 'text-light-on-surface font-medium'
                    : 'text-light-on-surface-variant'
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
