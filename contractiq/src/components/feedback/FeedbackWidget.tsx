'use client';

import { AlertCircle, CheckCircle2, ThumbsDown, ThumbsUp, type LucideIcon } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { Textarea } from '@/components/ui/Textarea';
import { useSubmitFeedback } from '@/hooks/useSubmitFeedback';
import { ApiClientError } from '@/lib/api-client';
import { MAX_FEEDBACK_COMMENT } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { ContractDetail } from '@/types/api';

type Rating = 'up' | 'down';
type Accuracy = 'yes' | 'partially' | 'no';
type Field = 'rating' | 'accuracy' | 'comment';

const ACCURACY_OPTIONS: { value: Accuracy; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'partially', label: 'Partially' },
  { value: 'no', label: 'No' },
];
const COUNTER_FROM = 900;
const FALLBACK_ERROR = 'Something went wrong on our side. Please try again.';

/**
 * Thumbs up/down + optional accuracy answer and comment for a completed contract (11 §7.2, §8).
 * Every save sends the full state. Rating/accuracy saves carry the last *saved* comment, never the draft.
 * Remount (key) to re-initialise for another contract. Ids and the radio name come from useId: before mount
 * the results page renders both layouts, and same-named native radios would form one group across them.
 */
export function FeedbackWidget({ contractId, initialFeedback }: { contractId: string; initialFeedback: ContractDetail['feedback'] }) {
  const submit = useSubmitFeedback(contractId);
  const uid = useId();
  const headingId = `${uid}-heading`;
  const commentId = `${uid}-comment`;
  const [rating, setRating] = useState<Rating | null>(initialFeedback?.rating ?? null);
  const [accuracy, setAccuracy] = useState<Accuracy | null>(initialFeedback?.accuracy_rating ?? null);
  const [commentDraft, setCommentDraft] = useState(initialFeedback?.comment ?? '');
  const [savedComment, setSavedComment] = useState<string | null>(initialFeedback?.comment ?? null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorText, setErrorText] = useState('');
  const [pending, setPending] = useState<Field | null>(null);
  const saved = useRef({ rating: initialFeedback?.rating ?? null, accuracy: initialFeedback?.accuracy_rating ?? null });

  function save(next: { rating: Rating; accuracy: Accuracy | null; comment: string | null }, field: Field) {
    setStatus('saving');
    setPending(field);
    submit.mutate(
      { rating: next.rating, accuracy_rating: next.accuracy, comment: next.comment ?? undefined },
      {
        onSuccess: (res) => {
          saved.current = { rating: res.rating, accuracy: res.accuracy_rating };
          setSavedComment(res.comment);
          if (field === 'comment') setCommentDraft(res.comment ?? '');
          setStatus('saved');
        },
        onError: (e) => {
          setRating(saved.current.rating); // revert to the last saved values; the draft stays
          setAccuracy(saved.current.accuracy);
          setErrorText(e instanceof ApiClientError ? e.message : FALLBACK_ERROR);
          setStatus('error');
        },
        onSettled: () => setPending(null),
      },
    );
  }

  const rate = (r: Rating) => {
    if (r === rating) return; // can be changed, not removed
    setRating(r);
    save({ rating: r, accuracy, comment: savedComment }, 'rating');
  };
  const answer = (a: Accuracy) => {
    if (!rating) return;
    setAccuracy(a);
    save({ rating, accuracy: a, comment: savedComment }, 'accuracy');
  };
  const sendComment = () => {
    if (!rating) return;
    save({ rating, accuracy, comment: commentDraft.trim() || null }, 'comment');
  };

  const commentUnchanged = commentDraft.trim() === (savedComment ?? '');

  return (
    <section aria-labelledby={headingId} className="mt-6 flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      {/* h2, not 11 §8.1's h3: the Key Terms tab has no h2 (heading order), matching ChatPanel's heading. */}
      <h2 id={headingId} className="text-body-lg text-fg-primary">
        Was this review helpful?
      </h2>
      <div role="group" aria-label="Rate this review" className="flex gap-2">
        <Thumb icon={ThumbsUp} label="Yes, helpful" pressed={rating === 'up'} busy={pending === 'rating' && rating === 'up'} onClick={() => rate('up')} />
        <Thumb icon={ThumbsDown} label="No, not helpful" pressed={rating === 'down'} busy={pending === 'rating' && rating === 'down'} onClick={() => rate('down')} />
      </div>

      {rating && (
        <>
          <fieldset className="flex flex-col gap-2" aria-busy={pending === 'accuracy' || undefined}>
            <legend className="mb-2 text-body-sm text-fg-secondary">Were the extracted terms accurate? (optional)</legend>
            <RadioGroup name={`${uid}-accuracy`} value={accuracy} onValueChange={answer} options={ACCURACY_OPTIONS} />
          </fieldset>
          <div className="flex flex-col gap-2">
            <label htmlFor={commentId} className="text-body-sm text-fg-secondary">
              Anything we should know? (optional)
            </label>
            <Textarea
              id={commentId}
              rows={3}
              maxLength={MAX_FEEDBACK_COMMENT}
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
            />
            <div className="flex items-center justify-between gap-2">
              <span aria-live="polite" className="text-body-sm text-fg-secondary">
                {commentDraft.length > COUNTER_FROM ? `${commentDraft.length}/${MAX_FEEDBACK_COMMENT}` : ''}
              </span>
              <Button variant="secondary" size="sm" onClick={sendComment} loading={pending === 'comment'} disabled={commentUnchanged || status === 'saving'}>
                Send comment
              </Button>
            </div>
          </div>
        </>
      )}

      <p aria-live="polite" className="text-body-sm">
        {status === 'saved' && (
          <span className="inline-flex items-center gap-1 text-success-fg">
            <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0" />
            Thanks for your feedback
          </span>
        )}
        {status === 'error' && (
          <span className="inline-flex items-center gap-1 text-danger-fg">
            <AlertCircle aria-hidden className="h-4 w-4 shrink-0" />
            {errorText}
          </span>
        )}
      </p>
    </section>
  );
}

/** 40×40 toggle. Pressed: Blue 50 bg, Blue 500 border, Blue 700 icon; unpressed: white, Grey 100 border. */
function Thumb({ icon: Icon, label, pressed, busy, onClick }: { icon: LucideIcon; label: string; pressed: boolean; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      aria-busy={busy || undefined}
      onClick={onClick}
      className={cn(
        'inline-flex h-10 w-10 items-center justify-center rounded-md border transition-colors duration-100 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        pressed ? 'border-brand bg-brand-subtle text-info-fg' : 'border-border bg-surface text-fg-secondary hover:bg-surface-subtle',
      )}
    >
      <Icon aria-hidden className="h-4 w-4" />
    </button>
  );
}
