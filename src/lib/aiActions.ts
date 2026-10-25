import {
  callGeminiApi,
  buildBrandContextPrompt,
} from './gemini';
import {
  Workspace,
  Idea,
  ContentItem,
  ReelBlueprint,
  CarouselSlide,
  StoryStep,
} from '../types';

function parseJsonSafe<T>(raw: string, fallback: T): T {
  try {
    let clean = raw.trim();
    // remove markdown fences if present
    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    return JSON.parse(clean);
  } catch (err) {
    console.warn('Failed to parse JSON response:', raw);
    return fallback;
  }
}

// 1. Generate Ideas
export async function generateAIIdeas(
  workspace: Workspace | null,
  params: {
    topic: string;
    productName?: string;
    goal: string;
    contentType: 'reel' | 'carousel' | 'story' | 'all';
    category?: string;
    count: number;
  }
): Promise<Array<{ title: string; description: string; contentType: 'reel' | 'carousel' | 'story'; contentPillar: string; category: string; goal: string }>> {
  const brandPrompt = buildBrandContextPrompt(workspace);
  const prompt = `
Generate ${params.count} high-performing content ideas based on the brand memory.
User request topic: "${params.topic || 'Best content ideas for this week'}"
Target Product / Service: "${params.productName || 'Any core brand offering'}"
Primary Goal: "${params.goal || 'Engagement & Growth'}"
Target Format: "${params.contentType}"
Category / Pillar: "${params.category || 'آموزشی و اعتمادسازی'}"

Return a valid JSON array of objects with the exact schema:
[
  {
    "title": "Clear punchy headline or hook angle",
    "description": "Outline of the idea, what makes it engaging and what value is delivered",
    "contentType": "reel" | "carousel" | "story",
    "contentPillar": "آموزشی" | "اعتمادسازی" | "فروش" | "Engagement" | "Branding" | "Storytelling",
    "category": "String category name",
    "goal": "Primary goal of this idea"
  }
]
`;

  const res = await callGeminiApi({
    model: 'gemini-3.1-flash-lite',
    userId: workspace?.userId,
    prompt,
    systemInstruction: brandPrompt,
    responseMimeType: 'application/json',
    temperature: 0.8,
  });

  return parseJsonSafe(res, []);
}

// 2. Generate More Ideas Like This
export async function generateMoreIdeasLikeThis(
  workspace: Workspace | null,
  baseIdea: Idea
): Promise<Array<{ title: string; description: string; contentType: 'reel' | 'carousel' | 'story'; contentPillar: string; category: string; goal: string }>> {
  const brandPrompt = buildBrandContextPrompt(workspace);
  const prompt = `
Generate 3 variations / spin-off content ideas that are similar in spirit, angle, and audience appeal to this existing successful idea:
Title: "${baseIdea.title}"
Description: "${baseIdea.description}"
Format: "${baseIdea.contentType}"
Pillar: "${baseIdea.contentPillar}"

Return a valid JSON array:
[
  {
    "title": "Variation headline",
    "description": "Detailed premise and value angle",
    "contentType": "${baseIdea.contentType}",
    "contentPillar": "${baseIdea.contentPillar}",
    "category": "${baseIdea.category || 'محتوای مشابه'}",
    "goal": "${baseIdea.goal || 'تعامل و ارزش‌آفرینی'}"
  }
]
`;

  const res = await callGeminiApi({
    model: 'gemini-3.1-flash-lite',
    userId: workspace?.userId,
    prompt,
    systemInstruction: brandPrompt,
    responseMimeType: 'application/json',
    temperature: 0.85,
  });

  return parseJsonSafe(res, []);
}

// 3. Generate Multiple Hooks (Low-latency with gemini-3.1-flash-lite)
export async function generateAIHooks(
  workspace: Workspace | null,
  ideaOrTopic: string,
  style: string = 'Storytelling',
  count: number = 4
): Promise<string[]> {
  const brandPrompt = buildBrandContextPrompt(workspace);
  const prompt = `
Generate ${count} compelling, viral, high-converting hooks for this content premise:
"${ideaOrTopic}"
Selected Copywriting Style: "${style}"

Criteria:
- The hook must stop the thumb in the first 3 seconds (scroll-stopping).
- Evoke deep curiosity, a relatable problem, a bold question, or an unexpected contrarian fact.
- Strictly adhere to brand tone and forbidden words.

Return a JSON array of strings:
["Hook 1...", "Hook 2...", "Hook 3...", "Hook 4..."]
`;

  const res = await callGeminiApi({
    model: 'gemini-3.1-flash-lite',
    userId: workspace?.userId,
    prompt,
    systemInstruction: brandPrompt,
    responseMimeType: 'application/json',
    temperature: 0.8,
  });

  return parseJsonSafe(res, [
    '۳ اشتباهی که اکثر افراد در این زمینه مرتکب می‌شوند!',
    'اگر این نکته رو نمی‌دونستی، نیمی از مسیر رو اشتباه رفتی...',
    'چطور بدون اتلاف وقت به این نتیجه برسیم؟',
    'این راز ساده رو هیچکس بهت نمی‌گه!',
  ]);
}

