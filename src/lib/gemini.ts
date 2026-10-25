import { Workspace, Idea, ContentItem } from '../types';

export interface GenerateOptions {
  model?: 'gemini-3.1-pro-preview' | 'gemini-3.5-flash' | 'gemini-3.1-flash-lite';
  prompt: string;
  systemInstruction?: string;
  responseMimeType?: 'application/json' | 'text/plain';
  temperature?: number;
  userId?: string;
}

export async function callGeminiApi(options: GenerateOptions): Promise<string> {
  const res = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: options.model || 'gemini-3.1-flash-lite',
      userId: options.userId,
      ...options,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `AI Request failed with status ${res.status}`);
  }

  const data = await res.json();
  return data.text || '';
}

export async function callGeminiChat(
  messages: { role: 'user' | 'assistant'; content: string }[],
  systemInstruction?: string,
  model: 'gemini-3.5-flash' | 'gemini-3.1-pro-preview' | 'gemini-3.1-flash-lite' = 'gemini-3.1-flash-lite',
  userId?: string
): Promise<string> {
  const res = await fetch('/api/gemini/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      systemInstruction,
      userId,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Chat Request failed with status ${res.status}`);
  }

  const data = await res.json();
  return data.text || '';
}

export async function callGeminiImageAnalysis(imageBase64: string, prompt: string, userId?: string): Promise<string> {
  const res = await fetch('/api/gemini/analyze-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, prompt, userId }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Image analysis failed with status ${res.status}`);
  }

  const data = await res.json();
  return data.text || '';
}

// System context builder for Brand Memory
export function buildBrandContextPrompt(workspace?: Workspace | null): string {
  if (!workspace) {
    return 'You are Flow AI, an expert social media and content marketing strategist.';
  }

  const { brandProfile, targetAudience, brandVoice, customVoiceStyle, forbiddenWords, products } = workspace;

  const productsText = (products || [])
    .map(
      (p, i) =>
        `${i + 1}. [${p.name}]: ${p.description || ''} | Features: ${p.features || ''} | Benefits: ${p.benefits || ''} | Audience: ${p.targetAudience || ''} | Main CTA: ${p.mainCta || ''}`
    )
    .join('\n');

  const forbiddenText = (forbiddenWords || []).length > 0 ? forbiddenWords.join(', ') : 'None';

  return `
[BRAND MEMORY CONTEXT]
Brand Name: ${brandProfile.brandName || 'Untitled Brand'}
Industry / Niche: ${brandProfile.industry || 'General'}
Business Description: ${brandProfile.businessDescription || 'Social content creator'}
Main Account Goal: ${brandProfile.mainGoal || 'Growth & Engagement'}
Primary Platform: ${brandProfile.primaryPlatform || 'Instagram'}
Content Language: ${brandProfile.contentLanguage || 'فارسی (Persian)'}

[BRAND VOICE & TONE]
Selected Voice: ${brandVoice || 'صمیمی و حرفه‌ای'}
Custom Style Guidelines: ${customVoiceStyle || 'طبیعی، پرانرژی، بدون کلیشه و بدون بزرگنمایی کاذب'}
STRICT FORBIDDEN WORDS / CLAIMS (NEVER USE THESE): ${forbiddenText}

[TARGET AUDIENCE]
Who they are: ${targetAudience.who || 'مخاطبان علاقه‌مند'}
Their Core Needs: ${targetAudience.needs || 'پیشرفت، راه‌حل‌های ساده و موثر'}
Pain Points: ${targetAudience.painPoints || 'کمبود زمان، سردرگمی، اطلاعات پراکنده'}
Interests: ${targetAudience.interests || 'محتوای ترند و آموزشی'}
Familiarity Level: ${targetAudience.familiarityLevel || 'متوسط'}
Buying Reasons: ${targetAudience.buyingReasons || 'کیفیت، پشتیبانی، سادگی کار'}

[PRODUCTS / SERVICES CATALOG]
${productsText || 'No specific product added yet.'}

[STRICT INSTRUCTIONS]
1. Write primarily in the designated Content Language (${brandProfile.contentLanguage || 'Persian'}).
2. Respect the Brand Voice and never violate the Forbidden Words.
3. Every hook must be punchy, curiosity-inducing, and avoid generic clickbait.
4. Output must be practical, ready to produce and shoot.
`.trim();
}
