import { NextResponse } from 'next/server';
import https from 'https';

const SYSTEM_PROMPT = `You are a Brand Visibility Research Analyst. Answer the user's question about a brand/product in the same language as the question, then provide structured extraction.
Output ONLY a JSON object (no markdown, no extra text) with exactly these fields:
{"answer": "2-4 sentences direct answer", "competitors": ["competitor names mentioned, or empty array"], "sources": ["official URLs mentioned, or empty array"]}`;

function parseStructuredOutput(raw: string) {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        answer: parsed.answer || '',
        competitors: Array.isArray(parsed.competitors) ? parsed.competitors : [],
        sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      };
    }
  } catch (e) {}
  return { answer: raw, competitors: [], sources: [] };
}

function makeRequest(brand: string, question: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const data = JSON.stringify({
      model: 'Atria-Dawn',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `About "${brand}": ${question}` }
      ],
      temperature: 0,
    });

    const url = new URL();
    url.pathname = /chat/completions;
    url.hostname = new URL(process.env.INTERN_AI_BASE_URL + '/chat/completions').hostname;
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.INTERN_AI_API_KEY}`,
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: 20000,
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(responseData);
          const text = json.choices?.[0]?.message?.content || '';
          const parsed = parseStructuredOutput(text);
          resolve({ status: 'success', ...parsed, elapsedMs: Date.now() - start });
        } catch (e) {
          reject(new Error('JSON Parse Error: ' + responseData));
        }
      });
    });

    req.on('error', (e) => reject(new Error('Request Error: ' + e.message)));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request Timeout (20s)'));
    });

    req.write(data);
    req.end();
  });
}

async function askQuestion(brand: string, question: string) {
  try {
    return await makeRequest(brand, question);
  } catch (error: any) {
    return { status: 'error', error: error.message, elapsedMs: 0 };
  }
}

export async function POST(req: Request) {
  const { brand } = await req.json();
  if (!brand) return NextResponse.json({ error: 'Brand is required' }, { status: 400 });

  const [what, competitors, sources] = await Promise.all([
    askQuestion(brand, 'What is it?'),
    askQuestion(brand, 'Who are the competitors?'),
    askQuestion(brand, 'What are the official sources?'),
  ]);

  return NextResponse.json({ what, competitors, sources });
}