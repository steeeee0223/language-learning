import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

describe('generating-lesson skill', () => {
  it('allows its required references to be read before forbidding unrelated commands', async () => {
    const skill = await readFile('.agents/skills/generating-lesson/SKILL.md', 'utf8');

    assert.match(skill, /read-only commands.*references/i);
    assert.doesNotMatch(skill, /Do not browse, execute commands, or edit files/);
  });

  it('requires substantive content in every teaching section', async () => {
    const contract = await readFile(
      '.agents/skills/generating-lesson/references/lesson-contract.md',
      'utf8',
    );

    assert.match(contract, /at least one vocabulary item.*requested CEFR level/i);
    assert.match(contract, /at least one grammar item.*requested CEFR level/i);
    assert.match(contract, /at least one spoken-usage item/i);
    assert.match(contract, /never copy source text as a placeholder/i);
  });
});
