import type { AspectRatio } from '@leads-generator/shared';

export function canvasSize(aspectRatio: AspectRatio): { width: number; height: number } {
  switch (aspectRatio) {
    case '1:1': return { width: 1080, height: 1080 };
    case '4:5': return { width: 1080, height: 1350 };
    case '9:16': return { width: 1080, height: 1920 };
  }
}
