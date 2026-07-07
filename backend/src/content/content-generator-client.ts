import { uploadToSupabaseStorage } from './supabase-storage.js';
import { providerKindFromBaseUrl, requireProviderBaseUrl } from './provider-key-routing.js';

export interface StyleGuide {
  brandColors?: string[] | undefined;
  fontStyle?: string | undefined;
  mood?: string | undefined;
  layoutRules?: string[] | undefined;
  doNot?: string[] | undefined;
}

export interface ContentTemplate {
  name: string;
  type: string;
  styleGuide: StyleGuide;
  systemPrompt: string;
  referenceImages?: string[] | undefined; // URLs to reference images
}

export interface ContentGenerationResult {
  text: string;
  imageUrl?: string;
  tokenUsage: {
    promptTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export interface TextGenerationOptions {
  channel: string;
  contentInstruction: string;
  imageInstruction: string;
  template?: ContentTemplate;
}

export interface ImageGenerationOptions {
  imageInstruction: string;
  aspectRatio: string;
  template?: ContentTemplate;
}

const CHANNEL_CONSTRAINTS: Record<string, string> = {
  instagram: `FORMAT OUTPUT WAJIB untuk Instagram:
- Maksimal 2200 karakter
- Hook yang kuat di baris pertama (1 kalimat pembuka yang membuat orang berhenti scroll)
- Gunakan line breaks untuk readability
- Sertakan 5-10 hashtag relevan di akhir
- Gunakan 2-4 emoji secara strategis (jangan berlebihan)
- Tutup dengan Call-to-Action (CTA) yang jelas
- Bahasa harus natural seperti orang Indonesia berbicara, hindari terjemahan kaku
- Sesuaikan tone dengan target audience (casual untuk youth, lebih formal untuk profesional)`,

  linkedin: `FORMAT OUTPUT WAJIB untuk LinkedIn:
- Profesional dan informatif, tapi tetap approachable
- Paragraf pendek (2-3 kalimat per paragraf)
- Maksimal 3000 karakter
- Tidak perlu hashtag berlebihan (maks 3-5)
- Sertakan insight/data jika relevan
- Tutup dengan pertanyaan atau CTA untuk engagement
- Gunakan bahasa Indonesia baku tapi tidak kaku, seperti profesional Indonesia berbicara
- Hindari jargon berlebihan atau istilah asing yang tidak perlu`,

  twitter_x: `FORMAT OUTPUT WAJIB untuk Twitter/X:
- Maksimal 280 karakter per post
- Singkat, tajam, dan engaging
- Jika perlu lebih panjang, buat format thread (pisahkan dengan "🧵 1/n")
- Tanpa hashtag berlebihan (maks 2-3)
- Bahasa harus punchy dan to-the-point, seperti orang Indonesia ngobrol santai di Twitter`,

  threads: `FORMAT OUTPUT WAJIB untuk Threads:
- Casual dan conversational, seperti ngobrol dengan teman
- Maksimal 500 karakter
- Gunakan tone yang relatable dan authentic
- Hindari bahasa terlalu formal/marketing
- Bahasa Indonesia yang sangat natural, seperti chat di WhatsApp atau story IG
- Boleh pakai bahasa gaul yang umum, tapi jangan maksa`,

  email_marketing: `FORMAT OUTPUT WAJIB untuk Email Marketing:
- Mulai dengan SUBJECT LINE yang compelling (pisahkan dengan "---")
- Body email dengan paragraf pendek
- Sertakan CTA button text yang jelas
- Professional tapi personal tone
- Bahasa sopan tapi hangat, seperti email dari kolega profesional Indonesia
- Hindari bahasa terlalu formal yang terdengar seperti surat resmi`,

  facebook: `FORMAT OUTPUT WAJIB untuk Facebook:
- Engaging dan shareable
- Gunakan storytelling approach
- Ajak interaksi (pertanyaan, polling, "tag temanmu")
- Bisa lebih panjang dari Instagram tapi tetap fokus
- Bahasa harus sangat relatable untuk audience Indonesia
- Tone bisa lebih conversational dan storytelling dibanding LinkedIn`,
};

export class ContentGeneratorClient {
  constructor(
    private readonly apiKey: string,
    private readonly apiBaseUrl: string,
    private readonly textModel: string = 'gemini-2.5-flash-lite',
    private readonly imageModel: string = 'gpt-image-1',
  ) {}

  /**
   * Generates text content (e.g., social media post caption, email copy) using Gemini 2.5 Flash.
   * If style references are provided, they are fetched and injected as base64 inline data
   * to guide style consistency.
   */
  async generateText(
    options: TextGenerationOptions,
    signal?: AbortSignal,
  ): Promise<ContentGenerationResult> {
    const baseUrl = requireProviderBaseUrl(this.apiBaseUrl);
    const providerKind = providerKindFromBaseUrl(baseUrl);
    const url =
      providerKind === 'openai_compatible'
        ? `${baseUrl}/v1/chat/completions`
        : `${baseUrl}/v1beta/models/${this.textModel}:generateContent`;

    // Construct system instructions and prompt
    let systemInstruction =
      'Anda adalah spesialis pembuat konten pemasaran digital profesional yang ahli dalam menulis bahasa Indonesia yang natural dan engaging.';
    systemInstruction += '\n\nATURAN UTAMA:';
    systemInstruction += '\n- Kembalikan HANYA teks konten final yang siap posting';
    systemInstruction +=
      '\n- WAJIB gunakan bahasa Indonesia yang natural, tidak kaku, seperti native speaker';
    systemInstruction += '\n- Hindari terjemahan literal dari bahasa Inggris';
    systemInstruction += '\n- Gunakan idiom dan ungkapan yang umum dipakai orang Indonesia';
    systemInstruction +=
      '\n- Tanpa penjelasan meta, tanpa markdown formatting, tanpa bold/italic markers';
    systemInstruction +=
      '\n- Jangan gunakan kata seperti "Yuk", "Guys", "Cus", "Cusss" kecuali sesuai brand voice';

    const constraint = CHANNEL_CONSTRAINTS[options.channel];
    if (constraint) {
      systemInstruction += `\n\n${constraint}`;
    }

    const template = options.template;
    if (template) {
      systemInstruction += `\n\nGaya konten mengikuti template "${template.name}":`;
      if (template.systemPrompt) {
        systemInstruction += `\nInstruksi gaya: ${template.systemPrompt}`;
      }

      const style = template.styleGuide;
      if (style) {
        if (style.mood) {
          systemInstruction += `\nMood/Nada penulisan: ${style.mood}`;
        }
        if (style.doNot && style.doNot.length > 0) {
          systemInstruction += `\nHINDARI dalam penulisan:\n- ${style.doNot.join('\n- ')}`;
        }
      }
    }

    const parts: any[] = [];

    // Inject reference images if available (multimodal prompt)
    if (template?.referenceImages && template.referenceImages.length > 0) {
      parts.push({
        text: 'Analisis gambar-gambar referensi berikut untuk memahami nada penulisan, dan konteks visual yang perlu dideskripsikan.',
      });

      for (const imageUrl of template.referenceImages) {
        try {
          const imageParts = await fetchImageAsBase64Part(imageUrl);
          if (imageParts) {
            parts.push(imageParts);
          }
        } catch (err) {
          console.warn(`Failed to fetch reference image: ${imageUrl}`, err);
        }
      }
    }

    const finalPrompt = [
      `Topik / Instruksi Konten: "${options.contentInstruction}"`,
      options.imageInstruction
        ? `Instruksi Visual (sebagai konteks): "${options.imageInstruction}"`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    parts.push({
      text: `Buat konten pemasaran berdasarkan instruksi di atas untuk topik berikut:\n\n${finalPrompt}\n\nBerikan hasil akhir berupa teks konten pemasaran siap pakai.`,
    });

    const fetchHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (providerKind === 'openai_compatible') {
      fetchHeaders['Authorization'] = `Bearer ${this.apiKey}`;
    } else {
      // Google GenAI: key in header, never the URL query (avoids log leaks).
      fetchHeaders['x-goog-api-key'] = this.apiKey;
    }

    const fetchBody =
      providerKind === 'openai_compatible'
        ? {
            model: this.textModel,
            messages: [
              { role: 'system', content: systemInstruction },
              {
                role: 'user',
                content:
                  template?.referenceImages && template.referenceImages.length > 0
                    ? [
                        {
                          type: 'text',
                          text: 'Analisis gambar-gambar referensi untuk memahami nada penulisan.',
                        },
                        ...template.referenceImages.map((img) => ({
                          type: 'image_url',
                          image_url: { url: img },
                        })),
                        { type: 'text', text: `Buat konten berdasarkan instruksi: ${finalPrompt}` },
                      ]
                    : `Buat konten berdasarkan instruksi: ${finalPrompt}`,
              },
            ],
            temperature: 0.7,
          }
        : {
            contents: [{ parts }],
            systemInstruction: {
              parts: [{ text: systemInstruction }],
            },
            generationConfig: {
              temperature: 0.7,
            },
          };

    const fetchOptions: RequestInit = {
      method: 'POST',
      headers: fetchHeaders,
      body: JSON.stringify(fetchBody),
    };
    if (signal) {
      fetchOptions.signal = signal;
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini Text Generation failed (${response.status}): ${errorText}`);
    }

    const data: any = await response.json();
    let text = '';
    let tokenUsage = { promptTokens: 0, outputTokens: 0, totalTokens: 0 };

    if (providerKind === 'openai_compatible') {
      text = data?.choices?.[0]?.message?.content ?? '';
      const usage = data?.usage;
      if (usage) {
        tokenUsage = {
          promptTokens: usage.prompt_tokens ?? 0,
          outputTokens: usage.completion_tokens ?? 0,
          totalTokens: usage.total_tokens ?? 0,
        };
      }
    } else {
      text = extractTextFromGemini(data);
      tokenUsage = extractTokenUsage(data);
    }

    return { text, tokenUsage };
  }

  /**
   * Generates an image using Google's Imagen 3/4 API.
   * If the API call fails or is not supported by the key, it falls back to a curated stock image
   * or a dynamically drawn SVG banner matching the brand colors to ensure absolute visual quality.
   */
  async generateImage(options: ImageGenerationOptions, signal?: AbortSignal): Promise<string> {
    const baseUrl = requireProviderBaseUrl(this.apiBaseUrl);
    const providerKind = providerKindFromBaseUrl(baseUrl);

    const url =
      providerKind === 'openai_compatible'
        ? `${baseUrl}/v1/images/generations`
        : `${baseUrl}/v1beta/models/${this.imageModel}:predict`;

    const template = options.template;

    // Phase 2: Add extra AI call to describe reference images
    let referenceDescription = '';
    if (template?.referenceImages && template.referenceImages.length > 0) {
      try {
        referenceDescription = await this.describeReferenceImages(template.referenceImages, signal);
      } catch (err) {
        console.warn('Failed to describe reference images for Image Generation', err);
      }
    }

    // Enrich prompt with style guide instructions for better image consistency
    let enrichedPrompt = options.imageInstruction;
    if (template) {
      const style = template.styleGuide;
      const parts: string[] = [options.imageInstruction];

      if (referenceDescription)
        parts.push(`incorporate this visual style from references: ${referenceDescription}`);
      if (style?.mood) parts.push(`${style.mood} mood`);
      if (style?.brandColors?.length)
        parts.push(`using brand colors: ${style.brandColors.join(', ')}`);
      if (style?.fontStyle) parts.push(`typography style: ${style.fontStyle}`);
      if (style?.layoutRules?.length) parts.push(`layout: ${style.layoutRules.join(', ')}`);

      parts.push('professional marketing graphic, high resolution, clean design');

      if (style?.doNot?.length) parts.push(`DO NOT include: ${style.doNot.join(', ')}`);

      enrichedPrompt = parts.join(', ');
    }

    if (providerKind === 'openai_compatible') {
      enrichedPrompt = `${enrichedPrompt}, aspect ratio ${options.aspectRatio}`;
    }

    try {
      // Use AbortController for a 300-second timeout to prevent hanging requests
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), 300_000);
      const combinedSignal = signal ?? timeoutController.signal;

      const fetchHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (providerKind === 'openai_compatible') {
        fetchHeaders['Authorization'] = `Bearer ${this.apiKey}`;
      } else {
        // Google GenAI: key in header, never the URL query (avoids log leaks).
        fetchHeaders['x-goog-api-key'] = this.apiKey;
      }

      const fetchBody =
        providerKind === 'openai_compatible'
          ? {
              model: this.imageModel,
              prompt: enrichedPrompt,
              ...(shouldRequestOpenAiImageResponseFormat(this.imageModel)
                ? { response_format: 'b64_json' }
                : {}),
            }
          : {
              instances: [{ prompt: enrichedPrompt }],
              parameters: {
                sampleCount: 1,
                aspectRatio: options.aspectRatio,
                personGeneration: 'allow_adult', // lowercase required by API
              },
            };

      const fetchOptions: RequestInit = {
        method: 'POST',
        headers: fetchHeaders,
        body: JSON.stringify(fetchBody),
        signal: combinedSignal,
      };

      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      if (response.ok) {
        const data: any = await response.json();
        let base64Bytes = '';
        if (providerKind === 'openai_compatible') {
          base64Bytes = data?.data?.[0]?.b64_json ?? '';
        } else {
          base64Bytes = data?.predictions?.[0]?.bytesBase64Encoded ?? '';
        }

        if (base64Bytes) {
          const buffer = Buffer.from(base64Bytes, 'base64');
          const fileName = `generated-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
          return await uploadToSupabaseStorage(fileName, buffer, 'image/jpeg');
        }
        // Log the actual response for debugging if predictions are missing
        console.warn('Imagen API responded OK but no image data found.');
      } else {
        const errorText = await response.text();
        console.warn(
          `Imagen API failed, status: ${response.status}. Error: ${errorText}. Falling back to curated image.`,
        );
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.warn('Imagen generation timed out after 60s. Falling back to curated stock image.');
      } else {
        console.warn(
          `Imagen generation failed: ${err.message}. Falling back to curated stock image.`,
        );
      }
    }

    // Fallback logic if Imagen fails
    return await generateFallbackImage(options.imageInstruction, template);
  }

  private async describeReferenceImages(
    imageUrls: string[],
    signal?: AbortSignal,
  ): Promise<string> {
    const baseUrl = requireProviderBaseUrl(this.apiBaseUrl);
    const providerKind = providerKindFromBaseUrl(baseUrl);
    const url =
      providerKind === 'openai_compatible'
        ? `${baseUrl}/v1/chat/completions`
        : `${baseUrl}/v1beta/models/${this.textModel}:generateContent`;

    const parts: any[] = [
      {
        text: 'Analyze these reference images. Describe the visual style, lighting, composition, mood, and any recurring visual motifs. Do not describe text, focus purely on aesthetics and visual elements. Provide a concise comma-separated list of visual descriptors.',
      },
    ];

    for (const imageUrl of imageUrls) {
      try {
        const imageParts = await fetchImageAsBase64Part(imageUrl);
        if (imageParts) {
          parts.push(imageParts);
        }
      } catch (err) {
        console.warn(`Failed to fetch reference image: ${imageUrl}`, err);
      }
    }

    const fetchHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (providerKind === 'openai_compatible') {
      fetchHeaders['Authorization'] = `Bearer ${this.apiKey}`;
    } else {
      // Google GenAI: key in header, never the URL query (avoids log leaks).
      fetchHeaders['x-goog-api-key'] = this.apiKey;
    }

    const fetchBody =
      providerKind === 'openai_compatible'
        ? {
            model: this.textModel,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Analyze these reference images. Describe the visual style, lighting, composition, mood, and any recurring visual motifs. Provide a concise comma-separated list of visual descriptors.',
                  },
                  ...imageUrls.map((img) => ({ type: 'image_url', image_url: { url: img } })),
                ],
              },
            ],
            temperature: 0.2,
          }
        : {
            contents: [{ parts }],
            generationConfig: { temperature: 0.2 },
          };

    const fetchOptions: RequestInit = {
      method: 'POST',
      headers: fetchHeaders,
      body: JSON.stringify(fetchBody),
    };
    if (signal) {
      fetchOptions.signal = signal;
    }

    try {
      const response = await fetch(url, fetchOptions);
      if (!response.ok) return '';
      const data: any = await response.json();
      if (providerKind === 'openai_compatible') {
        return data?.choices?.[0]?.message?.content ?? '';
      }
      return extractTextFromGemini(data);
    } catch {
      return '';
    }
  }
}

