import { useEffect, useRef } from 'react';
import type { LyricsLine } from '@/types';

interface SynchronizedLyricsProps {
  lyrics: LyricsLine[];
  currentTime: number;
  onSeek?: (time: number) => void;
}

const SynchronizedLyrics = ({ lyrics, currentTime, onSeek }: SynchronizedLyricsProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  const activeIndex = lyrics.findIndex((line, i) => {
    const next = lyrics[i + 1];
    return currentTime >= line.time_seconds && (!next || currentTime < next.time_seconds);
  });

  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      const container = containerRef.current;
      const element = activeRef.current;
      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const offset = elementRect.top - containerRect.top - containerRect.height / 2 + elementRect.height / 2;
      container.scrollTo({
        top: container.scrollTop + offset,
        behavior: 'smooth',
      });
    }
  }, [activeIndex]);

  if (!lyrics || lyrics.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-gray-500">No lyrics available</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex h-full flex-col items-center overflow-y-auto py-8"
    >
      <div className="w-full max-w-lg space-y-4 px-4">
        {lyrics.map((line, index) => (
          <div
            key={index}
            ref={index === activeIndex ? activeRef : null}
            onClick={() => onSeek?.(line.time_seconds)}
            className={`cursor-pointer rounded-lg px-4 py-3 text-center text-2xl font-bold transition-all duration-300 ${
              index === activeIndex
                ? 'scale-105 text-white'
                : index < activeIndex
                ? 'text-gray-600'
                : 'text-gray-500 hover:text-gray-400'
            }`}
          >
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SynchronizedLyrics;
