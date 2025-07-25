import { NextResponse } from 'next/server';

export const runtime = 'edge';

interface SearchResult {
  vod_id: number;
  vod_name: string;
  type_id: number;
  type_name: string;
  vod_time: string;
  vod_remarks: string;
}

interface DetailResult {
  vod_id: number;
  vod_name: string;
  vod_year: string;
  vod_play_url: string;
  type_name: string;
}

interface SearchResponse {
  code: number;
  list: SearchResult[];
}

interface DetailResponse {
  code: number;
  list: DetailResult[];
}

function findBestMatch(
  results: SearchResult[],
  year?: string,
  stype?: string
): SearchResult | null {
  if (results.length === 0) return null;
  if (results.length === 1) return results[0];

  let filtered = results;

  // 按类型过滤
  if (stype) {
    const movieTypes = [
      '电影',
      '动作片',
      '喜剧片',
      '爱情片',
      '科幻片',
      '剧情片',
      '战争片',
      '犯罪片',
      '惊悚片',
      '冒险片',
      '悬疑片',
      '奇幻片',
      '纪录片',
      '其他片',
      '动画片',
    ];
    const tvTypes = [
      '电视剧',
      '国产剧',
      '港台剧',
      '欧美剧',
      '日韩剧',
      '其他剧',
    ];

    if (stype === 'movie') {
      filtered = filtered.filter((item) => movieTypes.includes(item.type_name));
    } else if (stype === 'tv') {
      filtered = filtered.filter((item) => tvTypes.includes(item.type_name));
    }
  }

  // 按年份过滤
  if (year && filtered.length > 1) {
    const yearMatches = filtered.filter((item) => {
      const itemYear = new Date(item.vod_time).getFullYear().toString();
      return itemYear === year;
    });

    if (yearMatches.length > 0) {
      filtered = yearMatches;
    }
  }

  // 如果还有多个结果，按vod_time降序排序（最新的在前）
  if (filtered.length > 1) {
    filtered.sort((a, b) => {
      const timeA = new Date(a.vod_time).getTime();
      const timeB = new Date(b.vod_time).getTime();
      return timeB - timeA; // 降序排序，最新的在前
    });
  }

  // 返回第一个匹配项或原始第一项
  return filtered.length > 0 ? filtered[0] : results[0];
}

function parsePlayUrls(vod_play_url: string): Record<string, string> {
  const episodes: Record<string, string> = {};

  if (!vod_play_url) return episodes;

  const episodeEntries = vod_play_url.split('#');

  for (const entry of episodeEntries) {
    const [episode, url] = entry.split('$');
    if (episode && url) {
      // 处理episode名称
      const processedEpisode = episode.trim();

      // 检查是否是纯数字字符串
      if (/^\d+$/.test(processedEpisode)) {
        // 已经是纯数字，直接使用
        episodes[processedEpisode] = url;
      } else if (/\d+/.test(processedEpisode)) {
        // 包含数字的字符串，提取数字部分
        const match = processedEpisode.match(/\d+/);
        if (match) {
          episodes[match[0]] = url;
        }
      } else {
        // 纯文字，统一改为"1"
        episodes['1'] = url;
      }
    }
  }

  return episodes;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title');
  const year = searchParams.get('year');
  const stype = searchParams.get('stype');

  if (!title) {
    return NextResponse.json(
      { error: 'Missing title parameter' },
      { status: 400 }
    );
  }

  try {
    // 第一步：搜索影视作品
    const searchUrl = `https://www.caiji.cyou/api.php/provide/vod/?ac=list&wd=${encodeURIComponent(
      title
    )}`;

    const searchResponse = await fetch(searchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      },
    });

    if (!searchResponse.ok) {
      return NextResponse.json(
        { error: 'Search request failed' },
        { status: searchResponse.status }
      );
    }

    const searchData: SearchResponse = await searchResponse.json();

    if (
      searchData.code !== 1 ||
      !searchData.list ||
      searchData.list.length === 0
    ) {
      return NextResponse.json({ error: 'No results found' }, { status: 404 });
    }

    // 第二步：找到最匹配的结果
    const bestMatch = findBestMatch(
      searchData.list,
      year || undefined,
      stype || undefined
    );

    if (!bestMatch) {
      return NextResponse.json(
        { error: 'No matching result found' },
        { status: 404 }
      );
    }

    // 第三步：获取详细信息
    const detailUrl = `https://www.caiji.cyou/api.php/provide/vod/?ac=detail&ids=${bestMatch.vod_id}`;

    const detailResponse = await fetch(detailUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      },
    });

    if (!detailResponse.ok) {
      return NextResponse.json(
        { error: 'Detail request failed' },
        { status: detailResponse.status }
      );
    }

    const detailData: DetailResponse = await detailResponse.json();

    if (
      detailData.code !== 1 ||
      !detailData.list ||
      detailData.list.length === 0
    ) {
      return NextResponse.json({ error: 'No detail found' }, { status: 404 });
    }

    const detail = detailData.list[0];

    // 第四步：解析播放链接
    const episodes = parsePlayUrls(detail.vod_play_url);

    return NextResponse.json({
      vod_id: detail.vod_id,
      vod_name: detail.vod_name,
      vod_year: detail.vod_year,
      type_name: detail.type_name,
      episodes,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Search episodes error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
