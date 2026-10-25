import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { CentralizedAIService } from './server/aiService';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '20mb' }));

// ---------------------------------------------------------------------------
// Centralized AI Service initialization
//
// Supports multiple keys via GEMINI_API_KEYS (comma-separated) for rotation.
// Falls back to single GEMINI_API_KEY if only one is configured.
// ---------------------------------------------------------------------------
const rawKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
const apiKeys = rawKeys
  .split(',')
  .map((k) => k.trim())
  .filter(Boolean);

if (apiKeys.length === 0) {
  console.warn(
    'WARNING: No GEMINI_API_KEY / GEMINI_API_KEYS configured. AI endpoints will fail.'
  );
}

const aiService = new CentralizedAIService(apiKeys);

// Helper: resolve client identifier (userId > header > IP)
const resolveUserId = (req: express.Request): string => {
  return (
    (req.body && (req.body as any).userId) ||
    req.headers['x-user-id'] ||
    req.ip ||
    'anonymous'
  );
};

const resolveIp = (req: express.Request): string => {
  return req.ip || req.socket.remoteAddress || 'unknown';
};

// ---------------------------------------------------------------------------
// POST /api/gemini/generate
// ---------------------------------------------------------------------------
app.post('/api/gemini/generate', async (req, res) => {
  try {
    const {
      model = 'gemini-3.5-flash',
      prompt,
      systemInstruction,
      responseMimeType,
      temperature = 0.7,
      userId,
    } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt' });
    }

    const contents = prompt;
    const config: any = {
      temperature,
    };
    if (systemInstruction) {
      config.systemInstruction = systemInstruction;
    }
    if (responseMimeType) {
      config.responseMimeType = responseMimeType;
    }

    try {
      const { text, usage } = await aiService.generateContent({
        endpoint: '/api/gemini/generate',
        model,
        contents,
        config,
        userId: userId || resolveUserId(req),
        ip: resolveIp(req),
      });
      return res.json({ text, usage });
    } catch (modelErr: any) {
      console.warn(
        `Model ${model} failed (${modelErr.message}). Retrying with gemini-3.1-flash-lite...`
      );
      if (model !== 'gemini-3.1-flash-lite') {
        const { text, usage } = await aiService.generateContent({
          endpoint: '/api/gemini/generate',
          model: 'gemini-3.1-flash-lite',
          contents: prompt,
          config: { temperature, systemInstruction, responseMimeType },
          userId: userId || resolveUserId(req),
          ip: resolveIp(req),
        });
        return res.json({ text, usage });
      }
      throw modelErr;
    }
  } catch (err: any) {
    console.error('Error generating content:', err);
    const isRateLimit =
      err?.message?.includes('Rate limit') ||
      err?.message?.includes('exhausted');
    return res.status(isRateLimit ? 429 : 500).json({
      error: err.message || 'AI Generation failed',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/gemini/chat
// ---------------------------------------------------------------------------
app.post('/api/gemini/chat', async (req, res) => {
  try {
    const {
      model = 'gemini-3.1-flash-lite',
      messages,
      systemInstruction,
      userId,
    } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Missing messages array' });
    }

    const formattedContents = messages.map((m: any) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content || m.text }],
    }));

    try {
      const { text, usage } = await aiService.generateContent({
        endpoint: '/api/gemini/chat',
        model,
        contents: formattedContents,
        config: systemInstruction ? { systemInstruction } : undefined,
        userId: userId || resolveUserId(req),
        ip: resolveIp(req),
      });
      return res.json({ text, usage });
    } catch (modelErr: any) {
      console.warn(
        `Chat model ${model} failed (${modelErr.message}). Retrying with gemini-3.1-flash-lite...`
      );
      if (model !== 'gemini-3.1-flash-lite') {
        const { text, usage } = await aiService.generateContent({
          endpoint: '/api/gemini/chat',
          model: 'gemini-3.1-flash-lite',
          contents: formattedContents,
          config: systemInstruction ? { systemInstruction } : undefined,
          userId: userId || resolveUserId(req),
          ip: resolveIp(req),
        });
        return res.json({ text, usage });
      }
      throw modelErr;
    }
  } catch (err: any) {
    console.error('Error in AI Copilot chat:', err);
    const isRateLimit =
      err?.message?.includes('Rate limit') ||
      err?.message?.includes('exhausted');
    return res.status(isRateLimit ? 429 : 500).json({
      error: err.message || 'Chat generation failed',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/gemini/analyze-image
// ---------------------------------------------------------------------------
app.post('/api/gemini/analyze-image', async (req, res) => {
  try {
    const {
      imageBase64,
      mimeType = 'image/jpeg',
      prompt =
        'Analyze this content screenshot/visual and extract actionable ideas, hook angles, and structure for social media content.',
      userId,
    } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Missing imageBase64' });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    try {
      const { text, usage } = await aiService.generateContent({
        endpoint: '/api/gemini/analyze-image',
        model: 'gemini-3.1-pro-preview',
        contents: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType,
            },
          },
          prompt,
        ],
        userId: userId || resolveUserId(req),
        ip: resolveIp(req),
      });
      return res.json({ text, usage });
    } catch (err: any) {
      console.warn(
        'analyze-image fallback to gemini-3.1-flash-image or flash-lite...'
      );
      const { text, usage } = await aiService.generateContent({
        endpoint: '/api/gemini/analyze-image',
        model: 'gemini-3.1-flash-image',
        contents: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType,
            },
          },
          prompt,
        ],
        userId: userId || resolveUserId(req),
        ip: resolveIp(req),
      });
      return res.json({ text, usage });
    }
  } catch (err: any) {
    console.error('Error in analyze-image:', err);
    const isRateLimit =
      err?.message?.includes('Rate limit') ||
      err?.message?.includes('exhausted');
    return res.status(isRateLimit ? 429 : 500).json({
      error: err.message || 'Image analysis failed',
    });
  }
});

// ---------------------------------------------------------------------------
// Debug / observability endpoints
// ---------------------------------------------------------------------------
app.get('/api/ai/stats', (_req, res) => {
  return res.json({
    cache: aiService.getCacheStats(),
    rateLimit: aiService.getRateLimitStats(),
    recentTokenLogs: aiService.getTokenLogs().slice(-50),
    keyCount: apiKeys.length,
  });
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Flow AI Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
