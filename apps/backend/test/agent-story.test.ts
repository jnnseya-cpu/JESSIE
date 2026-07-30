import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AGENT_CODES, AGENT_REGISTRY, CONCEPT_AGENTS } from '@jessmove/shared';

/*
 * The How-it-works page says "Twelve agents, each owning one decision"
 * and renders CONCEPT_AGENTS. This suite pins that story to the real
 * runtime registry so the narrative cannot drift from the architecture.
 */

test('the public story has exactly twelve agents, numbered and unique', () => {
  assert.equal(CONCEPT_AGENTS.length, 12);
  assert.deepEqual(
    CONCEPT_AGENTS.map((a) => a.n),
    Array.from({ length: 12 }, (_, i) => i + 1),
  );
  assert.equal(new Set(CONCEPT_AGENTS.map((a) => a.name)).size, 12);
});

test('every public agent maps to at least one registered agent code', () => {
  for (const story of CONCEPT_AGENTS) {
    assert.ok(story.registryCodes.length > 0, `${story.name} maps to nothing`);
    for (const code of story.registryCodes) {
      assert.ok((AGENT_CODES as readonly string[]).includes(code), `${code} is not registered`);
      assert.ok(AGENT_REGISTRY[code], `${code} has no registry definition`);
    }
  }
});

test('each public agent owns one decision and states what it does', () => {
  for (const story of CONCEPT_AGENTS) {
    assert.ok(story.role.length > 0);
    assert.ok(story.does.length >= 3);
  }
});

test('the LENS vision agent is registered with a cost ceiling and a governance escalation', () => {
  const lens = AGENT_REGISTRY.LENS;
  assert.equal(lens.modelClass, 'frontier_llm');
  assert.ok(lens.acuCeiling > 0, 'vision calls must be metered');
  assert.equal(lens.escalatesTo, 'GOV');
});
