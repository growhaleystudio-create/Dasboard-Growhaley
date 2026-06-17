/**
 * conversation-formatter.ts — Formats conversation context for prompt generation
 */

import type { ContentConversationContextMessage } from '@leads-generator/shared';

/**
 * Builds the conversation context section for the LLM prompt.
 */
export function buildConversationSection(messages: ContentConversationContextMessage[] | undefined): string {
  const normalized = (messages ?? [])
    .filter((message) => message.text.trim().length > 0)
    .slice(-10)
    .map((message) => ({
      role: message.role,
      text: message.text.replace(/\s+/g, ' ').trim().slice(0, 600),
      ...(message.createdAt ? { createdAt: message.createdAt } : {}),
    }));
  if (normalized.length === 0) return '';
  return `\n[CONVERSATION CONTEXT]
Ini konteks chat terakhir dalam window dashboard yang sama. Gunakan untuk memahami preferensi user, revisi sebelumnya, gaya yang diminta, dan hal yang harus dihindari. Jangan menyalin mentah jika tidak relevan.
${JSON.stringify(normalized)}`;
}
