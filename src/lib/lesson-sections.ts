import type { TargetLanguage } from '@/lib/contracts';

export const lessonSectionLabels = {
  en: {
    metadata: 'Video information',
    translation: 'Sentence-by-sentence translation',
    vocabulary: 'Vocabulary by CEFR level',
    grammar: 'Grammar by CEFR level',
    spokenUsage: 'Spoken usage',
  },
  zh: {
    metadata: '影片資訊',
    translation: '逐句翻譯',
    vocabulary: 'CEFR 分級詞彙',
    grammar: 'CEFR 分級文法',
    spokenUsage: '口語用法',
  },
} as const satisfies Record<TargetLanguage, Record<string, string>>;