// 4. Generate Full Scenario (Complex Reasoning with gemini-3.1-pro-preview)
export async function generateAIScenario(
  workspace: Workspace | null,
  params: {
    title: string;
    description: string;
    style: string;
    goal: string;
    productName?: string;
    selectedHook?: string;
  }
): Promise<{
  hook: string;
  hooks: string[];
  scenarioText: string;
  caption: string;
  hashtags: string[];
  cta: string;
}> {
  const brandPrompt = buildBrandContextPrompt(workspace);
  const prompt = `
Create a comprehensive production-ready script / scenario for this content idea.
Title: "${params.title}"
Outline: "${params.description}"
Copywriting Style: "${params.style || 'Storytelling'}"
Goal: "${params.goal || 'آموزش و ایجاد نیاز'}"
Product/Offer: "${params.productName || 'General service'}"
Preferred Hook (if any): "${params.selectedHook || ''}"

Return a valid JSON object matching:
{
  "hook": "The best selected opening hook",
  "hooks": ["Alternative Hook 1", "Alternative Hook 2", "Alternative Hook 3"],
  "scenarioText": "Complete step-by-step spoken script or slide breakdown, structured logically with Hook -> Problem/Insight -> Core Value -> Solution -> Transition",
  "caption": "A polished social media caption matching the brand tone with paragraph spacing and formatting",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5", "hashtag6"],
  "cta": "Clear call to action aligned with the goal"
}
`;

  const res = await callGeminiApi({
    model: 'gemini-3.1-flash-lite',
    userId: workspace?.userId,
    prompt,
    systemInstruction: brandPrompt,
    responseMimeType: 'application/json',
    temperature: 0.7,
  });

  return parseJsonSafe(res, {
    hook: params.selectedHook || params.title,
    hooks: [params.title],
    scenarioText: params.description,
    caption: params.description,
    hashtags: ['تولید_محتوا', 'رشد_کسب_و_کار', 'آموزش'],
    cta: 'نظرت رو توی کامنت‌ها برام بنویس!',
  });
}

// 5. Rewrite Scenario Action (Low-latency with gemini-3.1-flash-lite)
export async function rewriteAIScenario(
  workspace: Workspace | null,
  text: string,
  action: 'shorter' | 'longer' | 'catchy' | 'friendly' | 'expert' | 'simple' | 'regenerate'
): Promise<string> {
  const brandPrompt = buildBrandContextPrompt(workspace);

  const actionMap = {
    shorter: 'کوتاه‌تر و فشرده‌تر کن (حذف شاخ و برگ‌های اضافی، جملات ضربه‌ای)',
    longer: 'با جزئیات بیشتر و توضیحات عمیق‌تر بنویس (داستان‌پردازی غنی‌تر)',
    catchy: 'جذاب‌تر، پرانرژی‌تر و ترغیب‌کننده‌تر کن (تزریق قلاب‌های هیجانی)',
    friendly: 'بسیار صمیمی، خودمانی و نزدیک به مخاطب بازنویسی کن',
    expert: 'تخصصی، مستند، باوقار و حرفه‌ای‌تر کن',
    simple: 'فوق‌العاده ساده، روان و قابل‌فهم برای هر سطحی از مخاطب بنویس',
    regenerate: 'با یک زاویه دید کاملاً نو و خلاقانه از اول بنویس',
  };

  const instruction = actionMap[action] || 'بازنویسی روان و جذاب';

  const prompt = `
Rewrite the following script / scenario text based strictly on this instruction:
Instruction: "${instruction}"

Original Text:
"""
${text}
"""

Output ONLY the rewritten text without markdown fences or meta commentary.
`;

  return await callGeminiApi({
    model: 'gemini-3.1-flash-lite',
    userId: workspace?.userId,
    prompt,
    systemInstruction: brandPrompt,
    temperature: 0.75,
  });
}

