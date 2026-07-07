'use client';

/**
 * SDUI Components Catalog
 * Visual showcase of all available SDUI component types
 */

import React, { useState } from 'react';
import type { SduiComponentType } from '@leads-generator/shared';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Copy, Check, Search, ImageIcon } from 'lucide-react';

// Component types dengan metadata
const COMPONENT_TYPES: {
  type: SduiComponentType;
  category: string;
  label: string;
  description: string;
}[] = [
  // Basic
  { type: 'tag', category: 'Basic', label: 'Tag', description: 'Small label/category pill' },
  { type: 'header', category: 'Basic', label: 'Header', description: 'Primary heading text' },
  { type: 'body', category: 'Basic', label: 'Body', description: 'Paragraph text content' },
  { type: 'checklist', category: 'Basic', label: 'Checklist', description: 'Bullet point list' },
  { type: 'button_cta', category: 'Basic', label: 'Button CTA', description: 'Call-to-action button' },
  
  // Visual
  { type: 'image_placeholder', category: 'Visual', label: 'Image Placeholder', description: 'AI-generated image slot' },
  { type: 'visual_layer', category: 'Visual', label: 'Visual Layer', description: 'Dynamic visual treatment' },
  
  // Rich Text
  { type: 'quote', category: 'Rich Text', label: 'Quote', description: 'Blockquote with attribution' },
  { type: 'pull_quote', category: 'Rich Text', label: 'Pull Quote', description: 'Large editorial quote' },
  { type: 'byline', category: 'Rich Text', label: 'Byline', description: 'Author signature with avatar' },
  { type: 'callout', category: 'Rich Text', label: 'Callout', description: 'Highlighted info box' },
  { type: 'caption', category: 'Rich Text', label: 'Caption', description: 'Image credit/description' },
  
  // Data
  { type: 'stat_block', category: 'Data', label: 'Stat Block', description: 'Big number with context' },
  { type: 'stat_row', category: 'Data', label: 'Stat Row', description: 'Row of mini KPIs' },
  { type: 'key_value_list', category: 'Data', label: 'Key-Value List', description: 'Specs or summary list' },
  { type: 'data_table', category: 'Data', label: 'Data Table', description: 'Small data table' },
  { type: 'progress_bar', category: 'Data', label: 'Progress Bar', description: 'Metric/score bars' },
  
  // Structured
  { type: 'feature_cards', category: 'Structured', label: 'Feature Cards', description: 'Icon + title + desc grid' },
  { type: 'comparison', category: 'Structured', label: 'Comparison', description: 'Two-column comparison' },
  { type: 'timeline', category: 'Structured', label: 'Timeline', description: 'Time + event pairs' },
  { type: 'numbered_list', category: 'Structured', label: 'Numbered List', description: 'Ordered rich-text list' },
  
  // Utility
  { type: 'divider', category: 'Utility', label: 'Divider', description: 'Section separator' },
];

const COMPONENT_CATEGORIES = Array.from(new Set(COMPONENT_TYPES.map((c) => c.category)));

// ============================================================================
// Component Preview - Actual visual rendering
// ============================================================================

