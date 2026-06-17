/**
 * content-sanitizer.ts
 * 
 * Content sanitization utilities for SDUI carousel worker.
 * Handles content tags, conversation context, and slide tag application.
 */

import type {
  ContentConversationContextMessage,
  SduiSlide,
} from '@leads-generator/shared';

/**
 * Clean and normalize a single content tag
 * 
 * Rules:
 * - Remove special characters (|, /, #)
 * - Keep only letters, numbers, spaces, hyphens
 * - Normalize whitespace
 * - Limit to 3 words
 * - Max 24 characters
 * - Convert to uppercase
 * 
 * @example
 * cleanContentTag("Product / Feature #1") => "PRODUCT FEATURE 1"
 * cleanContentTag("very long tag with many words") => "VERY LONG TAG"
 */
export function cleanContentTag(tag: string): string {
  return tag
    .replace(/[|/#]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(' ')
    .slice(0, 24)
    .toUpperCase();
}

/**
 * Sanitize array of content tags from user input
 * 
 * Features:
 * - Validates input is array
 * - Filters only string values
 * - Cleans each tag
 * - Removes duplicates
 * - Limits to 10 tags max
 * 
 * @param raw - Unknown user input to sanitize
 * @returns Array of cleaned, unique tags (max 10)
 */
export function sanitizeContentTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw
    .filter((tag): tag is string => typeof tag === 'string')
    .map(cleanContentTag)
    .filter(Boolean))]
    .slice(0, 10);
}

/**
 * Sanitize conversation context messages from user input
 * 
 * Features:
 * - Validates structure (role, text)
 * - Only accepts 'user' or 'assistant' roles
 * - Normalizes whitespace
 * - Limits individual messages to 800 chars
 * - Limits total context to 5000 chars
 * - Keeps last 10 messages max
 * 
 * @param raw - Unknown user input to sanitize
 * @returns Array of validated conversation messages
 */
export function sanitizeConversationContext(raw: unknown): ContentConversationContextMessage[] {
  if (!Array.isArray(raw)) return [];
  let total = 0;
  const out: ContentConversationContextMessage[] = [];
  
  for (const item of raw.slice(-10)) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    
    // Validate role
    if (record.role !== 'user' && record.role !== 'assistant') continue;
    
    // Validate and sanitize text
    if (typeof record.text !== 'string') continue;
    const text = record.text.replace(/\s+/g, ' ').trim().slice(0, 800);
    if (!text) continue;
    
    // Check total length budget
    total += text.length;
    if (total > 5000) break;
    
    // Build message
    const message: ContentConversationContextMessage = { 
      role: record.role, 
      text 
    };
    
    // Optional createdAt field
    if (typeof record.createdAt === 'string') {
      message.createdAt = record.createdAt.slice(0, 64);
    }
    
    out.push(message);
  }
  
  return out;
}

/**
 * Apply content tags to slides in a round-robin fashion
 * 
 * Each slide gets a tag component added to its top_meta group.
 * Tags cycle through the array if there are more slides than tags.
 * 
 * @param slides - Array of slides to tag
 * @param tags - Array of cleaned content tags
 * @returns Slides with tag components added
 * 
 * @example
 * applyContentTags([slide1, slide2, slide3], ["TAG A", "TAG B"])
 * // slide1 gets "TAG A"
 * // slide2 gets "TAG B"  
 * // slide3 gets "TAG A" (cycles back)
 */
export function applyContentTags(slides: SduiSlide[], tags: string[]): SduiSlide[] {
  if (tags.length === 0) return slides;
  
  return slides.map((slide, index) => {
    const tag = tags[index % tags.length]!;
    
    // Remove any existing tag components
    const topMeta = (slide.nested_groups.top_meta ?? [])
      .filter((component) => component.type !== 'tag');
    
    return {
      ...slide,
      nested_groups: {
        ...slide.nested_groups,
        top_meta: [
          { type: 'tag', text: tag, textTransform: 'uppercase' },
          ...topMeta
        ],
      },
    };
  });
}

/**
 * ContentSanitizer - Static utility class for content sanitization
 */
export const ContentSanitizer = {
  cleanContentTag,
  sanitizeContentTags,
  sanitizeConversationContext,
  applyContentTags,
} as const;