// 6. Generate Reel Blueprint (gemini-3.5-flash)
export async function generateAIReelBlueprint(
  workspace: Workspace | null,
  ideaOrScenario: {
    title: string;
    scenarioText?: string;
    duration: '15 sec' | '30 sec' | '45 sec' | '60 sec' | 'Custom';
  }
): Promise<ReelBlueprint> {
  const brandPrompt = buildBrandContextPrompt(workspace);
  const prompt = `
Create an exact, cinematic Reel Blueprint for a ${ideaOrScenario.duration} short-form video.
Title: "${ideaOrScenario.title}"
Reference Script / Concept: "${ideaOrScenario.scenarioText || ''}"

Return a valid JSON object matching:
{
  "duration": "${ideaOrScenario.duration}",
  "hook": "First 3 seconds spoken hook & visual trigger",
  "scenario": "Complete narrative structure",
  "voiceover": "Full spoken word-for-word voiceover text timed appropriately for ${ideaOrScenario.duration}",
  "onScreenText": "Key keywords and subtitles to display on screen",
  "cta": "Final 3-5 seconds closing call to action",
  "timecodes": [
    {
      "timeRange": "00:00 - 00:03",
      "title": "Hook & Pattern Interrupt",
      "description": "Visual action and hook statement",
      "shotType": "Talking Head" | "B-Roll" | "Screen Share" | "Product Close-up",
      "onScreenText": "Text on screen",
      "voiceover": "Exact spoken words"
    },
    {
      "timeRange": "00:03 - 00:10",
      "title": "Problem / Pain Point Setup",
      "description": "What is shown",
      "shotType": "B-Roll",
      "onScreenText": "Key bullet",
      "voiceover": "Spoken explanation"
    },
    {
      "timeRange": "00:10 - 00:25",
      "title": "The Core Solution & Demonstration",
      "description": "Step 1 & Step 2 visual action",
      "shotType": "Talking Head",
      "onScreenText": "Highlight value",
      "voiceover": "Spoken value delivery"
    },
    {
      "timeRange": "00:25 - 00:30",
      "title": "Call To Action & Save Trigger",
      "description": "Point to caption or comment prompt",
      "shotType": "Talking Head",
      "onScreenText": "SAVE FOR LATER",
      "voiceover": "CTA voiceover"
    }
  ],
  "shootingTips": [
    "Lighting recommendation",
    "Camera framing / eye contact tip",
    "B-roll asset suggestion"
  ],
  "editingTips": [
    "Cut pace recommendation",
    "Sound design / music vibe",
    "Text animation & zoom style"
  ]
}
`;

  const res = await callGeminiApi({
    model: 'gemini-3.1-flash-lite',
    userId: workspace?.userId,
    prompt,
    systemInstruction: brandPrompt,
    responseMimeType: 'application/json',
    temperature: 0.7,
  });

  return parseJsonSafe(res, {
    duration: ideaOrScenario.duration,
    hook: ideaOrScenario.title,
    scenario: ideaOrScenario.scenarioText || ideaOrScenario.title,
    voiceover: ideaOrScenario.scenarioText || ideaOrScenario.title,
    onScreenText: ideaOrScenario.title,
    cta: 'سیو کن تا یادت نره!',
    timecodes: [
      {
        timeRange: '00:00 - 00:03',
        title: 'Hook',
        description: 'شروع مستقیم با نگاه به دوربین',
        shotType: 'Talking Head',
        onScreenText: ideaOrScenario.title,
        voiceover: ideaOrScenario.title,
      },
      {
        timeRange: '00:03 - 00:25',
        title: 'ارائه ارزش',
        description: 'توضیح مرحله به مرحله راه‌حل',
        shotType: 'Talking Head',
        onScreenText: 'نکته کلیدی',
        voiceover: ideaOrScenario.scenarioText || 'توضیح کامل تکنیک',
      },
      {
        timeRange: '00:25 - 00:30',
        title: 'CTA',
        description: 'اشاره به دکمه ذخیره و کامنت',
        shotType: 'Talking Head',
        onScreenText: 'حتما سیو کن',
        voiceover: 'این ویدیو رو برای دوستت بفرست یا سیو کن!',
      },
    ],
    shootingTips: ['نور طبیعی روبرو', 'کادربندی عمودی ۹:۱۶'],
    editingTips: ['کات‌های سریع هر ۳ ثانیه', 'زیرنویس برجسته'],
  });
}

