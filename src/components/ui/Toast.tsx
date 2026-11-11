'use client';

import React from 'react';
import { useCustomer } from '@/context/CustomerContext';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export function ToastContainer() {
  const { toasts, dismissToast } = useCustomer();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[92%] max-w-md pointer-events-none">
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-2xl shadow-xl backdrop-blur-md border transition-all duration-300 animate-in slide-in-from-top-2 fade-in ${
              isSuccess
                ? 'bg-slate-900/95 text-white border-slate-800'
                : isError
                ? 'bg-rose-950/95 text-white border-rose-900'
                : 'bg-white/95 text-slate-900 border-slate-200'
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {isSuccess ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : isError ? (
                <AlertCircle className="w-5 h-5 text-rose-400" />
              ) : (
                <Info className="w-5 h-5 text-blue-500" />
              )}
            </div>
            <div className="flex-1 min-w-0 pr-1">
              <div className="font-semibold text-sm leading-tight">{toast.title}</div>
              {toast.description && (
                <div
                  className={`text-xs mt-0.5 leading-relaxed ${
                    isSuccess || isError ? 'text-slate-300' : 'text-slate-600'
                  }`}
                >
                  {toast.description}
                </div>
              )}
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              className="p-1 -mr-1 text-slate-400 hover:text-white rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
