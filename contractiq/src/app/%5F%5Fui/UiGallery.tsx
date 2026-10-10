'use client';

import { AlertTriangle, CheckCircle2, MoreHorizontal, Settings, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/Collapsible';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Dialog } from '@/components/ui/Dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { FormField } from '@/components/ui/FormField';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { PageContainer } from '@/components/ui/PageContainer';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { Progress } from '@/components/ui/Progress';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Textarea } from '@/components/ui/Textarea';
import { toast } from '@/components/ui/Toast';
import { Tooltip } from '@/components/ui/Tooltip';
import { LOW_CONFIDENCE_TOOLTIP } from '@/lib/constants';

export function UiGallery() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [type, setType] = useState<string | undefined>();
  const [notes, setNotes] = useState('');

  return (
    <main id="main">
      <PageContainer>
        <SectionHeader as="h1" title="UI primitives" description="Development only. Every primitive in src/components/ui." />

        <section className="flex flex-col gap-6">
          <SectionHeader title="Buttons" />
          <div className="flex flex-wrap items-center gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Delete</Button>
            <Button size="sm">Small</Button>
            <Button loading>Saving</Button>
            <Button disabled>Disabled</Button>
            <IconButton label="Settings" icon={Settings} variant="secondary" />
            <IconButton label="Delete" icon={Trash2} size="sm" />
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <SectionHeader title="Badges and banners" />
          <div className="flex flex-wrap gap-2">
            <Badge>Neutral</Badge>
            <Badge tone="brand">For NDAs and MSAs</Badge>
            <Badge tone="success" icon={CheckCircle2}>
              92%
            </Badge>
            <Badge tone="warning">65%</Badge>
            <Badge tone="danger" icon={AlertTriangle}>
              31%
            </Badge>
            <Badge tone="accent">Custom</Badge>
          </div>
          <Banner tone="info" title="Heads up">
            This is an informational banner.
          </Banner>
          <Banner tone="warning" onDismiss={() => undefined}>
            A dismissible warning banner.
          </Banner>
          <Banner tone="danger">Something failed.</Banner>
          <Banner tone="success">Saved.</Banner>
        </section>

        <section className="flex flex-col gap-6">
          <SectionHeader title="Form controls" />
          <Card className="flex max-w-md flex-col gap-4">
            <FormField label="Email" name="email" hint="We never share it." required>
              {(f) => <Input type="email" placeholder="you@company.com" {...f} />}
            </FormField>
            <FormField label="Password" name="password" error="Password must be at least 8 characters.">
              {(f) => <Input type="password" {...f} />}
            </FormField>
            <FormField label="Contract type" name="contract_type">
              {(f) => (
                <Select
                  {...f}
                  value={type}
                  onValueChange={setType}
                  placeholder="Choose a type"
                  options={[
                    { value: 'nda', label: 'NDA' },
                    { value: 'msa', label: 'MSA' },
                  ]}
                />
              )}
            </FormField>
            <FormField label="Notes" name="notes">
              {(f) => <Textarea autoResize value={notes} onChange={(e) => setNotes(e.target.value)} {...f} />}
            </FormField>
          </Card>
        </section>

        <section className="flex flex-col gap-6">
          <SectionHeader title="Overlays" />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setDialogOpen(true)}>
              Open dialog
            </Button>
            <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
              Delete account
            </Button>
            <Tooltip content="Plain-English explanation of this term.">
              <Button variant="ghost">Tooltip</Button>
            </Tooltip>
            <Tooltip content={LOW_CONFIDENCE_TOOLTIP} dismissible={false}>
              <button type="button" aria-label="Low confidence" className="rounded-sm text-danger-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                <AlertTriangle aria-hidden className="h-4 w-4" />
              </button>
            </Tooltip>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="secondary">Popover</Button>
              </PopoverTrigger>
              <PopoverContent>
                <p className="font-medium">Tip</p>
                <p className="text-fg-secondary">Click a page number to jump to it.</p>
              </PopoverContent>
            </Popover>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton label="Row actions" icon={MoreHorizontal} variant="secondary" />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>alice@contractiq.test</DropdownMenuLabel>
                <DropdownMenuItem>Open</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem tone="danger">Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="secondary" onClick={() => toast({ title: 'Contract deleted', tone: 'success' })}>
              Success toast
            </Button>
            <Button
              variant="secondary"
              onClick={() => toast({ title: "Couldn't save", description: 'Please try again.', tone: 'danger' })}
            >
              Danger toast
            </Button>
          </div>
          <Dialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            title="Dialog title"
            description="Dialogs trap focus and close on Esc."
            footer={<Button onClick={() => setDialogOpen(false)}>Done</Button>}
          />
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Delete your account?"
            body="This permanently deletes your contracts and chat history."
            confirmLabel="Delete account"
            tone="danger"
            confirmText="DELETE"
            onConfirm={async () => {
              await new Promise((r) => setTimeout(r, 800));
              setConfirmOpen(false);
            }}
          />
        </section>

        <section className="flex flex-col gap-6">
          <SectionHeader title="Tabs and disclosure" />
          <Tabs defaultValue="terms">
            <TabsList>
              <TabsTrigger value="terms">Key Terms</TabsTrigger>
              <TabsTrigger value="chat">Chat</TabsTrigger>
            </TabsList>
            <TabsContent value="terms" className="pt-4">
              Key terms panel content.
            </TabsContent>
            <TabsContent value="chat" className="pt-4">
              Chat panel content.
            </TabsContent>
          </Tabs>
          <Collapsible className="flex flex-col gap-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-fit">
                Why?
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="text-body-sm text-fg-secondary">
              &ldquo;This Agreement shall be governed by the laws of the State of New York.&rdquo;
            </CollapsibleContent>
          </Collapsible>
        </section>

        <section className="flex flex-col gap-6" aria-busy="true">
          <SectionHeader title="Loading states" />
          <div className="flex items-center gap-4">
            <Spinner />
            <Spinner size="sm" label="Saving" />
          </div>
          <Progress value={60} label="Upload progress" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </section>
      </PageContainer>
    </main>
  );
}
