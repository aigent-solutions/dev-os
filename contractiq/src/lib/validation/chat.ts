import { z } from 'zod';
import { MAX_CHAT_MESSAGE_CHARS } from '@/lib/constants';

// POST /api/contracts/{id}/chat (09 §5.2).
export const ChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(MAX_CHAT_MESSAGE_CHARS),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
