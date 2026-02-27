import React, { useEffect, useRef } from 'react';
import { X, Volume2, BookOpen } from 'lucide-react';

interface WordTooltipProps {
  word: string;
  phonetic: string;
  partOfSpeech: string;
  translation: string;
  example?: string;
  x: number;
  y: number;
  onClose: () => void;
}

export function WordTooltip({ word, phonetic, partOfSpeech, translation, example, x, y, onClose }: WordTooltipProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 100);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Calculate position to keep tooltip in viewport
  const tooltipWidth = 280;
  const tooltipHeight = 140;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = x - tooltipWidth / 2;
  let top = y - tooltipHeight - 12;

  // Keep within viewport
  if (left < 8) left = 8;
  if (left + tooltipWidth > viewportWidth - 8) left = viewportWidth - tooltipWidth - 8;
  if (top < 8) top = y + 24; // Show below if not enough space above

  const arrowLeft = x - left;
  const showArrowAbove = top < y;

  return (
    <div
      ref={ref}
      className="fixed z-50 pointer-events-auto"
      style={{ left, top, width: tooltipWidth }}
    >
      {/* Tooltip card */}
      <div
        className="rounded-xl shadow-2xl overflow-hidden border border-white/20"
        style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* Header */}
        <div className="px-4 pt-3 pb-2 border-b border-white/10 flex items-start justify-between gap-2">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-white font-semibold" style={{ fontSize: '15px' }}>{word}</span>
            {phonetic && (
              <span className="text-blue-300" style={{ fontSize: '12px' }}>{phonetic}</span>
            )}
            {partOfSpeech && (
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(99,102,241,0.3)', color: '#a5b4fc', fontSize: '11px' }}
              >
                {partOfSpeech}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              className="p-1 rounded text-slate-400 hover:text-blue-300 transition-colors"
              title="朗读"
              onClick={(e) => {
                e.stopPropagation();
                if ('speechSynthesis' in window) {
                  const utterance = new SpeechSynthesisUtterance(word);
                  utterance.lang = 'en-US';
                  window.speechSynthesis.speak(utterance);
                }
              }}
            >
              <Volume2 size={13} />
            </button>
            <button
              className="p-1 rounded text-slate-400 hover:text-red-400 transition-colors"
              onClick={onClose}
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Translation */}
        <div className="px-4 py-2.5">
          <p className="text-white" style={{ fontSize: '14px' }}>{translation}</p>
          {example && (
            <div className="mt-2 flex items-start gap-1.5">
              <BookOpen size={11} className="text-slate-500 mt-0.5 shrink-0" />
              <p className="text-slate-400 italic" style={{ fontSize: '11px' }}>{example}</p>
            </div>
          )}
        </div>
      </div>

      {/* Arrow */}
      {showArrowAbove ? null : (
        <div
          className="absolute w-0 h-0"
          style={{
            bottom: -6,
            left: Math.max(12, Math.min(arrowLeft - 6, tooltipWidth - 24)),
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '6px solid #0f172a',
          }}
        />
      )}
    </div>
  );
}
