import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'accent';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', isLoading = false, disabled, children, ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-all duration-200 select-none disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20';

    const variants = {
      primary: 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-500/20',
      secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-900',
      outline: 'border border-slate-200 hover:bg-slate-50 text-slate-700 bg-white shadow-xs',
      ghost: 'hover:bg-slate-100 text-slate-700',
      danger: 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm shadow-rose-500/20',
      accent: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-500/20',
    };

    const sizes = {
      sm: 'text-xs px-3 py-1.5 gap-1.5 font-medium',
      md: 'text-sm px-4 py-2.5 gap-2 font-medium',
      lg: 'text-base px-6 py-3.5 gap-2.5 font-semibold',
      icon: 'p-2.5',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {isLoading && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