function ComponentPreview({ type }: { type: SduiComponentType }) {
  const baseClass = "p-4 min-h-[140px] flex items-center justify-center bg-white";
  
  if (type === 'tag') {
    return (
      <div className={baseClass}>
        <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
          #ProTip
        </span>
      </div>
    );
  }
  
  if (type === 'header') {
    return (
      <div className={baseClass}>
        <h2 className="text-xl font-bold text-gray-900">Transform Your Business</h2>
      </div>
    );
  }
  
  if (type === 'body') {
    return (
      <div className={`${baseClass} items-start`}>
        <p className="text-sm text-gray-700 leading-relaxed">
          This is body text content that provides detailed information and context for the reader.
        </p>
      </div>
    );
  }
  
  if (type === 'checklist') {
    return (
      <div className={`${baseClass} items-start`}>
        <ul className="space-y-2 text-sm text-gray-800">
          <li className="flex items-start"><span className="text-green-600 mr-2">✓</span><span>First benefit</span></li>
          <li className="flex items-start"><span className="text-green-600 mr-2">✓</span><span>Second benefit</span></li>
          <li className="flex items-start"><span className="text-green-600 mr-2">✓</span><span>Third benefit</span></li>
        </ul>
      </div>
    );
  }
  
  if (type === 'button_cta') {
    return (
      <div className={baseClass}>
        <Button variant="primary" size="lg">
          Get Started →
        </Button>
      </div>
    );
  }
  
  if (type === 'image_placeholder') {
    return (
      <div className={baseClass}>
        <div className="flex h-32 w-32 items-center justify-center rounded-lg bg-gradient-to-br from-purple-200 to-blue-300">
          <ImageIcon className="h-12 w-12 text-white" />
        </div>
      </div>
    );
  }
  
  if (type === 'visual_layer') {
    return (
      <div className={`${baseClass} bg-gradient-to-br from-orange-50 to-pink-50`}>
        <div className="relative h-20 w-20">
          <div className="absolute inset-0 rounded-full bg-white/50 backdrop-blur-sm"></div>
          <div className="absolute inset-2 rounded-full bg-gradient-to-br from-orange-400 to-pink-500"></div>
        </div>
      </div>
    );
  }
  
  if (type === 'quote') {
    return (
      <div className={`${baseClass} bg-gray-50`}>
        <blockquote className="border-l-4 border-blue-500 pl-4 text-sm italic text-gray-700">
          "This is an inspiring quote that resonates with the audience."
          <footer className="mt-2 text-xs not-italic text-gray-500">— John Doe, CEO</footer>
        </blockquote>
      </div>
    );
  }
  
  if (type === 'pull_quote') {
    return (
      <div className={baseClass}>
        <p className="text-center text-2xl font-serif italic text-gray-800">"Revolutionary."</p>
      </div>
    );
  }
  
  if (type === 'byline') {
    return (
      <div className={baseClass}>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500"></div>
          <div>
            <div className="text-sm font-semibold text-gray-900">Sarah Chen</div>
            <div className="text-xs text-gray-500">Senior Designer</div>
          </div>
        </div>
      </div>
    );
  }
  
  if (type === 'callout') {
    return (
      <div className={baseClass}>
        <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 p-4">
          <p className="text-sm text-blue-900">
            <span className="mr-2">💡</span>
            <strong>Tip:</strong> Save time by using keyboard shortcuts
          </p>
        </div>
      </div>
    );
  }
  
  if (type === 'caption') {
    return (
      <div className={baseClass}>
        <p className="text-xs italic text-gray-500">Photo by @photographer • Unsplash</p>
      </div>
    );
  }
  
  if (type === 'stat_block') {
    return (
      <div className={baseClass}>
        <div className="text-center">
          <div className="text-4xl font-bold text-blue-600">250%</div>
          <div className="mt-1 text-sm text-gray-600">↑ Growth Rate</div>
        </div>
      </div>
    );
  }
  
  if (type === 'stat_row') {
    return (
      <div className={baseClass}>
        <div className="flex gap-6 text-center">
          <div><div className="text-lg font-bold text-blue-600">80%</div><div className="text-xs text-gray-500">Success</div></div>
          <div><div className="text-lg font-bold text-green-600">3.5k</div><div className="text-xs text-gray-500">Users</div></div>
          <div><div className="text-lg font-bold text-purple-600">95%</div><div className="text-xs text-gray-500">Score</div></div>
        </div>
      </div>
    );
  }
  
  if (type === 'key_value_list') {
    return (
      <div className={`${baseClass} items-start`}>
        <dl className="w-full space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-gray-600">Duration:</dt><dd className="font-medium text-gray-900">6 months</dd></div>
          <div className="flex justify-between"><dt className="text-gray-600">Status:</dt><dd className="font-medium text-gray-900">Active</dd></div>
          <div className="flex justify-between"><dt className="text-gray-600">Team Size:</dt><dd className="font-medium text-gray-900">12 people</dd></div>
        </dl>
      </div>
    );
  }
  
  if (type === 'data_table') {
    return (
      <div className={`${baseClass} items-start`}>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-2 text-left font-semibold text-gray-700">Quarter</th>
              <th className="py-2 text-right font-semibold text-gray-700">Revenue</th>
            </tr>
          </thead>
          <tbody className="text-gray-600">
            <tr className="border-b border-gray-100"><td className="py-1.5">Q1 2024</td><td className="text-right">$120k</td></tr>
            <tr className="border-b border-gray-100"><td className="py-1.5">Q2 2024</td><td className="text-right">$150k</td></tr>
          </tbody>
        </table>
      </div>
    );
  }
  
  if (type === 'progress_bar') {
    return (
      <div className={`${baseClass} items-start`}>
        <div className="w-full space-y-3">
          <div>
            <div className="mb-1 flex justify-between text-xs"><span className="text-gray-700">Completion</span><span className="font-medium text-gray-900">75%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-200"><div className="h-full w-3/4 rounded-full bg-blue-600"></div></div>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs"><span className="text-gray-700">Quality</span><span className="font-medium text-gray-900">90%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-200"><div className="h-full w-[90%] rounded-full bg-green-600"></div></div>
          </div>
        </div>
      </div>
    );
  }
  
  if (type === 'feature_cards') {
    return (
      <div className={baseClass}>
        <div className="grid w-full grid-cols-3 gap-3">
          {['🎯', '📊', '⚡'].map((icon, i) => (
            <div key={i} className="rounded-lg bg-gray-50 p-3 text-center">
              <div className="text-2xl">{icon}</div>
              <div className="mt-1 text-xs font-medium text-gray-900">Feature {i + 1}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  if (type === 'comparison') {
    return (
      <div className={baseClass}>
        <div className="grid w-full grid-cols-2 gap-4 text-xs">
          <div><div className="mb-2 font-bold text-red-600">BEFORE</div><ul className="space-y-1 text-gray-600"><li>• Manual</li><li>• Slow</li></ul></div>
          <div><div className="mb-2 font-bold text-green-600">AFTER</div><ul className="space-y-1 text-gray-600"><li>• Automated</li><li>• Fast</li></ul></div>
        </div>
      </div>
    );
  }
  
  if (type === 'timeline') {
    return (
      <div className={`${baseClass} items-start`}>
        <div className="w-full space-y-2 text-xs">
          <div className="flex gap-3"><span className="font-bold text-blue-600">2020</span><span className="text-gray-700">Founded</span></div>
          <div className="flex gap-3"><span className="font-bold text-blue-600">2021</span><span className="text-gray-700">10k users</span></div>
          <div className="flex gap-3"><span className="font-bold text-blue-600">2022</span><span className="text-gray-700">Series A</span></div>
        </div>
      </div>
    );
  }
  
  if (type === 'numbered_list') {
    return (
      <div className={`${baseClass} items-start`}>
        <ol className="list-inside list-decimal space-y-2 text-sm text-gray-800">
          <li>Set up your account</li>
          <li>Connect data sources</li>
          <li>Configure preferences</li>
        </ol>
      </div>
    );
  }
  
  if (type === 'divider') {
    return (
      <div className={baseClass}>
        <div className="w-full"><hr className="border-t-2 border-gray-300" /></div>
      </div>
    );
  }
  
  return (
    <div className={`${baseClass} bg-gray-50`}>
      <div className="text-center text-xs text-gray-400">Preview</div>
    </div>
  );
}

export default function CatalogPage() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredComponents = COMPONENT_TYPES.filter((comp) => {
    const matchesCategory = !selectedCategory || comp.category === selectedCategory;
    const matchesSearch =
      !searchQuery ||
      comp.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      comp.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      comp.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">SDUI Components Catalog</h1>
          <p className="mt-1 text-sm text-gray-600">
            Visual reference for all {COMPONENT_TYPES.length} SDUI component types
          </p>
        </div>

        {/* Controls */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Category Filters */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={selectedCategory === null ? 'primary' : 'secondary'}
              size="md"
              onClick={() => setSelectedCategory(null)}
            >
              All ({COMPONENT_TYPES.length})
            </Button>
            {COMPONENT_CATEGORIES.map((category) => {
              const count = COMPONENT_TYPES.filter((c) => c.category === category).length;
              return (
                <Button
                  key={category}
                  variant={selectedCategory === category ? 'primary' : 'secondary'}
                  size="md"
                  onClick={() => setSelectedCategory(category)}
                >
                  {category} ({count})
                </Button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              type="text"
              placeholder="Search components..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Component Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredComponents.map((comp) => (
            <Card key={comp.type} className="group hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base">{comp.label}</CardTitle>
                    <div className="mt-1">
                      <Badge variant="neutral">{comp.category}</Badge>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100"
                    onClick={() => copyToClipboard(comp.type, comp.type)}
                    title="Copy type"
                  >
                    {copiedId === comp.type ? (
                      <Check className="h-4 w-4 text-state-success-dark" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <CardDescription className="text-xs mb-3">
                  {comp.description}
                </CardDescription>
                {/* Visual Preview */}
                <div className="mb-3 overflow-hidden rounded-lg border border-gray-200">
                  <ComponentPreview type={comp.type} />
                </div>
                {/* Type Code */}
                <div className="rounded-md border border-gray-200 bg-gray-50 p-2">
                  <code className="text-xs text-gray-600 font-mono break-all">
                    type: "{comp.type}"
                  </code>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredComponents.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p>No components found matching your search.</p>
          </div>
        )}
      </div>
    </div>
  );
}
