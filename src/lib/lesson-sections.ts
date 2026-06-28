import { cefrLevels, type CefrLevel, type TargetLanguage } from '@/lib/contracts';

export const lessonSectionKeys = ['metadata', 'translation', 'vocabulary', 'grammar', 'spokenUsage'] as const;

export type LessonSection = (typeof lessonSectionKeys)[number];

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

export function orderCefrLevels(levels: readonly CefrLevel[]) {
  const selected = new Set(levels);
  return cefrLevels.filter((level) => selected.has(level));
}

export function lessonSectionHeadings(language: TargetLanguage, levels: readonly CefrLevel[]) {
  const labels = lessonSectionLabels[language];
  return [
    labels.metadata,
    labels.translation,
    ...orderCefrLevels(levels).flatMap((level) => [
      `${level} ${labels.vocabulary}`,
      `${level} ${labels.grammar}`,
    ]),
    labels.spokenUsage,
  ];
}
