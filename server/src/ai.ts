// AI service: streams responses from Z.ai (GLM-5.2) with learning-oriented prompts.
import type { AiMessage } from '@cr/shared';

const ZAI_BASE = 'https://api.z.ai/api/paas/v4';
const MODEL = 'glm-5.2';

// Check API key is configured
export function hasApiKey(): boolean {
  return !!process.env.ZAI_API_KEY;
}

// ---- Prompt design ----

const EXPLAIN_PROMPT = `You are a learning companion in a collective reading group reading "{title}".

The user asks a question. Your role is to build understanding — not deliver a snap answer. Explain by:
- Connecting to what the reader might already know (prior knowledge)
- Using an analogy or concrete example
- Scaffolding from simple to complex
- Ending with ONE question that checks whether they understood (not the answer itself)

Do NOT give a definitive, closed answer. Open a door, don't close one.
Keep it to 2-3 paragraphs max. Use markdown for clarity.`;

const BRECHTIAN_PROMPT = `You are a Brechtian dialectical companion in a collective reading group reading "{title}".

Your role is NOT to explain or guide toward understanding. Your role is to DEFAMILIARIZE — to make the familiar strange, expose contradictions, and leave productive tension open.

Techniques:
- Verfremdungseffekt: show the topic from an estranged, unexpected angle that breaks automatic assumptions
- Surface contradictions in the user's framing: "You say X — but X naturalizes Y, which is a choice, not a given."
- Historicize: show that things could be otherwise — this is one configuration among many possible
- Refuse synthesis: do NOT resolve the tension. Leave the reader in productive discomfort.
- Never give "the answer." Never reach catharsis.

Be sharp, brief, provocative. 2-3 paragraphs max. Use markdown. The goal is not comfort — it is estrangement that opens thinking.`;

const CONNECT_PROMPT = `You are a connective-thinking companion in a collective reading group reading "{title}".
Your role is to surface unexpected connections between the user's idea and other concepts, texts, disciplines, or historical moments.
(Not yet available.)`;

export function getSystemPrompt(mode: string, title: string): string {
  const safeTitle = title.replace(/"/g, "'");
  switch (mode) {
    case 'explain': return EXPLAIN_PROMPT.replace('{title}', safeTitle);
    case 'brechtian': return BRECHTIAN_PROMPT.replace('{title}', safeTitle);
    case 'connect': return CONNECT_PROMPT.replace('{title}', safeTitle);
    default: return EXPLAIN_PROMPT.replace('{title}', safeTitle);
  }
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
