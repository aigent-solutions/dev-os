// Chat groundedness regression: 20 off-document + 20 in-document questions (15-evals.md §6.9.5).
// npm run eval:chat -- [--subset smoke|full] [--live|--replay|--record] [--gate] [--expert-template]
//                      [--concurrency N] [--out dir] [--data dir] [--allow-replay-misses]
import { assertEvalEnv } from './lib/env-setup';
import path from 'node:path';
import { buildChatMessages, ChatStreamError, streamChatCompletion } from '@/lib/ai/chat';
import { parseCitations } from '@/lib/ai/citations';
import { classifyQuery } from '@/lib/ai/classify-query';
import { calculateCostUsd } from '@/lib/ai/pricing';
import { getChatPrompt } from '@/lib/ai/prompts';
import { serverEnv } from '@/lib/env';
import { ConfigError, EXIT, parseEvalArgs, pool, runMain } from './lib/cli';
import { loadChatDataset, type ChatItem, type EvalContract } from './lib/load-dataset';
import { chatGates, chatMetrics, type ChatResult } from './lib/metrics';
import { normaliseText } from './lib/normalise';
import { createEvalClient, evalCallStats } from './lib/openai-eval-client';
import { chatResultsCsv, chatSummaryMd, expertReviewCsv, gitSha, printGates, writeFile, writeJson, type Summary } from './lib/report';
import { recordingsDir } from './lib/extraction-run';

function chatConfig() {
  try {
    const promptVersion = serverEnv.CHAT_PROMPT_VERSION;
    getChatPrompt(promptVersion);
    return { promptVersion, model: serverEnv.OPENAI_CHAT_MODEL, maxInputTokens: serverEnv.CHAT_MAX_INPUT_TOKENS };
  } catch (e) {
    throw new ConfigError((e as Error).message);
  }
}

/** One question exactly as the app answers it: classifyQuery → buildChatMessages (no history) → stream → parseCitations. */
async function ask(item: ChatItem, contract: EvalContract, cfg: ReturnType<typeof chatConfig>, args: ReturnType<typeof parseEvalArgs>): Promise<ChatResult> {
  const client = createEvalClient(args.mode, { promptVersion: cfg.promptVersion, model: cfg.model, recordingsDir: recordingsDir(args.data) });
  const queryType = classifyQuery(item.question);
  const messages = buildChatMessages({
    version: cfg.promptVersion,
    contractType: contract.contract_type,
    contractText: contract.text,
    queryType,
    history: [],
    question: item.question,
    maxInputTokens: cfg.maxInputTokens,
  });
  const base = { id: item.id, contract_id: item.contract_id, category: item.category, question: item.question };
  let answer = '';
  let costUsd = 0;
  try {
    for await (const chunk of streamChatCompletion({ messages, userId: 'eval', signal: new AbortController().signal, client })) {
      if (chunk.type === 'delta') answer += chunk.text;
      else costUsd += calculateCostUsd(chunk.usage.promptTokens, chunk.usage.completionTokens);
    }
  } catch (err) {
    const miss = evalCallStats(client).misses.length > 0;
    const code = err instanceof ChatStreamError ? err.code : (err as Error).message;
    return {
      ...base,
      answer,
      cited_pages: [],
      is_not_found: false,
      passed: false,
      expected_pages_hit: null,
      answer_contains_ok: null,
      based_on_prefix: null,
      errored: !miss,
      replay_miss: miss,
      cost_usd: costUsd,
      notes: miss ? `replay miss ${evalCallStats(client).misses[0]}` : `error ${code}`,
    };
  }

  const { citedPages, isNotFound } = parseCitations(answer, contract.page_count, queryType);
  const notes: string[] = [];
  let passed: boolean;
  let expectedPagesHit: boolean | null = null;
  let containsOk: boolean | null = null;
  if (item.category === 'off_document') {
    passed = isNotFound;
    if (!passed) notes.push('answered an off-document question');
  } else {
    passed = !isNotFound && citedPages.length >= 1;
    if (isNotFound) notes.push('said "cannot find"');
    else if (!citedPages.length) notes.push('no page cited');
    expectedPagesHit = citedPages.some((p) => item.expected_pages.includes(p));
    if (item.expected_answer_contains) {
      const n = normaliseText(answer);
      containsOk = item.expected_answer_contains.every((g) => g.some((v) => n.includes(normaliseText(v))));
    }
  }
  return {
    ...base,
    answer,
    cited_pages: citedPages,
    is_not_found: isNotFound,
    passed,
    expected_pages_hit: expectedPagesHit,
    answer_contains_ok: containsOk,
    based_on_prefix: isNotFound ? null : /^\s*based on the document/i.test(answer),
    errored: false,
    replay_miss: false,
    cost_usd: costUsd,
    notes: notes.join('; '),
  };
}

runMain(async () => {
  const args = parseEvalArgs();
  assertEvalEnv();
  const cfg = chatConfig();
  const { items, contracts } = await loadChatDataset({ dataDir: args.data, subset: args.subset });
  console.log(`Chat groundedness eval: ${items.length} questions · mode ${args.mode} · prompt ${cfg.promptVersion} · model ${cfg.model}`);

  const results = await pool(items, args.concurrency, async (item) => {
    const r = await ask(item, contracts.get(item.contract_id)!, cfg, args);
    console.log(`  ${r.passed ? '✓' : '✗'} ${r.id} ${r.notes}`);
    return r;
  });
  const metrics = chatMetrics(results);
  const gates = chatGates(metrics);
  const warnings: string[] = [];
  if (metrics.replay_misses) {
    warnings.push(
      args.allowReplayMisses
        ? `${metrics.replay_misses} replay misses — recordings stale; the live job covers this change`
        : `${metrics.replay_misses} replay misses — re-record with --record (exit 3)`,
    );
  }
  const summary: Summary = {
    run_id: path.basename(args.out),
    script: 'chat',
    mode: args.mode,
    subset: args.subset,
    stage: args.stage,
    prompt_version: cfg.promptVersion,
    model: cfg.model,
    git_sha: gitSha(),
    metrics,
    gates,
    replay_misses: metrics.replay_misses,
    dataset_errors: [],
    warnings,
  };
  writeFile(args.out, 'chat-results.csv', chatResultsCsv(results));
  if (args.expertTemplate) writeFile(args.out, 'expert-review.csv', expertReviewCsv(results));
  writeJson(args.out, 'summary.json', summary);
  writeFile(args.out, 'summary.md', chatSummaryMd(summary, metrics, results));
  printGates(gates);
  for (const w of warnings) console.log(`⚠️ ${w}`);
  console.log(`Reports: ${args.out}`);

  if (args.mode === 'replay' && metrics.replay_misses && !args.allowReplayMisses) return EXIT.REPLAY_MISSES;
  return args.gate && gates.some((g) => !g.passed) ? EXIT.GATE_FAILED : EXIT.PASS;
});
