import type { TOCItemType } from 'fumadocs-core/toc';

import { cefrLevels, type CefrLevel, type TargetLanguage } from '@/lib/schemas/contracts';
import type { LessonContent } from '@/lib/lesson-content';

type LessonSection = 'metadata'|
  'translation'|
  'vocabulary'|
  'grammar'|
  'spokenUsage'

export const lessonSectionLabels = {
  en: {
    metadata: 'Lesson information',
    translation: 'Sentence-by-sentence translation',
    vocabulary: 'Vocabulary',
    grammar: 'Grammar',
    spokenUsage: 'Spoken usage',
  },
  zh: {
    metadata: '課程資訊',
    translation: '逐句翻譯',
    vocabulary: '詞彙',
    grammar: '文法',
    spokenUsage: '口語用法',
  },
} as const satisfies Record<TargetLanguage, Record<LessonSection, string>>;

export const lessonLabels = {
  en: {
    originalTitle: 'Original title',
    video: 'Video',
    videoId: 'Video ID',
    transcriptSource: 'Transcript source',
    targetLanguage: 'Target language',
    requestedLevels: 'Requested CEFR levels',
    focus: 'Focus',
    time: 'Time',
    source: 'Source',
    translation: 'Translation',
    usage: 'Usage',
    examples: 'Examples',
    untitled: 'Untitled lesson',
    noVideo: 'No video available.',
    noContent: 'No content available.',
  },
  zh: {
    originalTitle: '原始標題',
    video: '影片',
    videoId: '影片 ID',
    transcriptSource: '逐字稿來源',
    targetLanguage: '目標語言',
    requestedLevels: '指定的 CEFR 等級',
    focus: '學習重點',
    time: '時間',
    source: '原文',
    translation: '翻譯',
    usage: '用法',
    examples: '例句',
    untitled: '未命名課程',
    noVideo: '目前沒有影片。',
    noContent: '目前沒有內容。',
  },
} as const satisfies Record<TargetLanguage, Record<string, string>>;

export const lessonSectionIds = {
  metadata: 'lesson-information',
  translation: 'translation',
  spokenUsage: 'spoken-usage',
} as const;

export function orderCefrLevels(levels: readonly CefrLevel[]) {
  const selected = new Set(levels);
  return cefrLevels.filter((level) => selected.has(level));
}

export function lessonLevelSectionId(
  level: CefrLevel,
  section: 'vocabulary' | 'grammar',
) {
  return `${level.toLowerCase()}-${section}`;
}

export function lessonGrammarItemId(level: CefrLevel, index: number) {
  return `${level.toLowerCase()}-grammar-${index + 1}`;
}

export function lessonSpokenUsageItemId(index: number) {
  return `spoken-usage-${index + 1}`;
}

export function createLessonToc(content: LessonContent): TOCItemType[] {
  const labels = lessonSectionLabels[content.lesson.targetLanguage];
  const toc: TOCItemType[] = [
    { title: labels.metadata, url: `#${lessonSectionIds.metadata}`, depth: 2 },
    { title: labels.translation, url: `#${lessonSectionIds.translation}`, depth: 2 },
  ];

  for (const level of orderCefrLevels(content.lesson.cefrLevels)) {
    toc.push({
      title: `${level} ${labels.vocabulary}`,
      url: `#${lessonLevelSectionId(level, 'vocabulary')}`,
      depth: 2,
    });
    toc.push({
      title: `${level} ${labels.grammar}`,
      url: `#${lessonLevelSectionId(level, 'grammar')}`,
      depth: 2,
    });

    for (const [index, grammar] of (content.grammars[level] ?? []).entries()) {
      toc.push({
        title: grammar.title,
        url: `#${lessonGrammarItemId(level, index)}`,
        depth: 3,
      });
    }
  }

  toc.push({
    title: labels.spokenUsage,
    url: `#${lessonSectionIds.spokenUsage}`,
    depth: 2,
  });

  for (const [index, usage] of content.spokenUsage.entries()) {
    toc.push({
      title: usage.title,
      url: `#${lessonSpokenUsageItemId(index)}`,
      depth: 3,
    });
  }

  return toc;
}
