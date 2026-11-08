import { NextResponse } from 'next/server';
}

export const runtime = 'nodejs';

const SYSTEM_PROMPT = `You are a Brand Visibility Research Analyst. Answer the user's question about a brand/product in the same language as the question, then provide structured extraction.
Output ONLY a JSON object (no markdown, no extra text) with exactly these fields:
{"answer": "2-4 sentences direct answer", "competitors": ["competitor names mentioned, or empty array"], "sources": ["official URLs mentioned, or empty array"]}`;

export async function POST(req: Request) {
  try {
    const { brand } = await req.json();
    if (!brand) return NextResponse.json({ error: 'Brand is required' }, { status: 400 });

    const baseUrl = process.env.INTERN_AI_BASE_URL || 'https://discovery-api.intern-ai.org.cn/v1';
    
    const ask = async (q: string) => {
      const start = Date.now();
      try {
        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.INTERN_AI_API_KEY}`
          },
          body: JSON.stringify({
            model: 'Atria-Dawn',
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: `About "${brand}": ${q}` }
            ],
            temperature: 0,
          })
        });
        
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`API returned ${res.status}: ${errText}`);
        }

        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || '';
        
        try {
          const match = text.match(/\{[\s\S]*\}/);
          if (match) return { status: 'success', ...JSON.parse(match[0]), elapsedMs: Date.now() - start };
        } catch (e) {}
        
        return { status: 'success', answer: text, competitors: [], sources: [], elapsedMs: Date.now() - start };
      } catch (e: any) {
        return { status: 'error', error: e.message, elapsedMs: Date.now() - start };
      }
    };

    const [what, competitors, sources] = await Promise.all([
      ask('What is it?'),
      ask('Who are the competitors?'),
      ask('What are the official sources?'),
    ]);

    return NextResponse.json({ what, competitors, sources });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}