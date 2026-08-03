import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';

// Lightweight AI helper used by the dashboard for three jobs:
//   action=calendar_plan  -> a 30-day content plan
//   action=newsletter     -> this week's newsletter draft
//   action=weekly_insight -> analytics summary + recommendations
//
// Calls Claude when ANTHROPIC_API_KEY is set; otherwise returns a
// deterministic stub so the UI works end-to-end in demo mode.
import {
  DEFAULT_CONTENT_PILLARS,
  DEFAULT_HOOK_STYLES,
  FORMATS,
} from '@shared/constants';

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { action, context } = await req.json().catch(() => ({ action: '', context: {} }));
  const key = process.env.ANTHROPIC_API_KEY;

  if (!key) {
    return NextResponse.json({ ok: true, mode: 'demo', data: stub(action) });
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt(action, context) }],
      }),
    });
    const json = await res.json();
    const text = json?.content?.[0]?.text ?? '';
    return NextResponse.json({ ok: true, mode: 'live', data: text || stub(action) });
  } catch (err) {
    return NextResponse.json({ ok: true, mode: 'fallback', data: stub(action), error: (err as Error).message });
  }
}

function prompt(action: string, context: unknown) {
  const base = `You are the AI brain for Stackd Studios' content engine. Pillars: ${DEFAULT_CONTENT_PILLARS.join(', ')}. Hook styles: ${DEFAULT_HOOK_STYLES.join(', ')}.`;
  if (action === 'calendar_plan')
    return `${base}\nReturn a JSON array of 30 items: {scheduled_date_offset:int (0-29), topic, content_pillar, format(one of ${FORMATS.join('|')})}. Only JSON.`;
  if (action === 'newsletter')
    return `${base}\nWrite this week's email newsletter (subject + body, friendly founder voice). Context: ${JSON.stringify(context)}`;
  return `${base}\nGiven this analytics context, summarize what's working and give 3 recommendations for next week. Context: ${JSON.stringify(context)}`;
}

function stub(action: string) {
  if (action === 'calendar_plan') {
    return Array.from({ length: 30 }, (_, i) => ({
      scheduled_date_offset: i,
      topic: `[Planned] ${['Automation tip', 'Build-in-public update', 'Client win story', 'Founder mindset', 'Tool tutorial'][i % 5]} #${i + 1}`,
      content_pillar: DEFAULT_CONTENT_PILLARS[i % DEFAULT_CONTENT_PILLARS.length],
      format: FORMATS[i % FORMATS.length],
    }));
  }
  if (action === 'newsletter') {
    return {
      subject: 'This week: the system that runs while you sleep',
      body: 'Hey {{first_name}},\n\nThis week we shipped 7 videos across 5 platforms — fully automated.\n\nHere are the 3 that broke out, and the hook each one used:\n\n1. "The 3-tool AI stack" — Bold Claim\n2. "Comment to client DM flow" — How-To Promise\n3. "Your CRM should fill itself" — Contrarian Take\n\nReply STACKD and I\'ll send you the blueprint.\n\n— Chanel, Stackd Studios',
    };
  }
  return {
    summary:
      'Short-form on TikTok and Instagram drove ~68% of total views this period, and "Bold Claim" hooks outperformed every other style on watch time. Your "AI Automation" pillar is your strongest converter — leads from those videos book calls at roughly 2x the rate of other pillars.',
    recommendations: [
      'Double down on Bold Claim hooks for short-form next week — aim for 4 of 7 videos.',
      'Repurpose your top AI Automation short into a LinkedIn long-form post; that pillar converts but is under-posted there.',
      'Two videos scored below the virality threshold and were flagged — rewrite their hooks before re-queueing.',
    ],
  };
}