// 7. Generate Carousel Slides (gemini-3.1-pro-preview)
export async function generateAICarouselSlides(
  workspace: Workspace | null,
  ideaOrTopic: {
    title: string;
    description?: string;
    slideCount?: number;
  }
): Promise<{
  scrollStopHooks: string[];
  slides: CarouselSlide[];
}> {
  const brandPrompt = buildBrandContextPrompt(workspace);
  const totalSlides = ideaOrTopic.slideCount || 6;

  const prompt = `
Create an engaging, slide-by-slide Carousel layout for Instagram.
Title: "${ideaOrTopic.title}"
Context / Description: "${ideaOrTopic.description || ''}"
Target slide count: ${totalSlides} slides

Structure:
- Slide 1: Hook (Scroll stopper, intriguing title, sub-headline)
- Slide 2: Context / Problem (Why this matters right now)
- Slides 3 to ${totalSlides - 1}: Main Content / Steps / Framework
- Slide ${totalSlides}: Final CTA (Save, Share, Action prompt)

Return a valid JSON object:
{
  "scrollStopHooks": [
    "Scroll-stopping Title Option 1",
    "Scroll-stopping Title Option 2",
    "Scroll-stopping Title Option 3"
  ],
  "slides": [
    {
      "slideNumber": 1,
      "type": "hook",
      "title": "Main Punchy Title",
      "body": "Subtext or curiosity hook",
      "visualSuggestion": "Minimalist graphic or high-contrast typography design suggestion"
    }
  ]
}
`;

  const res = await callGeminiApi({
    model: 'gemini-3.1-flash-lite',
    userId: workspace?.userId,
    prompt,
    systemInstruction: brandPrompt,
    responseMimeType: 'application/json',
    temperature: 0.75,
  });

  return parseJsonSafe(res, {
    scrollStopHooks: [ideaOrTopic.title],
    slides: [
      {
        slideNumber: 1,
        type: 'hook',
        title: ideaOrTopic.title,
        body: 'ورق بزنید تا ۳ نکته کلیدی رو ببینید',
        visualSuggestion: 'تیتر درشت وسط کادر با رنگ تم برند',
      },
      {
        slideNumber: 2,
        type: 'context',
        title: 'مشکل کجاست؟',
        body: 'بسیاری از افراد وقت زیادی تلف می‌کنند بدون اینکه نتیجه ملموسی بگیرند.',
        visualSuggestion: 'آیکون اخطار یا تضاد بصری',
      },
      {
        slideNumber: 3,
        type: 'content',
        title: 'گام اول: تمرکز روی اصل ماجرا',
        body: 'به‌جای پراکنده‌کاری، یک هدف مشخص انتخاب کنید.',
        visualSuggestion: 'باکس شماره‌دار تمیز',
      },
      {
        slideNumber: 4,
        type: 'cta',
        title: 'سیو کن تا موقع نیاز پیداش کنی!',
        body: 'برای اطلاعات بیشتر کلمه آموزش رو دایرکت کن.',
        visualSuggestion: 'فلش به سمت پایین و دکمه سیو',
      },
    ],
  });
}

// 8. Generate Story Sequence (gemini-3.5-flash)
export async function generateAIStorySequence(
  workspace: Workspace | null,
  params: {
    topic: string;
    goal: string;
    productName?: string;
    storyType: 'Educational' | 'Engagement' | 'Sales' | 'Storytelling' | 'FAQ';
    sourceContentTitle?: string;
  }
): Promise<StoryStep[]> {
  const brandPrompt = buildBrandContextPrompt(workspace);
  const prompt = `
Create a compelling 5-step Instagram Story Sequence.
Topic: "${params.topic}"
Goal: "${params.goal}"
Type: "${params.storyType}"
Product/Offer: "${params.productName || 'None'}"
${params.sourceContentTitle ? `This is a supporting companion story sequence for the post: "${params.sourceContentTitle}"` : ''}

Sequence Flow:
1. Story 1: Hook (Catch attention, relatable question or shocker)
2. Story 2: Problem / Agitation (Deepen the empathy or curiosity)
3. Story 3: Value / Discovery (The insight, tip, or behind-the-scenes)
4. Story 4: Interaction Sticker (Poll, Question box, Slider, or Quiz to boost engagement algorithm)
5. Story 5: Call to Action (DM, Link sticker, or Offer claim)

Return a valid JSON array of objects:
[
  {
    "stepNumber": 1,
    "type": "Hook",
    "title": "Story headline",
    "text": "Exact text or talking points to put on story",
    "interactionType": "Poll" | "Question Box" | "Quiz" | "Emoji Slider" | "DM Keyword",
    "interactionDetails": "Sticker text or options (e.g. Yes / No or Question prompt)",
    "visualSuggestion": "Selfie video / Graphic background / Photo suggestion"
  }
]
`;

  const res = await callGeminiApi({
    model: 'gemini-3.1-flash-lite',
    userId: workspace?.userId,
    prompt,
    systemInstruction: brandPrompt,
    responseMimeType: 'application/json',
    temperature: 0.75,
  });

  return parseJsonSafe(res, []);
}

