'use client';

import { useEffect, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { MobileDeviceBanner } from '@/components/layout/MobileDeviceBanner';
import { OnboardingTooltips } from '@/components/onboarding/OnboardingTooltips';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { FeedbackWidget } from '@/components/feedback/FeedbackWidget';
import { KeyTermsPanel } from '@/components/key-terms/KeyTermsPanel';
import { DocumentViewer } from '@/components/viewer/DocumentViewer';
import { useChat } from '@/hooks/useChat';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';
import { useResultsViewerStore } from '@/stores/useResultsViewerStore';
import type { ContractDetail } from '@/types/api';
import { CalibrationWarningBanner } from './CalibrationWarningBanner';
import { LegalDisclaimer } from './LegalDisclaimer';
import { ResultsHeader } from './ResultsHeader';
import { TypeMismatchBanner } from './TypeMismatchBanner';

// Panels scroll independently inside a viewport-height area below the header and banners.
const PANEL_HEIGHT = { height: 'calc(100dvh - 18rem)', minHeight: '28rem' };

/**
 * ≥ 1024 px: resizable 60/40 split. Below: tabs (Document | Key Terms), plus the mobile banner < 768 px
 * (06 §8.3). The Chat tab is added with F11 (spec 09). Before mount, CSS breakpoints pick the layout so
 * there's no flash; after mount only the active layout renders.
 */
export function ResultsLayout({ detail }: { detail: ContractDetail }) {
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const { contract, key_terms } = detail;
  // One chat state for the page, so a conversation (and an in-flight answer) survives tab switches.
  const chatState = useChat(contract.id, { enabled: true });
  const chat = (
    <ChatPanel chat={chatState} contractType={contract.contract_type} status={contract.status} pageCount={contract.page_count ?? 1} />
  );

  // Feedback sits after the term list in the Key Terms tab, so it scrolls with it (11 §8.1).
  const terms = (
    <>
      <KeyTermsPanel contractId={contract.id} contractType={contract.contract_type} pageCount={contract.page_count ?? 1} terms={key_terms} />
      {contract.status === 'completed' && <FeedbackWidget key={contract.id} contractId={contract.id} initialFeedback={detail.feedback} />}
    </>
  );
  const viewer = (
    <DocumentViewer
      contractId={contract.id}
      fileName={contract.file_name}
      pageCount={contract.page_count ?? 1}
      contractText={contract.contract_text ?? ''}
      pdfUrl={detail.pdf_url}
      pdfUrlExpiresAt={detail.pdf_url_expires_at}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <ResultsHeader contract={contract} />
      <LegalDisclaimer />
      <CalibrationWarningBanner />
      {contract.type_mismatch && contract.detected_contract_type && (
        <TypeMismatchBanner selected={contract.contract_type} detected={contract.detected_contract_type} />
      )}
      <MobileDeviceBanner />
      <OnboardingTooltips page="results" />

      {isDesktop !== false && (
        <div className={cn(isDesktop === null && 'hidden lg:block')}>
          <PanelGroup direction="horizontal" autoSaveId="ciq-results-split" style={PANEL_HEIGHT}>
            <Panel defaultSize={60} minSize={40} maxSize={75} className="min-h-0">
              {viewer}
            </Panel>
            <PanelResizeHandle
              aria-label="Resize panels"
              className="group mx-1 flex w-1 items-stretch justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <span aria-hidden className="w-px bg-border transition-colors duration-100 ease-out group-hover:bg-brand" />
            </PanelResizeHandle>
            <Panel defaultSize={40} minSize={25} className="min-h-0">
              <SidePanel terms={terms} chat={chat} />
            </Panel>
          </PanelGroup>
        </div>
      )}

      {isDesktop !== true && (
        <div className={cn(isDesktop === null && 'lg:hidden')}>
          <CompactTabs viewer={viewer} chat={chat}>
            {terms}
          </CompactTabs>
        </div>
      )}
    </div>
  );
}

/** Tabbed layout below 1024 px. Navigating to a page switches to the Document tab so it's visible; the viewer
 * replays a navigation that arrived while it was hidden (useViewerNavigation). */
function CompactTabs({ viewer, chat, children }: { viewer: React.ReactNode; chat: React.ReactNode; children: React.ReactNode }) {
  const [tab, setTab] = useState<'document' | 'terms' | 'chat'>('terms');
  const setActiveTab = useResultsViewerStore((s) => s.setActiveTab);
  const scrollRequestId = useResultsViewerStore((s) => s.scrollRequestId);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setTab('document');
  }, [scrollRequestId]);

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => {
        const next = v as 'document' | 'terms' | 'chat';
        setTab(next);
        if (next !== 'document') setActiveTab(next);
      }}
    >
      <TabsList>
        <TabsTrigger value="document">Document</TabsTrigger>
        <TabsTrigger value="terms">Key Terms</TabsTrigger>
        <TabsTrigger value="chat" data-onboarding="chat-tab">
          Chat
        </TabsTrigger>
      </TabsList>
      {/* Kept mounted while hidden so switching tabs never re-downloads the PDF (07 §8.10). */}
      <TabsContent value="document" forceMount className="pt-4 data-[state=inactive]:hidden" style={PANEL_HEIGHT}>
        {viewer}
      </TabsContent>
      <TabsContent value="terms" className="pt-4">
        {children}
      </TabsContent>
      <TabsContent value="chat" className="pt-4" style={PANEL_HEIGHT}>
        {chat}
      </TabsContent>
    </Tabs>
  );
}

/** ≥ 1024 px side panel: Key Terms | Chat, bound to the store's activeTab (06 §8.1). */
function SidePanel({ terms, chat }: { terms: React.ReactNode; chat: React.ReactNode }) {
  const activeTab = useResultsViewerStore((s) => s.activeTab);
  const setActiveTab = useResultsViewerStore((s) => s.setActiveTab);
  return (
    <section aria-label="Side panel" className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'terms' | 'chat')} className="flex h-full min-h-0 flex-col">
        <TabsList className="px-4">
          <TabsTrigger value="terms">Key Terms</TabsTrigger>
          <TabsTrigger value="chat" data-onboarding="chat-tab">
            Chat
          </TabsTrigger>
        </TabsList>
        <TabsContent value="terms" className="min-h-0 flex-1 overflow-y-auto p-4">
          {terms}
        </TabsContent>
        <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col p-4 data-[state=inactive]:hidden">
          {chat}
        </TabsContent>
      </Tabs>
    </section>
  );
}
