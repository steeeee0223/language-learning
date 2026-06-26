import { LessonsClient } from '@/components/lessons-client';

type LessonDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function LessonDetailPage(props: LessonDetailPageProps) {
  const params = await props.params;
  return <LessonsClient slug={params.slug} />;
}
