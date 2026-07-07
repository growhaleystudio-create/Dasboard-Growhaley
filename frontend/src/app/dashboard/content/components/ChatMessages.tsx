import React, { useEffect, useRef } from 'react';
import { Sparkles, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {  ChatMessage  } from '../content-generator-types';

interface ChatMessagesProps {
  messages: ChatMessage[];
  typingLabel?: string | null;
}

export function ChatMessages({ messages, typingLabel }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom smoothly when messages change or typing status changes
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingLabel]);

  if (messages.length === 0 && !typingLabel) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6 voit-container py-4">
      {messages.map((message) => {
        const isUser = message.role === 'user';
        
        return (
          <div
            key={message.id}
            className={cn('flex items-start gap-3 w-full', {
              'justify-end': isUser,
            })}
          >
            {!isUser && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-alpha-primary-10 text-primary-base shadow-sm">
                <Sparkles size={18} />
              </div>
            )}
            <div
              className={cn(
                'px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap rounded-2xl shadow-[0px_1px_2px_rgba(10,13,20,0.03)] max-w-[70%]',
                isUser
                  ? 'bg-primary-base text-bg-white-0 rounded-tr-none'
                  : 'border border-stroke-soft-200 bg-bg-white-0 text-text-strong-950 rounded-tl-none'
              )}
            >
              {message.text}
            </div>
            {isUser && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stroke-soft-200 text-text-sub-600 shadow-sm">
                <User size={18} />
              </div>
            )}
          </div>
        );
      })}

      {/* Typing Indicator */}
      {typingLabel && (
        <div className="flex items-start gap-3 w-full">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-alpha-primary-10 text-primary-base shadow-sm">
            <Sparkles size={18} />
          </div>
          <div className="flex max-w-[70%] items-center gap-3 rounded-2xl rounded-tl-none border border-stroke-soft-200 bg-bg-white-0 px-4 py-3 text-sm leading-relaxed text-text-sub-600 shadow-[0px_1px_2px_rgba(10,13,20,0.03)]">
            <span className="font-medium text-[13px]">{typingLabel}</span>
            <span className="flex items-center gap-1.5" aria-label="AI sedang typing">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="size-1.5 rounded-full bg-primary-base/60 animate-bounce"
                  style={{ animationDelay: `${dot * 150}ms` }}
                />
              ))}
            </span>
          </div>
        </div>
      )}

      {/* Scroll anchor */}
      <div ref={bottomRef} className="h-px w-full" />
    </div>
  );
}
