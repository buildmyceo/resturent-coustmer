import React from 'react';
import { OrderStatus } from '@/types';
import { CheckCircle2, Clock, ChefHat, Sparkles, Check, AlertCircle } from 'lucide-react';

interface OrderProgressStepperProps {
  status: OrderStatus;
}

const steps = [
  { key: 'pending', label: 'Received', icon: Clock },
  { key: 'accepted', label: 'Accepted', icon: Check },
  { key: 'preparing', label: 'Preparing', icon: ChefHat },
  { key: 'ready', label: 'Ready', icon: Sparkles },
  { key: 'served', label: 'Served', icon: CheckCircle2 },
];

export function OrderProgressStepper({ status }: OrderProgressStepperProps) {
  if (status === 'cancelled') {
    return (
      <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold">
        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
        <span>Order was cancelled by restaurant.</span>
      </div>
    );
  }

  // Determine current step index
  const statusIndexMap: Record<string, number> = {
    pending: 0,
    accepted: 1,
    preparing: 2,
    ready: 3,
    served: 4,
    completed: 4,
  };

  const currentIndex = statusIndexMap[status] ?? 0;

  return (
    <div className="w-full py-2">
      <div className="relative flex items-center justify-between">
        {/* Background Connecting Line */}
        <div className="absolute top-4 left-4 right-4 h-0.5 bg-slate-200 -z-0" />
        {/* Progress Line */}
        <div
          className="absolute top-4 left-4 h-0.5 bg-blue-600 transition-all duration-500 -z-0"
          style={{ width: `${(currentIndex / (steps.length - 1)) * 92}%` }}
        />

        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isCompleted = idx < currentIndex;
          const isCurrent = idx === currentIndex;

          return (
            <div key={step.key} className="flex flex-col items-center z-10">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isCompleted
                    ? 'bg-blue-600 text-white shadow-xs'
                    : isCurrent
                    ? 'bg-blue-600 text-white ring-4 ring-blue-100 shadow-md animate-pulse'
                    : 'bg-white text-slate-400 border-2 border-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <span
                className={`text-[10px] mt-1.5 font-semibold text-center select-none ${
                  isCurrent
                    ? 'text-blue-600'
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
