'use client';

import React, { useState } from 'react';
import { useCustomer } from '@/context/CustomerContext';
import { ServiceRequestType } from '@/types';
import { Bell, Droplets, HelpCircle, Receipt, Sparkles, X, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface ServiceOption {
  type: ServiceRequestType;
  label: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  bgColor: string;
}

const serviceOptions: ServiceOption[] = [
  {
    type: 'call_waiter',
    label: 'Call Waiter',
    description: 'A server will come to your table immediately.',
    icon: Bell,
    iconColor: 'text-amber-600',
    bgColor: 'bg-amber-50 border-amber-200/80',
  },
  {
    type: 'water',
    label: 'Request Water',
    description: 'Complimentary fresh chilled or room-temp water.',
    icon: Droplets,
    iconColor: 'text-sky-600',
    bgColor: 'bg-sky-50 border-sky-200/80',
  },
  {
    type: 'request_bill',
    label: 'Request Bill',
    description: 'Ask for the printed physical table check.',
    icon: Receipt,
    iconColor: 'text-emerald-600',
    bgColor: 'bg-emerald-50 border-emerald-200/80',
  },
  {
    type: 'assistance',
    label: 'Request Assistance',
    description: 'Help with menu recommendations or allergies.',
    icon: HelpCircle,
    iconColor: 'text-blue-600',
    bgColor: 'bg-blue-50 border-blue-200/80',
  },
  {
    type: 'cleaning',
    label: 'Clean Table',
    description: 'Request table wiping or extra napkins and cutlery.',
    icon: Sparkles,
    iconColor: 'text-indigo-600',
    bgColor: 'bg-indigo-50 border-indigo-200/80',
  },
];

export function CallWaiterModal() {
  const { isCallWaiterModalOpen, setIsCallWaiterModalOpen, submitServiceRequest, table } = useCustomer();
  const [selectedType, setSelectedType] = useState<ServiceRequestType>('call_waiter');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isCallWaiterModalOpen) return null;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);

    const result = await submitServiceRequest(selectedType, notes.trim() || undefined);

    setIsSubmitting(false);
    if (result.success) {
      setIsSent(true);
      setTimeout(() => {
        setIsSent(false);
        setIsCallWaiterModalOpen(false);
        setNotes('');
      }, 2000);
    } else {
      setErrorMsg(result.error || 'Failed to send service request.');
    }
  };

  const handleClose = () => {
    setIsCallWaiterModalOpen(false);
    setIsSent(false);
    setErrorMsg(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="fixed inset-0" onClick={handleClose} />

      <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden p-6 z-10 animate-in slide-in-from-bottom duration-300">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {isSent ? (
          <div className="py-8 text-center flex flex-col items-center justify-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center animate-in zoom-in-75">
              <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Your request has been sent!</h3>
            <p className="text-xs text-slate-500 max-w-xs">
              A staff member has been notified for {table?.number || 'your table'} and will assist you shortly.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-800 text-[11px] font-bold rounded-lg border border-amber-200/60">
                <Bell className="w-3.5 h-3.5 text-amber-600" />
                <span>Service Request • {table?.number || 'Table'}</span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mt-2">How may we assist you?</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Select your request and your waiter will be paged instantly.
              </p>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
                {errorMsg}
              </div>
            )}

            {/* Service Options List */}
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {serviceOptions.map((opt) => {
                const Icon = opt.icon;
                const isSelected = selectedType === opt.type;

                return (
                  <button
                    key={opt.type}
                    onClick={() => setSelectedType(opt.type)}
                    className={`w-full flex items-center gap-3.5 p-3 rounded-2xl border text-left transition-all ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/50 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${opt.bgColor}`}
                    >
                      <Icon className={`w-5 h-5 ${opt.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-slate-900">{opt.label}</div>
                      <div className="text-[11px] text-slate-500 truncate">{opt.description}</div>
                    </div>
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        isSelected ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                      }`}
                    >
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Optional Note */}
            <div>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add optional note (e.g. 2 glasses of still water)..."
                maxLength={120}
                className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-slate-400"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="outline"
                onClick={handleClose}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                isLoading={isSubmitting}
                className="flex-1 shadow-md"
              >
                Send Request
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
