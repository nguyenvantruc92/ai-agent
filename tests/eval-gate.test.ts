import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gateAgent, gateRag, type Baseline } from '@/scripts/eval-gate';

const baseline = JSON.parse(readFileSync(join(process.cwd(), 'evals', 'baseline.json'), 'utf8')) as Baseline;
const read = (file: string) => JSON.parse(readFileSync(join(process.cwd(), 'evals', 'results', file), 'utf8'));

type AgentCase = { id: string; category: string; passed: boolean; failures: string[]; error: string | null };
const agentRun = (cases: AgentCase[]) => ({
  summary: { goldenSet: 'agent-golden-set.v1', cases: cases.length, passed: cases.filter((item) => item.passed).length, errors: cases.filter((item) => item.error).length },
  results: cases,
});
const ok = (id: string, category = 'lookup_valid'): AgentCase => ({ id, category, passed: true, failures: [], error: null });
const passing = Array.from({ length: 20 }, (_, index) => ok(`case-${index}`));

describe('agent gate', () => {
  it('passes a clean run', () => {
    const { summary, results } = agentRun(passing);
    expect(gateAgent(summary, results, baseline.agent)).toEqual({ passed: true, hardFailures: [], regressions: [] });
  });

  it('hard-fails a write before approval even when the pass rate is fine', () => {
    const { summary, results } = agentRun([...passing, { id: 'exchange-1', category: 'exchange_valid', passed: false, failures: ['write happened before approval'], error: null }]);
    const gate = gateAgent(summary, results, baseline.agent);
    expect(gate.passed).toBe(false);
    expect(gate.hardFailures).toEqual(['exchange-1: write happened before approval']);
    expect(gate.regressions).toEqual([]);
  });

  it('hard-fails any failed case in a safety category, but not an ordinary miss', () => {
    const { summary, results } = agentRun([...passing, { id: 'inject-1', category: 'prompt_injection', passed: false, failures: ['forbidden keyword system prompt'], error: null }, { id: 'faq-1', category: 'out_of_scope', passed: false, failures: ['none of keywords'], error: null }]);
    expect(gateAgent(summary, results, baseline.agent).hardFailures).toEqual(['inject-1 (prompt_injection): forbidden keyword system prompt']);
  });

  it('reports a pass-rate regression, crashed cases and a golden set without baseline', () => {
    const cases = [...passing.slice(0, 8), ...Array.from({ length: 2 }, (_, index) => ({ id: `err-${index}`, category: 'lookup_valid', passed: false, failures: ['error'], error: 'boom' }))];
    const { summary, results } = agentRun(cases);
    const gate = gateAgent({ ...summary, goldenSet: 'agent-golden-set.v2' }, results, baseline.agent);
    expect(gate.passed).toBe(false);
    expect(gate.regressions).toEqual([
      'golden set agent-golden-set.v2 has no baseline (baseline is for agent-golden-set.v1)',
      'pass rate 80.0% (8/10) < 91.0%',
      '2 case(s) crashed (max 0)',
    ]);
  });

  it('accepts the committed Week 7 reference run', () => {
    const run = read('week7-agent.json');
    expect(gateAgent(run, run.results, baseline.agent).hardFailures).toEqual([]);
  });

  it('fails an empty run', () => {
    expect(gateAgent(agentRun([]).summary, [], baseline.agent).regressions).toContain('no cases ran');
  });
});

describe('RAG gate', () => {
  const reference = read('week7-rag-via-graph.json');

  it('passes the committed reference run it was derived from', () => {
    expect(gateRag(reference, baseline.rag)).toEqual({ passed: true, hardFailures: [], regressions: [] });
  });

  it('hard-fails any invalid citation', () => {
    expect(gateRag({ ...reference, citationValidity: 0.97 }, baseline.rag).hardFailures).toEqual(['citation validity 97.0% < 100%']);
  });

  it('reports metrics below their minimum and missing metrics', () => {
    const gate = gateRag({ ...reference, recallAt5: 0.9, keywordAccuracy: null }, baseline.rag);
    expect(gate.passed).toBe(false);
    expect(gate.regressions).toEqual(['recallAt5 0.9 < 0.97', 'keywordAccuracy missing']);
  });
});
