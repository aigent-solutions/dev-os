# OpenAI mock fixtures

Served by `tests/mocks/openai-mock-server.ts` (E2E and the demo recording; `OPENAI_BASE_URL=http://localhost:4010/v1`).

- `extraction.json` — the message content for every extraction request: the 10 NDA terms for
  `tests/fixtures/pdfs/demo-nda-4p.pdf`. Source sentences are verbatim from that PDF, except
  **Breach & Remedy**, whose sentence is deliberately fabricated so verification fails and the term
  shows the ⚠️ low-confidence warning.
- `chat.txt` — the streamed answer for chat requests (cites page 3).
