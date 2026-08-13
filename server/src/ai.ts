// AI service: streams responses from Z.ai (GLM-5.2) with learning-oriented prompts.
// Prompts are loaded from prompts.json at the project root so they can be
// edited without touching code. Restart the server after editing prompts.json.
import type { AiMessage } from '@cr/shared';

const ZAI_BASE = 'https://api.z.ai/api/paas/v4';
const MODEL = 'glm-5.2';

// ---- Load prompt config from prompts.json ----

interface ModeConfig {
  label: string;
  placeholder: string;
  available: boolean;
  systemPrompt: string[];
}

interface PromptsConfig {
  modes: Record<string, ModeConfig>;
}

let _promptsConfig: PromptsConfig | null = null;

async function loadPromptsConfig(): Promise<PromptsConfig> {
  if (_promptsConfig) return _promptsConfig;
  try {
    // Try project root (one level up from server/)
    const text = await Bun.file('../prompts.json').text();
    _promptsConfig = JSON.parse(text);
  } catch {
    try {
      // Fallback: CWD
      const text = await Bun.file('prompts.json').text();
      _promptsConfig = JSON.parse(text);
    } catch {
      console.error('⚠ Could not load prompts.json — using empty config');
      _promptsConfig = { modes: {} };
    }
  }
  return _promptsConfig;
}

// Synchronous access for getSystemPrompt (config is loaded at startup)
export async function getModeConfig(mode: string): Promise<ModeConfig | null> {
  const cfg = await loadPromptsConfig();
  return cfg.modes[mode] ?? null;
}

export async function getAllModes(): Promise<Record<string, ModeConfig>> {
  const cfg = await loadPromptsConfig();
  return cfg.modes;
}

// Check API key is configured
export function hasApiKey(): boolean {
  return !!process.env.ZAI_API_KEY;
}

// Build the system prompt for a mode, substituting {title} with the document title.
export async function getSystemPrompt(mode: string, title: string): Promise<string> {
  const safeTitle = title.replace(/"/g, "'");
  const modeCfg = await getModeConfig(mode);
  if (!modeCfg) {
    // Fallback to explain if the mode doesn't exist
    const explain = await getModeConfig('explain');
    if (explain) return explain.systemPrompt.join('\n\n').replace('{title}', safeTitle);
    return `You are a learning companion reading "${safeTitle}".`;
  }
  return modeCfg.systemPrompt.join('\n\n').replace('{title}', safeTitle);
}

// Build the messages array for the Z.ai API
export function buildMessages(systemPrompt: string, history: AiMessage[], userMessage: string) {
  const messages: { role: string; content: string }[] = [
    { role: 'system', content: systemPrompt },
  ];
  for (const m of history) {
    messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: 'user', content: userMessage });
  return messages;
}

// Stream a chat completion from Z.ai.
// Calls onToken for each token chunk, returns the full text when done.
export async function streamChat(
  systemPrompt: string,
  history: AiMessage[],
  userMessage: string,
  onToken: (token: string) => void,
): Promise<string> {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) throw new Error('ZAI_API_KEY not configured. Add it to .env');

  const messages = buildMessages(systemPrompt, history, userMessage);

  const res = await fetch(`${ZAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      stream: true,
      temperature: 0.8,
      max_tokens: 600,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Z.ai API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  if (!res.body) throw new Error('No response body from Z.ai');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Parse SSE lines: lines starting with "data: "
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? ''; // keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        const token = parsed.choices?.[0]?.delta?.content;
        if (token) {
          fullText += token;
          onToken(token);
        }
      } catch {
        // skip malformed chunks
      }
    }
  }

  return fullText;
}
