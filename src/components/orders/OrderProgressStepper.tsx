'use client';

import React from 'react';
import { OrderStatus } from '@/types';
import {
  Clock,
  UserCheck,
  Send,
  ChefHat,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  XCircle,
} from 'lucide-react';

interface OrderProgressStepperProps {
  status: OrderStatus;
  rejectionReason?: string | null;
  assignedWaiterName?: string | null;
}

const steps = [
  { key: 'submitted', label: 'Submitted', icon: Clock },
  { key: 'waiting_for_waiter', label: 'Waiting for Waiter', icon: UserCheck },
  { key: 'order_confirmed', label: 'Confirmed', icon: CheckCircle2 },
  { key: 'sent_to_kitchen', label: 'Sent to Kitchen', icon: Send },
  { key: 'preparing', label: 'Preparing', icon: ChefHat },
  { key: 'ready', label: 'Ready', icon: Sparkles },
  { key: 'served', label: 'Served', icon: CheckCircle2 },
];

export function OrderProgressStepper({
  status,
  rejectionReason,
  assignedWaiterName,
}: OrderProgressStepperProps) {
  if (status === 'cancelled' || status === 'rejected') {
    return (
      <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-semibold space-y-1">
        <div className="flex items-center gap-1.5 text-rose-700">
          <XCircle className="w-4 h-4 shrink-0" />
          <span className="font-bold">Order Declined or Cancelled</span>
        </div>
        {rejectionReason && (
          <p className="text-[11px] text-rose-600 pl-5">
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
    <div className="w-full py-3 space-y-3">
      {/* Waiter assignment status pill */}
      {assignedWaiterName && (
        <div className="flex items-center justify-between text-[11px] px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-xl text-slate-600">
          <span className="flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-blue-600" />
            <span>Assigned Waiter:</span>
            <strong className="text-slate-900">{assignedWaiterName}</strong>
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
            {status === 'waiting_for_waiter' ? 'Awaiting Review' : 'Validated'}
          </span>
        </div>
      )}

      {/* Stepper Timeline Bar */}
      <div className="relative flex items-center justify-between">
        {/* Background Connecting Line */}
        <div className="absolute top-4 left-3 right-3 h-0.5 bg-slate-200 -z-0" />
        {/* Progress Line */}
        <div
          className="absolute top-4 left-3 h-0.5 bg-blue-600 transition-all duration-500 -z-0"
          style={{ width: `${(currentIndex / (steps.length - 1)) * 94}%` }}
        />

        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isCompleted = idx < currentIndex;
          const isCurrent = idx === currentIndex;

          return (
            <div key={step.key} className="flex flex-col items-center z-10">
              <div
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isCompleted
                    ? 'bg-blue-600 text-white shadow-xs'
                    : isCurrent
                    ? 'bg-blue-600 text-white ring-4 ring-blue-100 shadow-md animate-pulse'
                    : 'bg-white text-slate-400 border-2 border-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <span
                className={`text-[9px] sm:text-[10px] mt-1.5 font-semibold text-center select-none max-w-[50px] leading-tight ${
                  isCurrent
                    ? 'text-blue-600 font-bold'
                    : isCompleted
                    ? 'text-slate-800'
                    : 'text-slate-400'
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
