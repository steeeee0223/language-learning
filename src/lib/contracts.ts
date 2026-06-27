export const cefrLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export const targetLanguages = ['zh', 'en'] as const;

export type CefrLevel = (typeof cefrLevels)[number];
export type TargetLanguage = (typeof targetLanguages)[number];

export type TranscriptSegment = {
  text: string;
  start: number;
  duration: number;
};

export type VideoMetadata = {
  url: string;
  id: string;
  title: string;
};

export type LearningSettings = {
  targetLanguage: TargetLanguage;
  cefrLevels: CefrLevel[];
};

export type NormalizedTranscript = {
  source: 'youtube-transcript.io';
  segments: TranscriptSegment[];
};

export type TaskFileInput = {
  video: VideoMetadata;
  transcript: NormalizedTranscript;
  learningSettings: LearningSettings;
};
