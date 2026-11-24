'use client';

import React from 'react';
import { useCustomer } from '@/context/CustomerContext';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export function ToastContainer() {
  const { toasts, dismissToast } = useCustomer();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 sm:top-5 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2.5 w-[92%] max-w-sm pointer-events-none">
      {toasts.map((toast) => {
        const type = toast.type || 'info';
        const isSuccess = type === 'success';
        const isError = type === 'error';
        const isWarning = type === 'warning';
        const isInfo = type === 'info';

        // Glassmorphism styling configuration per notification type
        const config = isSuccess
          ? {
              border: 'border-emerald-500/30',
              glow: 'from-emerald-500/15 via-emerald-500/5 to-transparent',
              topLine: 'from-emerald-400/80 via-emerald-500/40 to-transparent',
              iconBg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.25)]',
              Icon: CheckCircle2,
            }
          : isError
          ? {
              border: 'border-rose-500/30',
              glow: 'from-rose-500/15 via-rose-500/5 to-transparent',
              topLine: 'from-rose-400/80 via-rose-500/40 to-transparent',
              iconBg: 'bg-rose-500/15 border-rose-500/30 text-rose-400 shadow-[0_0_14px_rgba(244,63,94,0.25)]',
              Icon: AlertCircle,
            }
          : isWarning
          ? {
              border: 'border-amber-500/30',
              glow: 'from-amber-500/15 via-amber-500/5 to-transparent',
              topLine: 'from-amber-400/80 via-amber-500/40 to-transparent',
              iconBg: 'bg-amber-500/15 border-amber-500/30 text-amber-400 shadow-[0_0_14px_rgba(245,158,11,0.25)]',
              Icon: AlertTriangle,
            }
          : {
              border: 'border-sky-500/30',
              glow: 'from-sky-500/15 via-sky-500/5 to-transparent',
              topLine: 'from-sky-400/80 via-sky-500/40 to-transparent',
              iconBg: 'bg-sky-500/15 border-sky-500/30 text-sky-400 shadow-[0_0_14px_rgba(14,165,233,0.25)]',
              Icon: Info,
            };

        const IconComponent = config.Icon;

        return (
          <div
            key={toast.id}
            className={`group pointer-events-auto relative overflow-hidden flex items-start gap-3 p-3.5 sm:p-4 rounded-2xl backdrop-blur-2xl bg-zinc-950/85 border ${config.border} shadow-[0_12px_40px_rgba(0,0,0,0.4),0_1px_1px_rgba(255,255,255,0.1)_inset] transition-all duration-300 animate-in fade-in slide-in-from-top-3`}
          >
            {/* Top specular hairline accent */}
            <div
              className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${config.topLine}`}
            />

            {/* Ambient diffuse background aura */}
            <div
              className={`absolute -top-10 -left-10 w-32 h-32 bg-gradient-to-br ${config.glow} rounded-full blur-2xl pointer-events-none -z-10`}
            />

            {/* Glowing Icon Pill */}
            <div
              className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${config.iconBg}`}
            >
              <IconComponent className="w-4 h-4" />
            </div>

            {/* Message Body */}
            <div className="flex-1 min-w-0 pr-1">
              <div className="font-semibold text-[13px] sm:text-sm text-zinc-100 leading-snug tracking-[-0.01em]">
                {toast.title}
              </div>
              {toast.description && (
                <div className="text-xs text-zinc-300/90 leading-relaxed mt-0.5 font-normal">
                  {toast.description}
                </div>
              )}
            </div>

            {/* Dismiss Cross */}
            <button
              onClick={() => dismissToast(toast.id)}
              type="button"
              aria-label="Dismiss notification"
              className="w-6 h-6 flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors shrink-0 -mr-1 -mt-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
