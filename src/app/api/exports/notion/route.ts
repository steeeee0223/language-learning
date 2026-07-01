import { NextResponse } from 'next/server.js';

import { lessonToPlainText } from '@/lib/lesson-content.ts';
import { getErrorMessage, jsonError } from '@/lib/server/http.ts';
import { readLesson } from '@/lib/server/lessons.ts';

export async function POST(request: Request) {
  try {
    const apiKey = process.env.NOTION_API_KEY;
    const parentPageId = process.env.NOTION_PARENT_PAGE_ID;

    if (!apiKey || !parentPageId) {
      return jsonError('NOTION_API_KEY and NOTION_PARENT_PAGE_ID are required for Notion export.', 503);
    }

    const payload = await request.json();
    if (!payload || typeof payload.slug !== 'string') {
      return jsonError('A lesson slug is required.');
    }

    const lesson = await readLesson({ slug: payload.slug });
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        parent: { page_id: parentPageId },
        properties: {
          title: {
            title: [{ text: { content: lesson.title } }],
          },
        },
        children: [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                { type: 'text', text: { content: lessonToPlainText(lesson.content).slice(0, 1900) } },
              ],
            },
          },
        ],
      }),
    });

    const notionPayload = await response.json();
    if (!response.ok) {
      return jsonError(getErrorMessage(new Error(notionPayload.message ?? 'Notion export failed.')), response.status);
    }

    return NextResponse.json({ url: notionPayload.url });
  } catch (error) {
    return jsonError(getErrorMessage(error));
  }
}
