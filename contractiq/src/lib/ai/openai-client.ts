import '@/lib/server-guard'; // loaded by Netlify functions and evals (00 §6.12)
import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import { serverEnv } from '@/lib/env';

let client: OpenAI | undefined;

/** Singleton. maxRetries 0: retries are ours (withRetry), per mode. OPENAI_BASE_URL is read by the SDK. */
export function getOpenAI(): OpenAI {
  return (client ??= new OpenAI({ apiKey: serverEnv.OPENAI_API_KEY, maxRetries: 0 }));
}

/** sha256(user_id + salt) for OpenAI's `user` param, so no raw IDs leave the app. */
export function hashUserId(userId: string): string {
  return createHash('sha256').update(userId + serverEnv.OPENAI_USER_HASH_SALT).digest('hex');
}
