'use client';

import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useState } from 'react';
import { IconButton } from '@/components/ui/IconButton';
import { Input, type InputProps } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

/** Password field with a show/hide toggle (01-auth.md §8.2). */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type'>>(function PasswordInput(
  { className, ...props },
  ref,
) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} type={visible ? 'text' : 'password'} className={cn('pr-12', className)} {...props} />
      <IconButton
        label={visible ? 'Hide password' : 'Show password'}
        icon={visible ? EyeOff : Eye}
        size="sm"
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
        className="absolute right-1 top-1"
      />
    </div>
  );
});