function shouldRequestOpenAiImageResponseFormat(imageModel: string): boolean {
  return !imageModel.trim().toLowerCase().startsWith('gpt-image');
}

/** Helper to fetch an image URL and format it for Gemini API request */
async function fetchImageAsBase64Part(url: string): Promise<any | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return {
      inlineData: {
        mimeType: contentType,
        data: base64,
      },
    };
  } catch (err) {
    console.error(`Failed to load reference image from URL: ${url}`, err);
    return null;
  }
}

function extractTextFromGemini(value: any): string {
  try {
    return value.candidates[0].content.parts[0].text;
  } catch {
    throw new Error('Malformed response from Gemini API');
  }
}

function extractTokenUsage(value: any) {
  const usage = value?.usageMetadata;
  const promptTokens = usage?.promptTokenCount ?? 0;
  const outputTokens = usage?.candidatesTokenCount ?? 0;
  const totalTokens = usage?.totalTokenCount ?? promptTokens + outputTokens;
  return { promptTokens, outputTokens, totalTokens };
}

/** Fallback generator: Maps keywords to curated high-quality stock photos or creates a custom SVG banner */
async function generateFallbackImage(prompt: string, template?: ContentTemplate): Promise<string> {
  const lowercasePrompt = prompt.toLowerCase();

  // Curated Unsplash images for common business/marketing leads keywords
  const curatedImages = [
    {
      keys: ['coffee', 'cafe', 'roaster', 'barista'],
      url: 'https://images.unsplash.com/photo-1507133750040-4a8f57021571?q=80&w=800&auto=format&fit=crop',
    },
    {
      keys: ['tech', 'software', 'app', 'coding', 'web'],
      url: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?q=80&w=800&auto=format&fit=crop',
    },
    {
      keys: ['law', 'lawyer', 'legal', 'court'],
      url: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?q=80&w=800&auto=format&fit=crop',
    },
    {
      keys: ['clinic', 'doctor', 'health', 'medical', 'hospital'],
      url: 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?q=80&w=800&auto=format&fit=crop',
    },
    {
      keys: ['gym', 'fitness', 'workout', 'sport'],
      url: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=800&auto=format&fit=crop',
    },
    {
      keys: ['restaurant', 'food', 'dine', 'eating'],
      url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=800&auto=format&fit=crop',
    },
    {
      keys: ['hotel', 'stay', 'travel', 'room'],
      url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?q=80&w=800&auto=format&fit=crop',
    },
    {
      keys: ['business', 'marketing', 'sales', 'corporate', 'meeting'],
      url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=800&auto=format&fit=crop',
    },
  ];

  const matched = curatedImages.find((item) => item.keys.some((k) => lowercasePrompt.includes(k)));

  if (matched) {
    // We fetch the matched Unsplash image and upload it to Supabase Storage to make it local to the team
    try {
      const response = await fetch(matched.url);
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const fileName = `stock-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
        const uploadedUrl = await uploadToSupabaseStorage(fileName, buffer, 'image/jpeg');
        if (uploadedUrl) return uploadedUrl;
      }
    } catch (err) {
      console.error('Failed to fetch/save curated stock photo fallback', err);
    }
    return matched.url;
  }

  const genericImages = [
    'https://images.unsplash.com/photo-1557804506-669a67965ba0?q=80&w=800&auto=format&fit=crop', // business
    'https://images.unsplash.com/photo-1497215842964-222b430dc094?q=80&w=800&auto=format&fit=crop', // office
    'https://images.unsplash.com/photo-1553877522-43269d4ea984?q=80&w=800&auto=format&fit=crop', // creative
  ];

  const randomUrl = genericImages[Math.floor(Math.random() * genericImages.length)] as string;

  try {
    const response = await fetch(randomUrl);
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const fileName = `stock-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
      const uploadedUrl = await uploadToSupabaseStorage(fileName, buffer, 'image/jpeg');
      if (uploadedUrl) return uploadedUrl;
    }
  } catch (err) {
    console.error('Failed to fetch/save generic stock photo fallback', err);
  }
  return randomUrl;
}
