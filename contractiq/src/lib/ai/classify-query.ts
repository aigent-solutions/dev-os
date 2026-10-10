import type { ChatQueryType } from '@/types/domain';

// Is the question about the contract, the conversation, or both? Pure regex, no API call (09 §6.6).
const HISTORY_PATTERN =
  /\b(earlier|before|previous(ly)?|you (said|mentioned|told me)|above|last (answer|question|reply)|recap|summari[sz]e (our|this|the) (chat|conversation|discussion)|what did (i|you) (ask|say))\b/i;

const CONTRACT_KEYWORDS =
  /\b(clause|term|terms|page|section|party|parties|liabilit(y|ies)|indemn\w*|confidential\w*|terminat\w*|renew\w*|payment|invoice|fee|fees|governing law|jurisdiction|ip|intellectual property|notice|breach|remed(y|ies)|non-?solicit\w*|non-?compete|warrant\w*|dispute|arbitration|scope|services|obligation\w*|duration|effective date|disclos\w*)\b/i;

export function classifyQuery(message: string): ChatQueryType {
  const h = HISTORY_PATTERN.test(message);
  const c = CONTRACT_KEYWORDS.test(message);
  if (h && c) return 'both';
  if (h) return 'history';
  return 'contract';
}