// 9. Generate AI Weekly Content Planner (gemini-3.5-flash)
export async function generateAIWeeklyPlanner(
  workspace: Workspace | null,
  startDateStr?: string
): Promise<
  Array<{
    dayName: string;
    date: string;
    title: string;
    contentType: 'reel' | 'carousel' | 'story';
    pillar: string;
    goal: string;
    brief: string;
    suggestedTime: string;
  }>
> {
  const brandPrompt = buildBrandContextPrompt(workspace);
  const prompt = `
Generate a cohesive 7-day social media publishing plan for the upcoming week based on the brand's memory, audience, and products.
Start Date: ${startDateStr || 'Next Saturday'}

Mix of content:
- Day 1: Reel (Educational / Viral Hook)
- Day 2: Story Sequence (Engagement / Poll / Community)
- Day 3: Carousel (Authority / In-depth Guide)
- Day 4: Story (Behind the scenes / Value)
- Day 5: Reel (Trust building / Social proof / Problem-Solution)
- Day 6: Carousel or Reel (Product / Soft-selling)
- Day 7: Story Sequence (Direct Sales / CTA / Q&A)

Return a valid JSON array of 7 items matching:
[
  {
    "dayName": "شنبه (Saturday)",
    "date": "YYYY-MM-DD",
    "title": "Catchy content title",
    "contentType": "reel" | "carousel" | "story",
    "pillar": "آموزشی" | "اعتمادسازی" | "فروش" | "تعامل",
    "goal": "Primary goal",
    "brief": "Brief description of the script and visual",
    "suggestedTime": "19:30"
  }
]
`;

  const res = await callGeminiApi({
    model: 'gemini-3.1-flash-lite',
    userId: workspace?.userId,
    prompt,
    systemInstruction: brandPrompt,
    responseMimeType: 'application/json',
    temperature: 0.75,
  });

  return parseJsonSafe(res, []);
}

// 10. Dashboard Quick Create AI
export async function quickDashboardAI(
  workspace: Workspace | null,
  userPrompt: string
): Promise<{
  title: string;
  contentType: 'reel' | 'carousel' | 'story' | 'scenario';
  hook: string;
  description: string;
  scenarioText: string;
  caption: string;
  cta: string;
  hashtags: string[];
}> {
  const brandPrompt = buildBrandContextPrompt(workspace);
  const prompt = `
The user asked in the central Quick Create bar: "${userPrompt}"
Based on Brand Memory, intelligently formulate an actionable ready-to-run content piece.
Determine the most effective contentType ('reel', 'carousel', or 'story').

Return a JSON object:
{
  "title": "Punchy Title",
  "contentType": "reel" | "carousel" | "story" | "scenario",
  "hook": "Strong opening hook",
  "description": "Summary of concept",
  "scenarioText": "Ready-to-use scenario or outline",
  "caption": "Suggested caption",
  "cta": "Clear call to action",
  "hashtags": ["tag1", "tag2", "tag3"]
}
`;

  const res = await callGeminiApi({
    model: 'gemini-3.1-flash-lite',
    userId: workspace?.userId,
    prompt,
    systemInstruction: brandPrompt,
    responseMimeType: 'application/json',
    temperature: 0.7,
  });

  return parseJsonSafe(res, {
    title: userPrompt,
    contentType: 'reel',
    hook: userPrompt,
    description: userPrompt,
    scenarioText: userPrompt,
    caption: userPrompt,
    cta: 'برای جزئیات بیشتر کامنت بگذارید!',
    hashtags: ['آموزش', 'رشد', 'ایده'],
  });
}
