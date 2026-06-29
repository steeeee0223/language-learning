import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { validateLessonMdx } from '@/lib/server/lesson-validator.ts';
import { LESSON_SKILL_VERSION } from '@/lib/server/task-schema.ts';

const skillPath = '.agents/skills/generating-lesson/SKILL.md';
const contractPath = '.agents/skills/generating-lesson/references/lesson-contract.md';
const examplePath = '.agents/skills/generating-lesson/references/example-lesson.mdx';

describe('generating-lesson skill contract', () => {
  it('declares the stable skill name and lesson-only trigger description', async () => {
    const skill = await readFile(skillPath, 'utf8');
    assert.match(skill, /^---\nname: generating-lesson\ndescription: Use when /);
    assert.match(skill, /lesson MDX/i);
  });

  it('increments the task metadata version for the new lesson contract', () => {
    assert.equal(LESSON_SKILL_VERSION, '3');
  });

  it('requires the contract and canonical example to be read before generation', async () => {
    const skill = await readFile(skillPath, 'utf8');
    assert.match(skill, /Read \[the lesson contract\]\(references\/lesson-contract\.md\) fully/);
    assert.match(skill, /Read \[the canonical example lesson\]\(references\/example-lesson\.mdx\) fully/);
    assert.match(skill, /follow the contract structure exactly/i);
  });

  it('defines one vocabulary and grammar H2 section per CEFR level', async () => {
    const contract = await readFile(contractPath, 'utf8');
    assert.match(contract, /`## A1 詞彙`/);
    assert.match(contract, /`## A1 文法`/);
    assert.match(contract, /canonical CEFR order/i);
    assert.match(contract, /Do not merge levels into `CEFR 分級詞彙`, `CEFR 分級文法`/);
  });

  it('keeps the example lesson valid against the production lesson validator', async () => {
    const example = await readFile(examplePath, 'utf8');
    await validateLessonMdx(example, {
      video: { id: 'jNQXAC9IVRw' },
      learningSettings: { targetLanguage: 'zh', cefrLevels: ['B1', 'A2'] },
    });
    assert.match(example, /## A2 詞彙[\s\S]*## A2 文法[\s\S]*## B1 詞彙[\s\S]*## B1 文法/);
  });
});
