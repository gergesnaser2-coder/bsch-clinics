import { NextResponse } from 'next/server';
import { cmsService } from '@/services/cmsService';

export const revalidate = 60; // 60 seconds revalidation

export async function GET() {
  try {
    const content = await cmsService.getPublishedContent();
    return NextResponse.json({ success: true, ...content });
  } catch (error) {
    console.error('Error fetching CMS public content:', error);
    return NextResponse.json({ error: 'تعذر جلب محتوى الموقع' }, { status: 500 });
  }
}

