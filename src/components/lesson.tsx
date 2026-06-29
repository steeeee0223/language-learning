import { Fragment } from 'react';

import { YouTubeEmbed } from '@/components/youtube-embed';
import type { CefrLevel, TargetLanguage } from '@/lib/contracts';
import type { LessonContent } from '@/lib/lesson-content';
import {
  lessonGrammarItemId,
  lessonLabels,
  lessonLevelSectionId,
  lessonSectionIds,
  lessonSectionLabels,
  lessonSpokenUsageItemId,
  orderCefrLevels,
} from '@/lib/lesson-sections';

type LessonProps = {
  content: LessonContent;
};

type ExamplesProps = {
  examples: LessonContent['spokenUsage'][number]['examples'];
  language: TargetLanguage;
};

function Examples({ examples, language }: ExamplesProps) {
  const labels = lessonLabels[language];

  if (examples.length === 0) return <p>{labels.noContent}</p>;

  return (
    <table>
      <caption>{labels.examples}</caption>
      <thead>
        <tr>
          <th scope="col">{labels.source}</th>
          <th scope="col">{labels.translation}</th>
        </tr>
      </thead>
      <tbody>
        {examples.map((example, index) => (
          <tr key={`${example.source}:${example.translation}:${index}`}>
            <td>{example.source}</td>
            <td>{example.translation}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GrammarSection({
  content,
  language,
  level,
}: {
  content: LessonContent;
  language: TargetLanguage;
  level: CefrLevel;
}) {
  const labels = lessonSectionLabels[language];
  const grammarItems = content.grammars[level] ?? [];

  return (
    <section aria-labelledby={lessonLevelSectionId(level, 'grammar')}>
      <h2 id={lessonLevelSectionId(level, 'grammar')}>
        {level} {labels.grammar}
      </h2>
      {grammarItems.length === 0 ? (
        <p>{lessonLabels[language].noContent}</p>
      ) : (
        grammarItems.map((grammar, index) => (
          <article key={`${grammar.title}:${grammar.explanation}:${index}`}>
            <h3 id={lessonGrammarItemId(level, index)}>{grammar.title}</h3>
            <p>{grammar.explanation}</p>
            <Examples examples={grammar.examples} language={language} />
          </article>
        ))
      )}
    </section>
  );
}

export function Lesson({ content }: LessonProps) {
  const language = content.lesson.targetLanguage;
  const labels = lessonLabels[language];
  const sectionLabels = lessonSectionLabels[language];
  const levels = orderCefrLevels(content.lesson.cefrLevels);
  const videoUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(content.video.id)}`;

  return (
    <article>
      <h1 id="lesson-title">{content.video.translatedTitle}</h1>
      <YouTubeEmbed videoId={content.video.id} title={content.video.title} />

      <section aria-labelledby={lessonSectionIds.metadata}>
        <h2 id={lessonSectionIds.metadata}>{sectionLabels.metadata}</h2>
        <dl>
          <dt>{labels.originalTitle}</dt>
          <dd>{content.video.title}</dd>
          <dt>{labels.video}</dt>
          <dd>
            <a href={videoUrl}>{videoUrl}</a>
          </dd>
          <dt>{labels.videoId}</dt>
          <dd>{content.video.id}</dd>
          <dt>{labels.transcriptSource}</dt>
          <dd>{content.lesson.transcriptSource}</dd>
          <dt>{labels.targetLanguage}</dt>
          <dd>{content.lesson.targetLanguage}</dd>
          <dt>{labels.requestedLevels}</dt>
          <dd>{levels.join(', ')}</dd>
          <dt>{labels.focus}</dt>
          <dd>{content.lesson.focus}</dd>
        </dl>
      </section>

      <section aria-labelledby={lessonSectionIds.translation}>
        <h2 id={lessonSectionIds.translation}>{sectionLabels.translation}</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">{labels.time}</th>
              <th scope="col">{labels.source}</th>
              <th scope="col">{labels.translation}</th>
            </tr>
          </thead>
          <tbody>
            {content.transcripts.map((transcript, index) => (
              <tr
                key={`${transcript.time}:${transcript.source}:${transcript.translation}:${index}`}
              >
                <td>{transcript.time}</td>
                <td>{transcript.source}</td>
                <td>{transcript.translation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {levels.map((level) => {
        const vocabulary = content.vocabs[level] ?? [];

        return (
          <Fragment key={level}>
            <section aria-labelledby={lessonLevelSectionId(level, 'vocabulary')}>
              <h2 id={lessonLevelSectionId(level, 'vocabulary')}>
                {level} {sectionLabels.vocabulary}
              </h2>
              {vocabulary.length === 0 ? (
                <p>{labels.noContent}</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{labels.source}</th>
                      <th scope="col">{labels.translation}</th>
                      <th scope="col">{labels.usage}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vocabulary.map((item, index) => (
                      <tr key={`${item.source}:${item.translation}:${item.usage}:${index}`}>
                        <td>{item.source}</td>
                        <td>{item.translation}</td>
                        <td>{item.usage}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <GrammarSection content={content} language={language} level={level} />
          </Fragment>
        );
      })}

      <section aria-labelledby={lessonSectionIds.spokenUsage}>
        <h2 id={lessonSectionIds.spokenUsage}>{sectionLabels.spokenUsage}</h2>
        {content.spokenUsage.length === 0 ? (
          <p>{labels.noContent}</p>
        ) : (
          content.spokenUsage.map((usage, index) => (
            <article key={`${usage.title}:${usage.explanation}:${index}`}>
              <h3 id={lessonSpokenUsageItemId(index)}>{usage.title}</h3>
              <p>{usage.explanation}</p>
              <Examples examples={usage.examples} language={language} />
            </article>
          ))
        )}
      </section>
    </article>
  );
}
