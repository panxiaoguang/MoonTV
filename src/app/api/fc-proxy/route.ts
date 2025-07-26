import { NextResponse } from 'next/server';

//export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json(
      { error: 'Missing url parameter' },
      { status: 400 }
    );
  }

  try {
    let targetUrl: string;

    // 如果URL包含 bilibili.com，需要通过 fc.lyz05.cn 获取重定向后的实际URL
    if (url.includes('bilibili.com')) {
      const fcUrl = `https://fc.lyz05.cn/?url=${url}`;

      // 使用 redirect: 'manual' 来手动处理重定向
      const fcResponse = await fetch(fcUrl, {
        redirect: 'manual',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        },
      });

      // 检查是否有重定向
      const location = fcResponse.headers.get('location');
      if (location && location.includes('comment.bilibili.com')) {
        // 直接请求重定向后的 bilibili 弹幕地址
        targetUrl = location;
      } else {
        // 如果没有重定向或不是预期的重定向，使用原始响应
        targetUrl = fcUrl;
      }
      // eslint-disable-next-line no-console
      //console.log('targetUrl', targetUrl);
    } else {
      // 非 bilibili URL，直接代理 fc.lyz05.cn
      targetUrl = `https://fc.lyz05.cn/?url=${url}`;
    }

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: response.statusText },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('content-type');

    // 读取响应内容而不是直接传递流
    const responseData = await response.text();

    const headers = new Headers();
    if (contentType) {
      headers.set('Content-Type', contentType);
    }

    headers.set('Cache-Control', 'public, max-age=3600');

    return new Response(responseData, {
      status: 200,
      headers,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('代理出错:', error);
    return NextResponse.json({ error: '代理出错' }, { status: 500 });
  }
}
