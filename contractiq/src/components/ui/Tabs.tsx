'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

export const TabsList = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, ...props }, ref) {
  return <TabsPrimitive.List ref={ref} className={cn('flex gap-4 border-b border-border', className)} {...props} />;
});

/** Active: brand underline + primary text. Inactive: secondary text. Arrow keys move between tabs. */
export const TabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        '-mb-px inline-flex h-10 items-center border-b-2 border-transparent text-body-lg text-fg-secondary transition-colors duration-100 ease-out',
        'hover:text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
        'data-[state=active]:border-brand data-[state=active]:text-fg-primary',
        className,
      )}
      {...props}
    />
  );
});

export const TabsContent = forwardRef<
  ElementRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn('focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus', className)}
      {...props}
    />
  );
});
