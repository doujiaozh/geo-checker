import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.INTERN_AI_API_KEY || '',
  baseURL: process.env.INTERN_AI_BASE_URL || 'https://discovery-api.intern-ai.org.cn/v1',
});

const SYSTEM_PROMPT = `你是品牌可见性研究分析师。用与用户提问相同的语言、简洁客观地回答用户关于某个品牌或产品的问题，然后给出结构化抽取。
只输出一个 JSON 对象（不要 markdown 代码块、不要任何额外文本），包含且仅包含以下字段：
{"answer": "对问题的 2-4 句直接回答", "competitors": ["回答中明确提及的竞争对手或替代品名称，没有则为空数组"], "sources": ["回答所依据的官方网站、文档或权威来源 URL，没有则为空数组"]}`;

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

async function askQuestion(brand: string, question: string) {
  const start = Date.now();
  try {
    const response = await openai.chat.completions.create({
      model: 'Atria-Dawn', 
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `关于“${brand}”：${question}` }
      ],
      temperature: 0,
    });
    
    const text = response.choices[0]?.message?.content || '';
    const parsed = parseStructuredOutput(text);
    
    return {
      status: 'success',
      ...parsed,
      elapsedMs: Date.now() - start
    };
  } catch (error: any) {
    return { status: 'error', error: error.message, elapsedMs: Date.now() - start };
  }
}

export async function POST(req: Request) {
  const { brand } = await req.json();
  if (!brand) return NextResponse.json({ error: 'Brand is required' }, { status: 400 });

  const [what, competitors, sources] = await Promise.all([
    askQuestion(brand, '是什么'),
    askQuestion(brand, '的竞品有哪些'),
    askQuestion(brand, '的官方来源是什么'),
  ]);

  return NextResponse.json({ what, competitors, sources });
}