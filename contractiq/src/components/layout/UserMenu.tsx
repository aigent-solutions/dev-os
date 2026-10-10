'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CircleUser, LogOut, Settings } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { IconButton } from '@/components/ui/IconButton';
import { signOut } from '@/lib/auth/client-auth';

/** Account menu: email (read-only), Settings, Sign out (00-foundation.md §8.2, 01-auth.md §8.5). */
export function UserMenu({ email }: { email: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  async function handleSignOut() {
    await signOut(); // clears cookies even if the revoke request fails
    queryClient.clear(); // wipe every cached query for this user
    router.replace('/');
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label="Account menu" icon={CircleUser} variant="ghost" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-w-xs">
        <DropdownMenuLabel title={email}>{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings aria-hidden className="h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleSignOut}>
          <LogOut aria-hidden className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
