/**
 * slide-utils.ts
 * 
 * Utility functions for slide manipulation and metadata extraction
 */

import type {
  BlockType,
  FailureReason,
  SduiComponent,
  SduiSlide,
  SduiSlideAudit,
} from '@leads-generator/shared';
import type { SduiPlannerError } from '../../sdui-planner/index.js';

/**
 * SlideUtils - Static utility class for slide operations
 */
export class SlideUtils {
  /**
   * Extract all components from a slide's nested groups
   */
  static slideComponents(slide: SduiSlide): SduiComponent[] {
    return (['top_meta', 'core_content', 'action_footer'] as const)
      .flatMap((group) => slide.nested_groups[group] ?? []);
  }

  /**
   * Returns a copy of slides with transient base64 data-URI images removed.
   * 
   * Generated PNGs are uploaded to object storage; the in-memory slides keep
   * base64 for the renderer, but persisting megabytes of base64 into the DB
   * serves no reader and only bloats the row. Image provenance is preserved
   * via `image_status`.
   */
  static slidesForPersist(slides: SduiSlide[]): SduiSlide[] {
    const isInlineImage = (c: SduiComponent): boolean =>
      typeof c.imageUrl === 'string' && c.imageUrl.startsWith('data:');
    
    const stripGroup = (comps: SduiComponent[]): SduiComponent[] =>
      comps.map((c): SduiComponent => {
        if (!isInlineImage(c)) return c;
        const copy: SduiComponent = { ...c };
        delete copy.imageUrl;
        return copy;
      });
    
    return slides.map((slide): SduiSlide => {
      const g = slide.nested_groups;
      const hasInlineImage = (['top_meta', 'core_content', 'action_footer'] as const).some(
        (group) => (g[group] ?? []).some(isInlineImage),
      );
      if (!hasInlineImage) return slide;
      
      const next: SduiSlide['nested_groups'] = {};
      if (g.top_meta) next.top_meta = stripGroup(g.top_meta);
      if (g.core_content) next.core_content = stripGroup(g.core_content);
      if (g.action_footer) next.action_footer = stripGroup(g.action_footer);
      return { ...slide, nested_groups: next };
    });
  }

  /**
   * Create audit metadata for slides
   */
  static slideAudit(slides: SduiSlide[]): SduiSlideAudit[] {
    const hasImagePlaceholder = (slide: SduiSlide): boolean =>
      SlideUtils.slideComponents(slide).some((c) => c.type === 'image_placeholder');
    
    return slides.map((slide) => ({
      slide_number: slide.slide_number,
      ...(slide.layout_variant_id ? { layout_variant_id: slide.layout_variant_id } : {}),
      ...(slide.layout_family ? { layout_family: slide.layout_family } : {}),
      image_requirement: slide.image_requirement ?? (hasImagePlaceholder(slide) ? 'optional' : 'none'),
      layout_source: slide.layout_source ?? 'ai_selected',
      image_status: slide.image_status ?? (hasImagePlaceholder(slide) ? 'not_needed' : 'not_needed'),
    }));
  }

  /**
   * Extract block composition from a slide for metadata
   */
  static blockComposition(slide: SduiSlide): BlockType[] {
    const map: Record<string, BlockType | undefined> = {
      header: 'heading',
      body: 'body',
      checklist: 'bullet',
      quote: 'quote',
      button_cta: 'cta',
      image_placeholder: 'image',
    };
    
    const out: BlockType[] = [];
    for (const group of ['top_meta', 'core_content', 'action_footer'] as const) {
      for (const c of slide.nested_groups[group] ?? []) {
        const b = map[c.type];
        if (b) out.push(b);
      }
    }
    return out.length > 0 ? out : ['heading'];
  }

  /**
   * Map planner error kinds to failure reasons
   */
  static mapPlannerErr(err: SduiPlannerError): FailureReason {
    switch (err.kind) {
      case 'non_json': return 'malformed_output';
      case 'validation_error': return 'malformed_output';
      case 'budget_exceeded': return 'budget_exceeded';
      case 'endpoint_mismatch': return 'endpoint_mismatch';
      case 'insecure_transport': return 'insecure_transport';
      case 'privacy_violation': return 'privacy_violation';
      case 'timeout': return 'timeout';
      case 'provider_error': return 'provider_error';
    }
  }
}
