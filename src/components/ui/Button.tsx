import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'accent';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', isLoading = false, disabled, children, ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-all duration-200 select-none disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] rounded-xl focus:outline-none focus:ring-2 focus:ring-light-primary/20 cursor-pointer';

    const variants = {
      primary: 'bg-light-primary hover:bg-light-primary-container text-light-on-primary shadow-sm shadow-light-primary/20',
      secondary: 'bg-light-surface-container-low hover:bg-light-surface-container text-light-on-surface',
      outline: 'border border-light-outline-variant hover:bg-light-surface-container-low text-light-on-surface bg-light-surface-container-lowest shadow-xs',
      ghost: 'hover:bg-light-surface-container text-light-on-surface',
      danger: 'bg-light-error hover:bg-light-error-container text-light-on-error shadow-sm shadow-light-error/20',
      accent: 'bg-light-secondary hover:bg-light-secondary-container text-light-on-secondary shadow-sm shadow-light-secondary/20',
    };

    const sizes = {
      xs: 'text-[11px] px-2.5 py-1 gap-1 font-medium',
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
