import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { openAiHandlers } from '../mocks/openai-handlers';

// OpenAI is always mocked in unit/integration tests. Supabase requests pass through to the local stack.
export const server = setupServer(...openAiHandlers);

beforeAll(() =>
  server.listen({
    onUnhandledRequest(request, print) {
      if (new URL(request.url).hostname === 'api.openai.com') print.error();
    },
  }),
);
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
