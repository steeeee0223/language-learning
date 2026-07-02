import Link from 'next/link';
import { ArrowRight, FileText, ListChecks, Play } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 py-12 md:py-20">
      <section className="grid flex-1 items-center gap-10 md:grid-cols-[1.05fr_0.95fr]">
        <div>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-normal text-zinc-950 md:text-6xl">
            Turn short YouTube videos into local language-learning notes.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-zinc-600 md:text-lg">
            Paste a video link, fetch the original transcript, choose your learning goals, then hand a local task file to Codex CLI for lesson generation.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/get-started"
              className="group inline-flex h-11 items-center gap-2 rounded-md bg-zinc-950 px-5 text-sm font-medium text-white transition hover:bg-zinc-800"
            >
              Get Started
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1.5" aria-hidden />
            </Link>
            <Link
              href="/tasks"
              className="inline-flex h-11 items-center gap-2 rounded-md border border-zinc-200 px-5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50"
            >
              View Stories
              <FileText className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="aspect-video rounded-md bg-zinc-950 p-4 text-white">
            <div className="flex h-full flex-col justify-between">
              <div className="flex items-center gap-2 text-sm text-zinc-300">
                <Play className="size-4" aria-hidden />
                Five-minute source video
              </div>
              <div>
                <div className="h-2 w-2/3 rounded-full bg-white" />
                <div className="mt-3 h-2 w-1/2 rounded-full bg-zinc-500" />
                <div className="mt-3 h-2 w-5/6 rounded-full bg-zinc-700" />
              </div>
            </div>
          </div>
          <div className="mt-5 grid gap-3 text-sm text-zinc-700">
            {['Fetch transcript and title', 'Write a local JSON task', 'Render generated markdown lessons'].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <ListChecks className="size-4 text-emerald-600" aria-hidden />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
