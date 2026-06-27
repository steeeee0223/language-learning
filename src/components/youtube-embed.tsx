type YouTubeEmbedProps = {
  videoId: string;
  title: string;
};

export function YouTubeEmbed({ videoId, title }: YouTubeEmbedProps) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new Error('YouTubeEmbed requires a valid 11-character YouTube video ID');
  }

  return (
    <div className="my-8 overflow-hidden rounded-md border bg-black shadow-sm">
      <iframe
        className="aspect-video w-full"
        src={`https://www.youtube.com/embed/${encodeURIComponent(videoId)}`}
        title={`YouTube video: ${title}`}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}
