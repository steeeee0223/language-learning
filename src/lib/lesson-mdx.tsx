import { getMDXComponents } from '@/components/mdx';
import { createLessonMdxOptions } from '@/lib/lesson-mdx-options';
import { MDXRemote } from 'next-mdx-remote/rsc';

type LessonMdxProps = {
  content: string;
};

export function LessonMdx({ content }: LessonMdxProps) {
  return (
    <MDXRemote
      source={content}
      components={getMDXComponents()}
      options={createLessonMdxOptions()}
    />
  );
}
