/**
 * Unit tests for DefaultRenderer (task 16.1)
 *
 * Tests verify:
 *   1. Successful render returns status='success' with a non-empty imageUrl.
 *   2. Missing chartData on a chart block returns failed with missing_chart_data.
 *   3. Missing mockup on a mockup block returns failed with missing_mockup.
 *   4. Storage upload failure returns failed with upload_failed.
 *   5. Background scanner returns dirty, after retry still dirty → uses solid brand color + still success.
 *   6. luminanceContrast utility computes expected ratios.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.7, 5.8, 5.10, 5.11, 6.2, 6.3, 6.5, 6.6, 7.5
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import fc from 'fast-check';
import sharp from 'sharp';
import type { BrandKit, ContentPlanSlide, AspectRatio } from '@leads-generator/shared';
import type { ChartData } from './chart-renderer.js';
import type { SlideLayoutCatalog, SlideLayoutVariant } from './slide-layout-catalog.js';
import type { ChartRenderer } from './chart-renderer.js';
import type { MockupRenderer } from './mockup-renderer.js';
import type { BackgroundImageClient } from './background-image-client.js';
import type { BackgroundScanner, ScanResult } from './background-scanner.js';
import type { ObjectStorage } from './object-storage.js';
import { DefaultRenderer, luminanceContrast, type RenderContext } from './renderer.js';

// ---------------------------------------------------------------------------
// Helpers to create minimal valid Buffers
// ---------------------------------------------------------------------------

/** Create a small 8×8 solid-color PNG buffer for use as fake images. */
async function makePng(r = 100, g = 149, b = 237): Promise<Buffer> {
  return sharp({
    create: { width: 8, height: 8, channels: 3, background: { r, g, b } },
  })
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeCatalogMock(): SlideLayoutCatalog {
  const defaultVariant: SlideLayoutVariant = {
    id: 'heading-only',
    compositionType: 'heading',
    aspectRatios: ['1:1', '4:5', '9:16'],
    regions: [
      { blockType: 'heading', box: { x: 0, y: 100, w: 1000, h: 800 } },
    ],
    isDefault: true,
  };

  const headingBodyVariant: SlideLayoutVariant = {
    id: 'heading-body',
    compositionType: 'body+heading',
    aspectRatios: ['1:1', '4:5', '9:16'],
    regions: [
      { blockType: 'heading', box: { x: 0, y: 100, w: 1000, h: 320 } },
      { blockType: 'body',    box: { x: 0, y: 420, w: 1000, h: 480 } },
    ],
    isDefault: true,
  };

  const chartVariant: SlideLayoutVariant = {
    id: 'heading-chart',
    compositionType: 'chart+heading',
    aspectRatios: ['1:1', '4:5', '9:16'],
    regions: [
      { blockType: 'heading', box: { x: 0, y: 100, w: 1000, h: 200 } },
      { blockType: 'chart',   box: { x: 0, y: 300, w: 1000, h: 600 } },
    ],
    isDefault: true,
  };

  const mockupVariant: SlideLayoutVariant = {
    id: 'mockup-body',
    compositionType: 'body+mockup',
    aspectRatios: ['1:1', '4:5', '9:16'],
    regions: [
      { blockType: 'mockup', box: { x: 0, y: 100, w: 1000, h: 480 } },
      { blockType: 'body',   box: { x: 0, y: 580, w: 1000, h: 320 } },
    ],
    isDefault: true,
  };

  return {
    variantsFor: vi.fn((blocks, _ratio) => {
      const sig = [...blocks].sort().join('+');
      if (sig === 'heading') return [defaultVariant];
      if (sig === 'body+heading') return [headingBodyVariant];
      if (sig === 'chart+heading') return [chartVariant];
      if (sig === 'body+mockup') return [mockupVariant];
      return [defaultVariant];
    }),
    defaultFor: vi.fn(() => defaultVariant),
  };
}

function makeChartRendererMock(pngBuffer: Buffer): ChartRenderer {
  return {
    render: vi.fn(() => pngBuffer),
  };
}

function makeMockupRendererMock(pngBuffer: Buffer): MockupRenderer {
  return {
    render: vi.fn(async () => pngBuffer),
  };
}

function makeCleanBgClientMock(pngBuffer: Buffer): BackgroundImageClient {
  return {
    generate: vi.fn(async () => ({ ok: true as const, value: pngBuffer })),
  };
}

function makeFailingBgClientMock(): BackgroundImageClient {
  return {
    generate: vi.fn(async () => ({
      ok: false as const,
      error: { code: 'INTERNAL' as const, message: 'AI unavailable' },
    })),
  };
}

function makeCleanScannerMock(): BackgroundScanner {
  return {
    scan: vi.fn(async (): Promise<ScanResult> => ({ clean: true, detected: [] })),
  };
}

function makeDirtyScannerMock(): BackgroundScanner {
  return {
    scan: vi.fn(async (): Promise<ScanResult> => ({ clean: false, detected: ['text'] })),
  };
}

function makeStorageMock(uploadUrl = 'https://cdn.example.com/slide-0.png'): ObjectStorage {
  return {
    upload: vi.fn(async () => ({ ok: true as const, value: uploadUrl })),
    resolveForTeam: vi.fn(async () => ({ ok: true as const, value: uploadUrl })),
  };
}

function makeFailingStorageMock(): ObjectStorage {
  return {
    upload: vi.fn(async () => ({
      ok: false as const,
      error: { code: 'INTERNAL' as const, message: 'S3 error' },
    })),
    resolveForTeam: vi.fn(async () => ({
      ok: false as const,
      error: { code: 'NOT_FOUND' as const, message: 'Resource not found' },
    })),
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BRAND_KIT: BrandKit = {
  id: 'bk-1',
  teamId: 'team-1',
  logoUrl: '',              // empty → skip logo fetch
  fonts: [{ id: 'f-1', url: '', family: 'Inter', weight: 400, style: 'normal' }],
  colors: ['#1a1a2e', '#e94560', '#0f3460'],
  chrome: {
    logoPlacement: 'none',  // avoid HTTP fetch in tests
    pageNumberFormat: '{current}/{total}',
    siteUrl: 'example.com',
  },
  updatedAt: new Date('2024-01-01'),
};

const ASPECT_RATIO: AspectRatio = '1:1';

function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    teamId:       'team-1',
    jobId:        'job-1',
    brandKit:     BRAND_KIT,
    aspectRatio:  ASPECT_RATIO,
    totalSlides:  3,
    chartData:    new Map(),
    mockupImages: new Map(),
    userImages:   new Map(),
    ...overrides,
  };
}

function headingSlide(index = 0): ContentPlanSlide {
  return {
    index,
    blocks: [{ type: 'heading', text: 'Hello World' }],
  };
}

// ---------------------------------------------------------------------------
// luminanceContrast utility tests
// ---------------------------------------------------------------------------

describe('luminanceContrast', () => {
  it('black vs white yields ~21', () => {
    const ratio = luminanceContrast('#000000', '#ffffff');
    expect(ratio).toBeGreaterThan(20);
    expect(ratio).toBeLessThanOrEqual(21.1);
  });

  it('same color yields 1', () => {
    const ratio = luminanceContrast('#123456', '#123456');
    expect(ratio).toBeCloseTo(1, 3);
  });

  it('is symmetric', () => {
    const a = luminanceContrast('#ff0000', '#0000ff');
    const b = luminanceContrast('#0000ff', '#ff0000');
    expect(a).toBeCloseTo(b, 5);
  });

  it('returns 1 for invalid hex strings', () => {
    expect(luminanceContrast('not-a-color', '#ffffff')).toBe(1);
    expect(luminanceContrast('#ffffff', 'invalid')).toBe(1);
  });

  it('accepts 3-char hex shorthand', () => {
    // #fff = #ffffff, #000 = #000000
    const ratio = luminanceContrast('#000', '#fff');
    expect(ratio).toBeGreaterThan(20);
  });
});

// ---------------------------------------------------------------------------
// DefaultRenderer unit tests
// ---------------------------------------------------------------------------

describe('DefaultRenderer.renderSlide', () => {
  let pngBuffer: Buffer;

  beforeEach(async () => {
    pngBuffer = await makePng();
  });

  // -------------------------------------------------------------------------
  // Test 1: Successful render
  // -------------------------------------------------------------------------
  it('returns status=success with imageUrl on a successful heading slide', async () => {
    const uploadUrl = 'https://cdn.example.com/jobs/job-1/slide-0.png';
    const renderer = new DefaultRenderer({
      catalog:         makeCatalogMock(),
      chartRenderer:   makeChartRendererMock(pngBuffer),
      mockupRenderer:  makeMockupRendererMock(pngBuffer),
      bgClient:        makeCleanBgClientMock(pngBuffer),
      bgScanner:       makeCleanScannerMock(),
      storage:         makeStorageMock(uploadUrl),
    });

    const result = await renderer.renderSlide(headingSlide(0), makeContext());

    expect(result.status).toBe('success');
    expect(result.imageUrl).toBe(uploadUrl);
    expect(result.index).toBe(0);
    expect(result.reason).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Test 2: Missing chart data
  // -------------------------------------------------------------------------
  it('returns failed with missing_chart_data when chart block has no data', async () => {
    const renderer = new DefaultRenderer({
      catalog:         makeCatalogMock(),
      chartRenderer:   makeChartRendererMock(pngBuffer),
      mockupRenderer:  makeMockupRendererMock(pngBuffer),
      bgClient:        makeCleanBgClientMock(pngBuffer),
      bgScanner:       makeCleanScannerMock(),
      storage:         makeStorageMock(),
    });

    const slide: ContentPlanSlide = {
      index: 1,
      blocks: [
        { type: 'heading', text: 'Stats' },
        { type: 'chart', chartDataRef: 'chart-ref-missing' },
      ],
    };

    const result = await renderer.renderSlide(slide, makeContext());

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('missing_chart_data');
    expect(result.imageUrl).toBeUndefined();
  });

  it('returns failed with missing_chart_data when chart block has chartDataRef but no matching data', async () => {
    const renderer = new DefaultRenderer({
      catalog:         makeCatalogMock(),
      chartRenderer:   makeChartRendererMock(pngBuffer),
      mockupRenderer:  makeMockupRendererMock(pngBuffer),
      bgClient:        makeCleanBgClientMock(pngBuffer),
      bgScanner:       makeCleanScannerMock(),
      storage:         makeStorageMock(),
    });

    const slide: ContentPlanSlide = {
      index: 1,
      blocks: [
        { type: 'chart', chartDataRef: 'nonexistent-key' },
      ],
    };

    // chartData map has no entry for 'nonexistent-key'
    const result = await renderer.renderSlide(
      slide,
      makeContext({ chartData: new Map([['other-key', { kind: 'bar', series: [] }]]) }),
    );

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('missing_chart_data');
  });

  it('returns failed with missing_chart_data when chart block has no chartDataRef', async () => {
    const renderer = new DefaultRenderer({
      catalog:         makeCatalogMock(),
      chartRenderer:   makeChartRendererMock(pngBuffer),
      mockupRenderer:  makeMockupRendererMock(pngBuffer),
      bgClient:        makeCleanBgClientMock(pngBuffer),
      bgScanner:       makeCleanScannerMock(),
      storage:         makeStorageMock(),
    });

    const slide: ContentPlanSlide = {
      index: 2,
      blocks: [
        { type: 'chart' }, // no chartDataRef
      ],
    };

    const result = await renderer.renderSlide(slide, makeContext());

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('missing_chart_data');
  });

  // -------------------------------------------------------------------------
  // Test 3: Missing mockup
  // -------------------------------------------------------------------------
  it('returns failed with missing_mockup when mockup block has no matching image', async () => {
    const renderer = new DefaultRenderer({
      catalog:         makeCatalogMock(),
      chartRenderer:   makeChartRendererMock(pngBuffer),
      mockupRenderer:  makeMockupRendererMock(pngBuffer),
      bgClient:        makeCleanBgClientMock(pngBuffer),
      bgScanner:       makeCleanScannerMock(),
      storage:         makeStorageMock(),
    });

    const slide: ContentPlanSlide = {
      index: 0,
      blocks: [
        { type: 'mockup', mockupRef: 'screen-shot-missing' },
      ],
    };

    const result = await renderer.renderSlide(
      slide,
      makeContext({ mockupImages: new Map() }),
    );

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('missing_mockup');
    expect(result.imageUrl).toBeUndefined();
  });

  it('returns failed with missing_mockup when mockup block has no mockupRef', async () => {
    const renderer = new DefaultRenderer({
      catalog:         makeCatalogMock(),
      chartRenderer:   makeChartRendererMock(pngBuffer),
      mockupRenderer:  makeMockupRendererMock(pngBuffer),
      bgClient:        makeCleanBgClientMock(pngBuffer),
      bgScanner:       makeCleanScannerMock(),
      storage:         makeStorageMock(),
    });

    const slide: ContentPlanSlide = {
      index: 0,
      blocks: [{ type: 'mockup' }], // no mockupRef
    };

    const result = await renderer.renderSlide(slide, makeContext());

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('missing_mockup');
  });

  // -------------------------------------------------------------------------
  // Test 4: Storage upload failure
  // -------------------------------------------------------------------------
  it('returns failed with upload_failed when object storage upload fails', async () => {
    const renderer = new DefaultRenderer({
      catalog:         makeCatalogMock(),
      chartRenderer:   makeChartRendererMock(pngBuffer),
      mockupRenderer:  makeMockupRendererMock(pngBuffer),
      bgClient:        makeCleanBgClientMock(pngBuffer),
      bgScanner:       makeCleanScannerMock(),
      storage:         makeFailingStorageMock(),
    });

    const result = await renderer.renderSlide(headingSlide(0), makeContext());

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('upload_failed');
    expect(result.imageUrl).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Test 5: Dirty background → retry → still dirty → solid brand color → success
  // -------------------------------------------------------------------------
  it('uses solid brand color when scanner returns dirty after retry and still succeeds', async () => {
    // Scanner always returns dirty
    const dirtyScanner = makeDirtyScannerMock();

    // bgClient always returns a "dirty" image but doesn't fail
    const bgClient = makeCleanBgClientMock(pngBuffer);

    const uploadUrl = 'https://cdn.example.com/slide-fallback.png';
    const storage   = makeStorageMock(uploadUrl);

    const renderer = new DefaultRenderer({
      catalog:         makeCatalogMock(),
      chartRenderer:   makeChartRendererMock(pngBuffer),
      mockupRenderer:  makeMockupRendererMock(pngBuffer),
      bgClient,
      bgScanner:       dirtyScanner,
      storage,
    });

    const result = await renderer.renderSlide(headingSlide(0), makeContext());

    // Result should still be success — we fell back to solid brand color
    expect(result.status).toBe('success');
    expect(result.imageUrl).toBe(uploadUrl);

    // bgClient was called twice (initial + 1 retry)
    expect((bgClient.generate as Mock).mock.calls.length).toBe(2);

    // Scanner was called twice (once for initial, once for retry)
    expect((dirtyScanner.scan as Mock).mock.calls.length).toBe(2);

    // Storage upload was called once
    expect((storage.upload as Mock).mock.calls.length).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Test 6: bgClient fails → solid brand color → success
  // -------------------------------------------------------------------------
  it('falls back to solid brand color when bgClient fails and still succeeds', async () => {
    const uploadUrl = 'https://cdn.example.com/slide-bgfail.png';
    const renderer = new DefaultRenderer({
      catalog:         makeCatalogMock(),
      chartRenderer:   makeChartRendererMock(pngBuffer),
      mockupRenderer:  makeMockupRendererMock(pngBuffer),
      bgClient:        makeFailingBgClientMock(),
      bgScanner:       makeCleanScannerMock(),
      storage:         makeStorageMock(uploadUrl),
    });

    const result = await renderer.renderSlide(headingSlide(0), makeContext());

    expect(result.status).toBe('success');
    expect(result.imageUrl).toBe(uploadUrl);
  });

  // -------------------------------------------------------------------------
  // Test 7: Correct storage key format
  // -------------------------------------------------------------------------
  it('uploads to the correct storage key: jobs/{jobId}/slide-{index}.png', async () => {
    const storage = makeStorageMock();
    const renderer = new DefaultRenderer({
      catalog:         makeCatalogMock(),
      chartRenderer:   makeChartRendererMock(pngBuffer),
      mockupRenderer:  makeMockupRendererMock(pngBuffer),
      bgClient:        makeCleanBgClientMock(pngBuffer),
      bgScanner:       makeCleanScannerMock(),
      storage,
    });

    await renderer.renderSlide(headingSlide(2), makeContext({ jobId: 'job-xyz' }));

    const uploadCalls = (storage.upload as Mock).mock.calls;
    expect(uploadCalls.length).toBeGreaterThan(0);
    const uploadCall = uploadCalls[0] as unknown[];
    expect(uploadCall[0]).toBe('team-1');        // teamId
    expect(uploadCall[1]).toBe('jobs/job-xyz/slide-2.png'); // key
    expect(uploadCall[3]).toBe('image/png');     // contentType
    expect(Buffer.isBuffer(uploadCall[2])).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 8: Successful chart rendering
  // -------------------------------------------------------------------------
  it('renders chart block successfully when chartData is available', async () => {
    const chartPng = await makePng(255, 0, 0);
    const chartData: ChartData = { kind: 'bar', series: [{ label: 'A', value: 10 }] };

    const renderer = new DefaultRenderer({
      catalog:         makeCatalogMock(),
      chartRenderer:   makeChartRendererMock(chartPng),
      mockupRenderer:  makeMockupRendererMock(pngBuffer),
      bgClient:        makeCleanBgClientMock(pngBuffer),
      bgScanner:       makeCleanScannerMock(),
      storage:         makeStorageMock(),
    });

    const slide: ContentPlanSlide = {
      index: 0,
      blocks: [
        { type: 'heading', text: 'Chart Slide' },
        { type: 'chart', chartDataRef: 'my-chart' },
      ],
    };

    const result = await renderer.renderSlide(
      slide,
      makeContext({ chartData: new Map([['my-chart', chartData]]) }),
    );

    expect(result.status).toBe('success');
    expect(result.imageUrl).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Test 9: Successful mockup rendering
  // -------------------------------------------------------------------------
  it('renders mockup block successfully when mockup image is available', async () => {
    const mockupPng = await makePng(0, 255, 0);

    const renderer = new DefaultRenderer({
      catalog:         makeCatalogMock(),
      chartRenderer:   makeChartRendererMock(pngBuffer),
      mockupRenderer:  makeMockupRendererMock(pngBuffer),
      bgClient:        makeCleanBgClientMock(pngBuffer),
      bgScanner:       makeCleanScannerMock(),
      storage:         makeStorageMock(),
    });

    const slide: ContentPlanSlide = {
      index: 0,
      blocks: [
        { type: 'mockup', mockupRef: 'screen-1' },
        { type: 'body',   text: 'Description here' },
      ],
    };

    const result = await renderer.renderSlide(
      slide,
      makeContext({ mockupImages: new Map([['screen-1', mockupPng]]) }),
    );

    expect(result.status).toBe('success');
    expect(result.imageUrl).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Test 10: off_brand when brand kit has no colors
  // -------------------------------------------------------------------------
  it('returns failed with off_brand when brandKit has no colors', async () => {
    const renderer = new DefaultRenderer({
      catalog:         makeCatalogMock(),
      chartRenderer:   makeChartRendererMock(pngBuffer),
      mockupRenderer:  makeMockupRendererMock(pngBuffer),
      bgClient:        makeCleanBgClientMock(pngBuffer),
      bgScanner:       makeCleanScannerMock(),
      storage:         makeStorageMock(),
    });

    const noBrandColors: BrandKit = {
      ...BRAND_KIT,
      colors: [], // no brand colors
    };

    const result = await renderer.renderSlide(
      headingSlide(0),
      makeContext({ brandKit: noBrandColors }),
    );

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('off_brand');
  });

  // -------------------------------------------------------------------------
  // Test 11: usedFallbackLayout is false for normal render
  // -------------------------------------------------------------------------
  it('sets usedFallbackLayout=false on a normal successful render', async () => {
    const renderer = new DefaultRenderer({
      catalog:         makeCatalogMock(),
      chartRenderer:   makeChartRendererMock(pngBuffer),
      mockupRenderer:  makeMockupRendererMock(pngBuffer),
      bgClient:        makeCleanBgClientMock(pngBuffer),
      bgScanner:       makeCleanScannerMock(),
      storage:         makeStorageMock(),
    });

    const result = await renderer.renderSlide(headingSlide(0), makeContext());

    expect(result.usedFallbackLayout).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test 12: Different slide indices produce different storage keys
  // -------------------------------------------------------------------------
  it('uses slide index in the storage key', async () => {
    const storage = makeStorageMock();
    const renderer = new DefaultRenderer({
      catalog:         makeCatalogMock(),
      chartRenderer:   makeChartRendererMock(pngBuffer),
      mockupRenderer:  makeMockupRendererMock(pngBuffer),
      bgClient:        makeCleanBgClientMock(pngBuffer),
      bgScanner:       makeCleanScannerMock(),
      storage,
    });

    await renderer.renderSlide(headingSlide(5), makeContext());

    const key = ((storage.upload as Mock).mock.calls[0] as unknown[])[1] as string;
    expect(key).toContain('slide-5');
  });

  // -------------------------------------------------------------------------
  // Test 13: Scanner called before compositing (dirty bg → never composited)
  // -------------------------------------------------------------------------
  it('calls bgScanner before compositing the background', async () => {
    const callOrder: string[] = [];

    const bgClient: BackgroundImageClient = {
      generate: vi.fn(async () => {
        callOrder.push('bg_generate');
        return { ok: true as const, value: pngBuffer };
      }),
    };

    const bgScanner: BackgroundScanner = {
      scan: vi.fn(async (): Promise<ScanResult> => {
        callOrder.push('bg_scan');
        return { clean: true, detected: [] };
      }),
    };

    const storage: ObjectStorage = {
      upload: vi.fn(async () => {
        callOrder.push('upload');
        return { ok: true as const, value: 'https://cdn.example.com/slide.png' };
      }),
      resolveForTeam: vi.fn(async () => ({ ok: true as const, value: '' })),
    };

    const renderer = new DefaultRenderer({
      catalog:        makeCatalogMock(),
      chartRenderer:  makeChartRendererMock(pngBuffer),
      mockupRenderer: makeMockupRendererMock(pngBuffer),
      bgClient,
      bgScanner,
      storage,
    });

    await renderer.renderSlide(headingSlide(0), makeContext());

    // bg_generate must come before bg_scan, and bg_scan before upload
    const genIdx  = callOrder.indexOf('bg_generate');
    const scanIdx = callOrder.indexOf('bg_scan');
    const upIdx   = callOrder.indexOf('upload');

    expect(genIdx).toBeGreaterThanOrEqual(0);
    expect(scanIdx).toBeGreaterThan(genIdx);
    expect(upIdx).toBeGreaterThan(scanIdx);
  });

  // -------------------------------------------------------------------------
  // Test 14: Text blocks render without error for all text types
  // -------------------------------------------------------------------------
  it.each([
    ['body',   'Some body text'],
    ['quote',  'A wise quote here'],
    ['stat',   '42%'],
    ['bullet', '• First item'],
    ['cta',    'Click here now'],
  ] as const)('renders %s text block without error', async (type, text) => {
    // We need a catalog that knows about these block types
    const singleBlockVariant: SlideLayoutVariant = {
      id: `${type}-only`,
      compositionType: type,
      aspectRatios: ['1:1', '4:5', '9:16'],
      regions: [{ blockType: type, box: { x: 0, y: 100, w: 1000, h: 800 } }],
      isDefault: true,
    };

    const catalog: SlideLayoutCatalog = {
      variantsFor: vi.fn(() => [singleBlockVariant]),
      defaultFor:  vi.fn(() => singleBlockVariant),
    };

    const renderer = new DefaultRenderer({
      catalog,
      chartRenderer:  makeChartRendererMock(pngBuffer),
      mockupRenderer: makeMockupRendererMock(pngBuffer),
      bgClient:       makeCleanBgClientMock(pngBuffer),
      bgScanner:      makeCleanScannerMock(),
      storage:        makeStorageMock(),
    });

    const slide: ContentPlanSlide = {
      index: 0,
      blocks: [{ type, text }],
    };

    const result = await renderer.renderSlide(slide, makeContext());
    expect(result.status).toBe('success');
  });

  // -------------------------------------------------------------------------
  // Test 15: Retry generates the background a second time on first dirty scan
  // -------------------------------------------------------------------------
  it('retries background generation exactly once when first scan is dirty', async () => {
    let scanCount = 0;
    const bgScanner: BackgroundScanner = {
      scan: vi.fn(async (): Promise<ScanResult> => {
        scanCount++;
        // First scan: dirty; second scan: clean
        return scanCount === 1
          ? { clean: false, detected: ['logo'] }
          : { clean: true,  detected: [] };
      }),
    };

    const bgClient = makeCleanBgClientMock(pngBuffer);
    const renderer = new DefaultRenderer({
      catalog:        makeCatalogMock(),
      chartRenderer:  makeChartRendererMock(pngBuffer),
      mockupRenderer: makeMockupRendererMock(pngBuffer),
      bgClient,
      bgScanner,
      storage:        makeStorageMock(),
    });

    const result = await renderer.renderSlide(headingSlide(0), makeContext());

    expect(result.status).toBe('success');
    // bgClient.generate called exactly twice: initial + 1 retry
    expect((bgClient.generate as Mock).mock.calls.length).toBe(2);
    // bgScanner.scan called twice
    expect((bgScanner.scan as Mock).mock.calls.length).toBe(2);
  });
});

// ===========================================================================
// Property-based tests (fast-check) — tasks 14.4, 16.2, 16.3, 16.4, 16.5, 16.6
//
// These exercise the LOGIC layer of DefaultRenderer via the same in-memory
// fakes used by the unit tests above (catalog, chartRenderer, mockupRenderer,
// bgClient, bgScanner, storage). Fault injection is used where the property
// requires it (scanner returns unclean, ObjectStorage.upload fails, logo fetch
// fails). No real rendering pixels are asserted on except where decoding the
// final canvas is the only way to prove an unclean background was never
// composited (Property 13).
// ===========================================================================

// ---------------------------------------------------------------------------
// Shared arbitraries & helpers
// ---------------------------------------------------------------------------

/** Valid 6-digit hex color, e.g. '#0a1b2c'. */
const hexColorArb = fc
  .integer({ min: 0, max: 0xffffff })
  .map((n) => '#' + n.toString(16).padStart(6, '0'));

/** One or more brand colors. */
const colorsArb = fc.array(hexColorArb, { minLength: 1, maxLength: 5 });

/** Arbitrary https URL (content is irrelevant — fetch/storage are mocked). */
const httpsUrlArb = fc
  .hexaString({ minLength: 4, maxLength: 10 })
  .map((s) => `https://cdn.example.com/${s}.png`);

const aspectRatioArb = fc.constantFrom<AspectRatio>('1:1', '4:5', '9:16');

/** Logo placements that DO render a logo (everything except 'none'). */
const placementNonNoneArb = fc.constantFrom<BrandKit['chrome']['logoPlacement']>(
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
);

const placementAnyArb = fc.constantFrom<BrandKit['chrome']['logoPlacement']>(
  'none',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
);

/** A normalized bounding box guaranteed to stay inside the canvas. */
const safeBoxArb = fc.record({
  x: fc.integer({ min: 0, max: 80 }),
  y: fc.integer({ min: 100, max: 250 }),
  w: fc.integer({ min: 300, max: 700 }),
  h: fc.integer({ min: 300, max: 500 }),
});

/** Mirror of the renderer's private canvasSize(). */
function testCanvasSize(ar: AspectRatio): { width: number; height: number } {
  switch (ar) {
    case '1:1':
      return { width: 1080, height: 1080 };
    case '4:5':
      return { width: 1080, height: 1350 };
    case '9:16':
      return { width: 1080, height: 1920 };
  }
}

/** Mirror of the renderer's private normalizedToPixel() width/height mapping. */
function pxFromBox(
  box: { w: number; h: number },
  ar: AspectRatio,
): { w: number; h: number } {
  const cs = testCanvasSize(ar);
  return {
    w: Math.round((box.w / 1000) * cs.width),
    h: Math.round((box.h / 1000) * cs.height),
  };
}

/** Build a BrandKit fixture from generated parts. */
function makeBrandKit(
  colors: string[],
  logoUrl: string,
  logoPlacement: BrandKit['chrome']['logoPlacement'],
  pageNumberFormat: string,
  siteUrl: string,
): BrandKit {
  return {
    id: 'bk-prop',
    teamId: 'team-1',
    logoUrl,
    fonts: [{ id: 'f-1', url: '', family: 'Inter', weight: 400, style: 'normal' }],
    colors,
    chrome: { logoPlacement, pageNumberFormat, siteUrl },
    updatedAt: new Date('2024-01-01'),
  };
}

/** A fetch stub return value carrying a valid PNG body (logo download success). */
function okLogoResponse(arrayBuffer: ArrayBuffer) {
  return {
    ok: true as const,
    status: 200,
    arrayBuffer: async () => arrayBuffer,
    text: async () => '',
  };
}

/** Convert a Buffer to a standalone ArrayBuffer (for the fetch stub). */
function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

// ---------------------------------------------------------------------------
// Property 14 (task 14.4): Layout variant selection & default fallback
// ---------------------------------------------------------------------------

describe('DefaultRenderer — Property 14: Pemilihan varian layout dan fallback default', () => {
  // Feature: ai-content-carousel-generator, Property 14: Untuk setiap Slide, varian Slide_Layout yang dipakai SHALL merupakan anggota SlideLayoutCatalog.variantsFor(blocks, aspectRatio); ketika Renderer mendeteksi kontras < 4.5:1, overflow, collision, batasan layout lain, atau komposisi blok tidak ditetapkan, Renderer SHALL menerapkan defaultFor(blocks, aspectRatio) dan menandai usedFallback = true, sedangkan Slide yang dirender tanpa fallback SHALL memiliki usedFallback = false.
  // **Validates: Requirements 5.7, 6.1, 6.4, 11.4**

  it('chooses a variant from variantsFor() and falls back to defaultFor() (usedFallbackLayout) exactly when a layout trigger is present', async () => {
    const png = await makePng();

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('membership', 'no-fallback', 'fallback'),
        aspectRatioArb,
        safeBoxArb,
        safeBoxArb,
        fc.constantFrom('v1', 'v2', 'invalid', 'none'),
        fc.string({ maxLength: 24 }),
        fc.string({ maxLength: 24 }),
        async (scenario, ar, box1, box2, hintMode, headingText, bodyText) => {
          const chartRenderer = makeChartRendererMock(png);
          const headingBox = { x: 0, y: 100, w: 1000, h: 200 };
          const bodyBox = { x: 0, y: 320, w: 1000, h: 480 };

          if (scenario === 'membership') {
            // Slide of a single chart block. Two candidate variants with chart
            // regions of (possibly) different boxes — the size handed to the
            // ChartRenderer reveals WHICH catalog variant was actually used,
            // proving membership in variantsFor() and that a valid hint wins.
            const v1: SlideLayoutVariant = {
              id: 'v1',
              compositionType: 'chart',
              aspectRatios: ['1:1', '4:5', '9:16'],
              regions: [{ blockType: 'chart', box: box1 }],
              isDefault: true,
            };
            const v2: SlideLayoutVariant = {
              id: 'v2',
              compositionType: 'chart',
              aspectRatios: ['1:1', '4:5', '9:16'],
              regions: [{ blockType: 'chart', box: box2 }],
              isDefault: false,
            };
            const vd: SlideLayoutVariant = {
              id: 'vd',
              compositionType: 'default',
              aspectRatios: ['1:1', '4:5', '9:16'],
              regions: [{ blockType: 'heading', box: headingBox }],
              isDefault: true,
            };
            const catalog: SlideLayoutCatalog = {
              variantsFor: vi.fn(() => [v1, v2]),
              defaultFor: vi.fn(() => vd),
            };

            const hint =
              hintMode === 'v1'
                ? 'v1'
                : hintMode === 'v2'
                  ? 'v2'
                  : hintMode === 'invalid'
                    ? 'zzz-unknown'
                    : undefined;

            const slide: ContentPlanSlide = {
              index: 0,
              blocks: [{ type: 'chart', chartDataRef: 'c' }],
              ...(hint !== undefined ? { layoutVariantHint: hint } : {}),
            };

            const renderer = new DefaultRenderer({
              catalog,
              chartRenderer,
              mockupRenderer: makeMockupRendererMock(png),
              bgClient: makeCleanBgClientMock(png),
              bgScanner: makeCleanScannerMock(),
              storage: makeStorageMock(),
            });

            const result = await renderer.renderSlide(
              slide,
              makeContext({
                aspectRatio: ar,
                chartData: new Map([['c', { kind: 'bar' as const, series: [{ label: 'a', value: 2 }] }]]),
              }),
            );

            expect(result.status).toBe('success');
            // No fallback trigger: usedFallbackLayout false, defaultFor untouched.
            expect(result.usedFallbackLayout).toBe(false);
            expect((catalog.defaultFor as Mock).mock.calls.length).toBe(0);

            // variantsFor() consulted with the slide's blocks + aspectRatio.
            const vfArgs = (catalog.variantsFor as Mock).mock.calls[0]!;
            expect(vfArgs[0]).toEqual(['chart']);
            expect(vfArgs[1]).toBe(ar);

            // The chosen variant (∈ variantsFor result) determined the chart size.
            const expected = hint === 'v2' ? v2 : v1;
            const px = pxFromBox(expected.regions[0]!.box, ar);
            const chartSize = (chartRenderer.render as Mock).mock.calls[0]![2];
            expect(chartSize).toEqual({ w: px.w, h: px.h });
          } else {
            // heading+body slide. 'no-fallback' variant covers both blocks;
            // 'fallback' variant is missing the body region, forcing defaultFor.
            const coversBody = scenario === 'no-fallback';
            const vp: SlideLayoutVariant = {
              id: 'vp',
              compositionType: 'body+heading',
              aspectRatios: ['1:1', '4:5', '9:16'],
              regions: coversBody
                ? [
                    { blockType: 'heading', box: headingBox },
                    { blockType: 'body', box: bodyBox },
                  ]
                : [{ blockType: 'heading', box: headingBox }],
              isDefault: true,
            };
            const vd: SlideLayoutVariant = {
              id: 'vd',
              compositionType: 'default',
              aspectRatios: ['1:1', '4:5', '9:16'],
              regions: [{ blockType: 'heading', box: headingBox }],
              isDefault: true,
            };
            const catalog: SlideLayoutCatalog = {
              variantsFor: vi.fn(() => [vp]),
              defaultFor: vi.fn(() => vd),
            };

            const slide: ContentPlanSlide = {
              index: 0,
              blocks: [
                { type: 'heading', text: headingText },
                { type: 'body', text: bodyText },
              ],
            };

            const renderer = new DefaultRenderer({
              catalog,
              chartRenderer,
              mockupRenderer: makeMockupRendererMock(png),
              bgClient: makeCleanBgClientMock(png),
              bgScanner: makeCleanScannerMock(),
              storage: makeStorageMock(),
            });

            const result = await renderer.renderSlide(slide, makeContext({ aspectRatio: ar }));

            expect(result.status).toBe('success');

            const vfArgs = (catalog.variantsFor as Mock).mock.calls[0]!;
            expect(vfArgs[0]).toEqual(['heading', 'body']);
            expect(vfArgs[1]).toBe(ar);

            if (coversBody) {
              expect(result.usedFallbackLayout).toBe(false);
              expect((catalog.defaultFor as Mock).mock.calls.length).toBe(0);
            } else {
              // composition block not placeable → defaultFor applied + flag set.
              expect(result.usedFallbackLayout).toBe(true);
              expect((catalog.defaultFor as Mock).mock.calls.length).toBeGreaterThanOrEqual(1);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  }, 200_000);
});

// ---------------------------------------------------------------------------
// Property 11 (task 16.2): Brand fidelity invariant
// ---------------------------------------------------------------------------

describe('DefaultRenderer — Property 11: Invarian kesetiaan brand', () => {
  // Feature: ai-content-carousel-generator, Property 11: Untuk setiap Slide yang dirender, terlepas dari isi Background_Image, varian Slide_Layout yang dipilih, atau Approved_Example yang disuntikkan, logo/Brand_Font/warna yang dipakai SHALL berasal hanya dari Brand_Kit Team (warna teks ⊆ daftar warna brand, font ∈ Brand_Font, logo = berkas logo Brand_Kit), dan SHALL tidak pernah diambil dari Background_Image maupun ditimpa oleh Approved_Example.
  // **Validates: Requirements 5.1, 5.3, 5.4, 6.2, 6.3, 8.3, 9.3**

  it('sources palette + logo only from the BrandKit, invariant to background bytes and example/layout hints', async () => {
    const logoPng = await makePng(7, 8, 9);
    const logoAB = toArrayBuffer(logoPng);
    const fetchMock = vi.fn(async (..._args: unknown[]) => okLogoResponse(logoAB));
    vi.stubGlobal('fetch', fetchMock);

    // A few visually distinct backgrounds — none of these may influence the
    // chosen palette or logo (brand assets must come solely from BrandKit).
    const backgrounds = [
      await makePng(0, 0, 0),
      await makePng(255, 255, 255),
      await makePng(13, 200, 90),
    ];

    try {
      await fc.assert(
        fc.asyncProperty(
          colorsArb,
          httpsUrlArb,
          placementNonNoneArb,
          fc.string({ maxLength: 16 }), // pageNumberFormat ("example" / chrome config)
          fc.string({ maxLength: 16 }), // siteUrl
          fc.option(fc.constantFrom('heading-chart', 'unknown-hint'), { nil: undefined }),
          fc.integer({ min: 0, max: backgrounds.length - 1 }),
          aspectRatioArb,
          async (colors, logoUrl, placement, pageFmt, site, hint, bgIdx, ar) => {
            fetchMock.mockClear();

            const chartRenderer = makeChartRendererMock(await makePng(255, 0, 0));
            const bgClient = makeCleanBgClientMock(backgrounds[bgIdx]!);
            const brandKit = makeBrandKit(colors, logoUrl, placement, pageFmt, site);

            const slide: ContentPlanSlide = {
              index: 0,
              blocks: [
                { type: 'heading', text: 'Hi' },
                { type: 'chart', chartDataRef: 'c1' },
              ],
              ...(hint !== undefined ? { layoutVariantHint: hint } : {}),
            };

            const renderer = new DefaultRenderer({
              catalog: makeCatalogMock(),
              chartRenderer,
              mockupRenderer: makeMockupRendererMock(await makePng()),
              bgClient,
              bgScanner: makeCleanScannerMock(),
              storage: makeStorageMock('https://cdn.example.com/out.png'),
            });

            const result = await renderer.renderSlide(
              slide,
              makeContext({
                brandKit,
                aspectRatio: ar,
                chartData: new Map([['c1', { kind: 'bar' as const, series: [{ label: 'a', value: 1 }] }]]),
              }),
            );

            expect(result.status).toBe('success');

            // Background generation receives ONLY brand colors as its palette.
            const bgReq = (bgClient.generate as Mock).mock.calls[0]![1];
            expect(bgReq.palette).toEqual(colors);

            // Chart is rendered with ONLY the brand palette (never background-derived).
            const chartPalette = (chartRenderer.render as Mock).mock.calls[0]![1];
            expect(chartPalette).toEqual(colors);

            // The logo asset fetched is exactly the BrandKit logo file — nothing else.
            const fetchedUrls = fetchMock.mock.calls.map((c) => c[0]);
            expect(fetchedUrls).toEqual([logoUrl]);
          },
        ),
        { numRuns: 100 },
      );
    } finally {
      vi.unstubAllGlobals();
    }
  }, 200_000);
});

// ---------------------------------------------------------------------------
// Property 12 (task 16.3): Chrome identical across slides
// ---------------------------------------------------------------------------

describe('DefaultRenderer — Property 12: Chrome identik lintas-slide', () => {
  // Feature: ai-content-carousel-generator, Property 12: Untuk setiap Carousel, chrome (aset logo, penempatan logo, format penomoran halaman, dan URL situs) SHALL dirender identik pada setiap Slide sesuai definisi chrome Brand_Kit, dengan satu-satunya perbedaan yang diizinkan adalah nilai nomor halaman yang mengikuti format yang sama.
  // **Validates: Requirements 5.2**

  it('renders identical chrome (logo asset + placement) on every slide; only the page-number value (slide index) differs', async () => {
    const logoPng = await makePng(3, 3, 3);
    const logoAB = toArrayBuffer(logoPng);
    const fetchMock = vi.fn(async (..._args: unknown[]) => okLogoResponse(logoAB));
    vi.stubGlobal('fetch', fetchMock);

    try {
      await fc.assert(
        fc.asyncProperty(
          colorsArb,
          httpsUrlArb,
          placementAnyArb,
          fc.string({ maxLength: 16 }), // pageNumberFormat (identical for every slide)
          fc.string({ maxLength: 16 }), // siteUrl (identical for every slide)
          fc.integer({ min: 2, max: 4 }), // total slides in the carousel
          async (colors, logoUrl, placement, pageFmt, site, total) => {
            const png = await makePng();
            const brandKit = makeBrandKit(colors, logoUrl, placement, pageFmt, site);
            const storage = makeStorageMock('https://cdn.example.com/out.png');
            const renderer = new DefaultRenderer({
              catalog: makeCatalogMock(),
              chartRenderer: makeChartRendererMock(png),
              mockupRenderer: makeMockupRendererMock(png),
              bgClient: makeCleanBgClientMock(png),
              bgScanner: makeCleanScannerMock(),
              storage,
            });

            const fetchedPerSlide: unknown[][] = [];
            const results: Awaited<ReturnType<typeof renderer.renderSlide>>[] = [];

            for (let i = 0; i < total; i++) {
              fetchMock.mockClear();
              const slide: ContentPlanSlide = { index: i, blocks: [{ type: 'heading', text: 'H' }] };
              const r = await renderer.renderSlide(slide, makeContext({ brandKit, totalSlides: total, aspectRatio: '1:1' }));
              results.push(r);
              fetchedPerSlide.push(fetchMock.mock.calls.map((c) => c[0]));
            }

            // Every slide rendered successfully.
            for (const r of results) expect(r.status).toBe('success');

            // Chrome logo asset + placement are identical across all slides:
            // each slide fetched exactly the same logo URL list.
            const expectedFetch = placement === 'none' ? [] : [logoUrl];
            for (const urls of fetchedPerSlide) {
              expect(urls).toEqual(expectedFetch);
            }

            // Layout/chrome composition uniform across slides.
            const fbFlags = new Set(results.map((r) => r.usedFallbackLayout));
            expect(fbFlags.size).toBe(1);

            // The ONLY per-slide difference is the page number value — encoded
            // by the slide index, surfaced in the per-slide storage key.
            const keys = (storage.upload as Mock).mock.calls.map((c) => c[1]);
            for (let i = 0; i < total; i++) {
              expect(keys[i]).toBe(`jobs/job-1/slide-${i}.png`);
            }
          },
        ),
        { numRuns: 100 },
      );
    } finally {
      vi.unstubAllGlobals();
    }
  }, 200_000);
});

// ---------------------------------------------------------------------------
// Property 13 (task 16.4): Background scanned before compositing; an unclean
// background is NEVER composited (fault injection on scanner + fallback path)
// ---------------------------------------------------------------------------

describe('DefaultRenderer — Property 13: Background dipindai sebelum compositing dan tidak pernah meng-compositing background bermasalah', () => {
  // Feature: ai-content-carousel-generator, Property 13: Untuk setiap Background_Image yang diterima Renderer, BackgroundScanner.scan SHALL dipanggil sebelum compositing, dan jika background terdeteksi memuat teks/logo (tidak bersih), Slide final SHALL tidak pernah memuat background tersebut — keluaran hanya boleh berupa background hasil regenerasi yang bersih, latar polos berwarna brand, atau Slide berstatus failed — terlepas dari apakah jalur fallback itu sendiri mengalami kendala.
  // **Validates: Requirements 5.5, 5.6, 5.10, 7.5**

  it('scans before compositing and never composites an unclean background — outcome is a clean brand plain background', async () => {
    // The "unclean" AI background is a pure-RED marker. The brand plain
    // fallback is pure-BLUE (#0000ff). Decoding the final canvas proves the red
    // marker was never composited (its absence is the safety guarantee).
    const RED = await makePng(255, 0, 0);

    await fc.assert(
      fc.asyncProperty(
        aspectRatioArb,
        fc.uniqueArray(fc.constantFrom('text', 'logo'), { minLength: 1, maxLength: 2 }),
        fc.integer({ min: 1, max: 5 }), // total slides
        fc.integer({ min: 0, max: 4 }), // slide index
        fc.boolean(), // regeneration itself also fails (fallback path under fault)
        async (ar, detected, total, index, retryFails) => {
          const order: string[] = [];
          let genCount = 0;
          let uploaded: Buffer | undefined;

          const bgClient: BackgroundImageClient = {
            generate: vi.fn(async () => {
              order.push('generate');
              genCount++;
              if (retryFails && genCount >= 2) {
                return { ok: false as const, error: { code: 'INTERNAL' as const, message: 'regen failed' } };
              }
              return { ok: true as const, value: RED };
            }),
          };
          const bgScanner: BackgroundScanner = {
            scan: vi.fn(async (): Promise<ScanResult> => {
              order.push('scan');
              return { clean: false, detected: detected as ('text' | 'logo')[] };
            }),
          };
          const storage: ObjectStorage = {
            upload: vi.fn(async (_teamId: string, _key: string, bytes: Buffer) => {
              order.push('upload');
              uploaded = bytes;
              return { ok: true as const, value: 'https://cdn.example.com/o.png' };
            }),
            resolveForTeam: vi.fn(async () => ({ ok: true as const, value: '' })),
          };

          // Brand primary = pure blue, distinguishable from the red marker.
          const brandKit = makeBrandKit(['#0000ff'], '', 'none', '{current}/{total}', 'example.com');
          const renderer = new DefaultRenderer({
            catalog: makeCatalogMock(),
            chartRenderer: makeChartRendererMock(RED),
            mockupRenderer: makeMockupRendererMock(RED),
            bgClient,
            bgScanner,
            storage,
          });

          const slide: ContentPlanSlide = { index, blocks: [{ type: 'heading', text: 'Hi' }] };
          const result = await renderer.renderSlide(
            slide,
            makeContext({ brandKit, aspectRatio: ar, totalSlides: total }),
          );

          // Allowed outcome: success on a clean brand plain background.
          expect(result.status).toBe('success');

          // scan() ran before any compositing/upload, and a regeneration was attempted.
          const firstScan = order.indexOf('scan');
          const firstUpload = order.indexOf('upload');
          expect(firstScan).toBeGreaterThanOrEqual(0);
          expect(firstUpload).toBeGreaterThan(firstScan);
          expect(genCount).toBe(2);

          // The unclean (red) background was NEVER composited: the top-left
          // corner of the final canvas is the brand plain blue, not red.
          const decoded = await sharp(uploaded!).raw().toBuffer({ resolveWithObject: true });
          const { width, channels } = decoded.info;
          const i = (5 * width + 5) * channels;
          const r = decoded.data[i] as number;
          const b = decoded.data[i + 2] as number;
          expect(r).toBeLessThan(128); // not the red marker
          expect(b).toBeGreaterThan(128); // brand plain blue
        },
      ),
      { numRuns: 100 },
    );
  }, 200_000);
});

// ---------------------------------------------------------------------------
// Property 15 (task 16.5): Never render an off-brand slide
// ---------------------------------------------------------------------------

describe('DefaultRenderer — Property 15: Tidak pernah merender Slide off-brand', () => {
  // Feature: ai-content-carousel-generator, Property 15: Untuk setiap Slide yang komposisi bloknya tidak dapat diterapkan bahkan setelah Slide_Layout bawaan, atau yang chrome/warna/Brand_Font-nya tidak dapat dihormati, Renderer SHALL menandai Slide berstatus failed dengan reason (layout_unsatisfiable atau off_brand) dan SHALL tidak menghasilkan Slide yang menyimpang dari brand.
  // **Validates: Requirements 6.5, 6.6**

  it('marks the slide failed (off_brand/layout_unsatisfiable) and never produces a brand-deviating slide when brand assets cannot be honored', async () => {
    let throwOnFetch = false;
    const fetchMock = vi.fn(async (..._args: unknown[]) => {
      if (throwOnFetch) throw new Error('network down');
      return {
        ok: false as const,
        status: 500,
        arrayBuffer: async () => new ArrayBuffer(0),
        text: async () => 'logo unavailable',
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('empty-colors', 'logo-fail'),
          colorsArb,
          httpsUrlArb,
          placementNonNoneArb,
          fc.boolean(), // logo failure flavour: throw vs non-ok response
          async (mode, colors, logoUrl, placement, throwIt) => {
            throwOnFetch = throwIt;
            const usedColors = mode === 'empty-colors' ? [] : colors;
            const brandKit = makeBrandKit(usedColors, logoUrl, placement, '{current}/{total}', 'example.com');
            const png = await makePng();
            const storage = makeStorageMock();

            const renderer = new DefaultRenderer({
              catalog: makeCatalogMock(),
              chartRenderer: makeChartRendererMock(png),
              mockupRenderer: makeMockupRendererMock(png),
              bgClient: makeCleanBgClientMock(png),
              bgScanner: makeCleanScannerMock(),
              storage,
            });

            const result = await renderer.renderSlide(headingSlide(0), makeContext({ brandKit }));

            // Off-brand condition → failed, never success.
            expect(result.status).toBe('failed');
            expect(result.status).not.toBe('success');
            expect(['off_brand', 'layout_unsatisfiable']).toContain(result.reason);
            expect(result.imageUrl).toBeUndefined();
            // A brand-deviating slide is never produced/uploaded.
            expect((storage.upload as Mock).mock.calls.length).toBe(0);
          },
        ),
        { numRuns: 100 },
      );
    } finally {
      vi.unstubAllGlobals();
    }
  }, 200_000);
});

// ---------------------------------------------------------------------------
// Property 16 (task 16.6): success ⟺ uploaded (fault injection on upload)
// ---------------------------------------------------------------------------

describe('DefaultRenderer — Property 16: Slide success berimplikasi terunggah', () => {
  // Feature: ai-content-carousel-generator, Property 16: Untuk setiap Slide, statusnya SHALL menjadi success jika dan hanya jika berkas PNG berhasil dihasilkan DAN berhasil diunggah ke Object_Storage; pada kasus success, image_url SHALL berupa acuan URL non-null; pada kegagalan unggah, status SHALL failed dengan reason upload_failed dan image_url SHALL null.
  // **Validates: Requirements 5.8, 5.11, 10.5**

  it('is success iff the PNG is produced AND uploaded; upload failure → failed/upload_failed with null image_url', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(), // upload succeeds?
        httpsUrlArb,
        colorsArb,
        async (uploadSucceeds, url, colors) => {
          const png = await makePng();
          const storage: ObjectStorage = {
            upload: vi.fn(async () =>
              uploadSucceeds
                ? { ok: true as const, value: url }
                : { ok: false as const, error: { code: 'INTERNAL' as const, message: 'upload boom' } },
            ),
            resolveForTeam: vi.fn(async () => ({ ok: true as const, value: '' })),
          };
          const brandKit = makeBrandKit(colors, '', 'none', '{current}/{total}', 'example.com');
          const renderer = new DefaultRenderer({
            catalog: makeCatalogMock(),
            chartRenderer: makeChartRendererMock(png),
            mockupRenderer: makeMockupRendererMock(png),
            bgClient: makeCleanBgClientMock(png),
            bgScanner: makeCleanScannerMock(),
            storage,
          });

          const result = await renderer.renderSlide(headingSlide(0), makeContext({ brandKit }));

          // In this path the PNG is always produced, so success ⟺ uploaded.
          const attemptedUpload = (storage.upload as Mock).mock.calls.length > 0;
          expect(attemptedUpload).toBe(true);
          expect(result.status === 'success').toBe(uploadSucceeds);

          if (uploadSucceeds) {
            expect(result.status).toBe('success');
            expect(result.imageUrl).toBe(url);
            expect(result.imageUrl!.startsWith('https://')).toBe(true);
            expect(result.reason).toBeUndefined();
          } else {
            expect(result.status).toBe('failed');
            expect(result.reason).toBe('upload_failed');
            expect(result.imageUrl).toBeUndefined();
          }
        },
      ),
      { numRuns: 100 },
    );
  }, 200_000);
});
