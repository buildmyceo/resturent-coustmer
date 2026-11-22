'use client';

import React, { useState } from 'react';
import { useCustomer } from '@/context/CustomerContext';
import { ServiceRequestType } from '@/types';
import { Bell, Droplets, HelpCircle, Receipt, Sparkles, X, CheckCircle2, SendHorizontal } from 'lucide-react';
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
    iconColor: 'text-on-amber-badge',
    bgColor: 'bg-amber-badge border-amber-badge/80',
  },
  {
    type: 'water',
    label: 'Request Water',
    description: 'Complimentary fresh chilled or room-temp water.',
    icon: Droplets,
    iconColor: 'text-sky-700',
    bgColor: 'bg-sky-50 border-sky-200/80',
  },
  {
    type: 'request_bill',
    label: 'Request Bill',
    description: 'Ask for the printed physical table check.',
    icon: Receipt,
    iconColor: 'text-veg',
    bgColor: 'bg-emerald-50 border-emerald-200/80',
  },
  {
    type: 'assistance',
    label: 'Request Assistance',
    description: 'Help with menu recommendations or allergies.',
    icon: HelpCircle,
    iconColor: 'text-indigo-700',
    bgColor: 'bg-indigo-50 border-indigo-200/80',
  },
  {
    type: 'cleaning',
    label: 'Clean Table',
    description: 'Request table wiping or extra napkins and cutlery.',
    icon: Sparkles,
    iconColor: 'text-purple-700',
    bgColor: 'bg-purple-50 border-purple-200/80',
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-light-on-surface/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="fixed inset-0" onClick={handleClose} />

      <div className="relative w-full max-w-md bg-light-surface-container-lowest text-light-on-surface rounded-t-[32px] sm:rounded-3xl shadow-2xl overflow-hidden p-6 z-10 border border-light-outline-variant/30 animate-in slide-in-from-bottom duration-300">
        {/* Mobile Pull Indicator */}
        <div className="w-10 h-1 rounded-full bg-light-outline-variant/60 mx-auto mb-3 sm:hidden" />

        <button
          onClick={handleClose}
          className="absolute top-5 right-5 p-2 text-light-on-surface-variant/70 hover:text-light-on-surface rounded-full hover:bg-light-surface-container transition-colors cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {isSent ? (
          <div className="py-8 text-center flex flex-col items-center justify-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-light-secondary-container text-light-primary flex items-center justify-center shadow-xs animate-in zoom-in-75">
              <CheckCircle2 className="w-9 h-9 stroke-[2.5]" />
            </div>
            <h3 className="font-display text-xl font-bold text-light-on-surface">Your request has been sent!</h3>
            <p className="text-xs text-light-on-surface-variant max-w-xs font-medium leading-relaxed">
              A staff member has been notified for {table?.number || 'your table'} and will assist you shortly.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-badge text-on-amber-badge text-[11px] font-bold rounded-full border border-amber-badge/70">
                <Bell className="w-3.5 h-3.5" />
                <span>Service Request • {table?.number || 'Table'}</span>
              </div>
              <h2 className="font-display text-2xl font-bold text-light-on-surface mt-2.5 tracking-tight">
                How may we assist you?
              </h2>
              <p className="text-xs text-light-on-surface-variant font-medium mt-1">
                Select your request and your waiter will be paged instantly.
              </p>
            </div>

            {errorMsg && (
              <div className="p-3 bg-light-error-container text-light-on-error-container text-xs rounded-2xl font-medium">
                {errorMsg}
              </div>
            )}

            {/* Service Options List */}
            <div className="space-y-2.5 max-h-68 overflow-y-auto pr-1">
              {serviceOptions.map((opt) => {
                const Icon = opt.icon;
                const isSelected = selectedType === opt.type;

                return (
                  <button
                    key={opt.type}
                    onClick={() => setSelectedType(opt.type)}
                    className={`w-full flex items-center gap-3.5 p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-2 border-light-primary bg-light-secondary-container/20 shadow-xs'
                        : 'border-light-outline-variant/60 hover:border-light-outline bg-light-surface-container-lowest hover:bg-light-surface-container-low/50'
                    }`}
                  >
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${opt.bgColor}`}
                    >
                      <Icon className={`w-5 h-5 ${opt.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-title font-bold text-sm text-light-on-surface">{opt.label}</div>
                      <div className="text-[11px] text-light-on-surface-variant font-medium truncate">
                        {opt.description}
                      </div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        isSelected ? 'border-light-primary bg-light-surface-container-lowest' : 'border-light-outline-variant'
                      }`}
                    >
                      {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-light-primary animate-in zoom-in-75" />}
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
                className="w-full text-xs p-3.5 rounded-2xl border border-light-outline-variant/70 bg-light-surface-container-low text-light-on-surface placeholder:text-light-on-surface-variant/50 focus:outline-none focus:border-light-primary focus:ring-2 focus:ring-light-primary/15 transition-all font-body font-medium"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-1">
              <Button
                variant="outline"
                onClick={handleClose}
                className="flex-1 py-3 rounded-2xl text-xs font-bold"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                isLoading={isSubmitting}
                className="flex-1 py-3 rounded-2xl text-xs font-bold gap-2 shadow-md"
              >
                <span>Send Request</span>
                <SendHorizontal className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
