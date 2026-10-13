// Official API references: https://www.mediawiki.org/wiki/API:Search
// https://www.mediawiki.org/wiki/Extension:TextExtracts#API
const ENDPOINT = 'https://ko.wikipedia.org/w/api.php';
const TOPICS = [
  '산업 혁명',
  '프랑스 혁명',
  '시민 혁명',
  '러시아 혁명',
  '신석기 혁명',
  '과학 혁명',
  '제국주의',
  '민족주의',
  '민주주의',
  '자본주의',
  '사회주의',
  '봉건제',
  '르네상스',
  '종교 개혁',
  '십자군',
  '실크로드',
  '도시화',
  '노동 운동',
  '공장법',
  '인권',
  '삼권 분립',
  '계몽주의',
  '기후 변화',
  '지구 온난화',
  '탄소 중립',
  '생물 다양성',
  '자연 선택',
  '진화론',
  '광합성',
  '세포 분열',
  '유전자',
  '면역',
  '생태계',
  '에너지',
  '중력',
  '상대성 이론',
  '양자 역학',
  '전기',
  '자기장',
  '화학 반응',
  '원자',
  '분자',
  '물질',
  '인공 지능',
  '기계 학습',
  '알고리즘',
  '암호화',
  '정보 보안',
  '확률',
  '통계',
  '미분',
  '적분',
  '경제 성장',
  '인플레이션',
  '금리',
  '무역',
  '세계화',
  '수요와 공급',
  '불평등',
  '사회 계약',
];

// Only fixed topic labels are transmitted. Never send raw phrases, names, email or numbers.
// Unknown subjects deliberately yield no query instead of guessing at personal information.
export function extractSearchQueries(text) {
  if (typeof text !== 'string') return [];
  const clean = text.normalize('NFKC').replace(/https?:\/\/\S+|\S+@\S+|\S*\d\S*/g, ' ');
  return TOPICS.map((topic) => ({ topic, index: clean.indexOf(topic) }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index || b.topic.length - a.topic.length)
    .slice(0, 2)
    .map((item) => item.topic);
}

async function readJson(response) {
  if (!response.ok || response.redirected) throw new Error('Public source request failed');
  if (Number(response.headers.get('content-length')) > 2_000_000)
    throw new Error('Public source too large');
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2_000_000) throw new Error('Public source too large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
  const data = JSON.parse(new TextDecoder().decode(combined));
  if (data.error) throw new Error('Public source API error');
  return data;
}

export async function findPublicSources(
  text,
  {
    fetchImpl = globalThis.fetch,
    now = Date.now,
    signal,
    requestTimeoutMs = 8000,
    totalTimeoutMs = 15000,
  } = {},
) {
  const queries = extractSearchQueries(text);
  const limitations = [
    '공개 검색은 한국어 위키백과의 제한된 주제어 2개·문서 4개를 대상으로 하며, 각 문서는 앞 20,000자까지 비교합니다.',
  ];
  if (!queries.length)
    return {
      documents: [],
      status: 'no-query',
      limitations: [
        ...limitations,
        '개인정보가 포함되지 않는 검색 주제어를 찾지 못해 외부 검색을 생략했습니다.',
      ],
    };
  const deadline = now() + Math.min(15000, totalTimeoutMs);
  const request = async (params) => {
    const remaining = deadline - now();
    if (remaining <= 0 || signal?.aborted)
      throw new Error('Public source cancelled or deadline reached');
    const controller = new AbortController();
    const url = new URL(ENDPOINT);
    url.search = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      origin: '*',
      ...params,
    });
    let timer, onAbort;
    try {
      return await Promise.race([
        (async () =>
          readJson(
            await fetchImpl(url.href, {
              signal: controller.signal,
              redirect: 'error',
              headers: {
                Accept: 'application/json',
              },
            }),
          ))(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => {
              controller.abort();
              reject(new Error('Public source timeout'));
            },
            Math.min(8000, requestTimeoutMs, remaining),
          );
        }),
        new Promise((_, reject) => {
          onAbort = () => {
            controller.abort();
            reject(new Error('Public source cancelled'));
          };
          signal?.addEventListener('abort', onAbort, { once: true });
        }),
      ]);
    } finally {
      clearTimeout(timer);
      if (onAbort) signal?.removeEventListener('abort', onAbort);
    }
  };
  const pageIds = new Set();
  let failed = 0;
  for (const query of queries) {
    if (signal?.aborted) {
      failed++;
      break;
    }
    try {
      const data = await request({
        list: 'search',
        srsearch: query,
        srnamespace: '0',
        srlimit: '2',
        srprop: '',
      });
      if (!Array.isArray(data.query?.search)) throw new Error('Missing search results');
      for (const result of data.query.search.slice(0, 2)) {
        if (Number.isSafeInteger(result.pageid) && result.pageid > 0) pageIds.add(result.pageid);
        else failed++;
      }
    } catch {
      failed++;
    }
  }
  const documents = [];
  for (const pageid of [...pageIds].slice(0, 4)) {
    if (signal?.aborted) {
      failed++;
      break;
    }
    try {
      const data = await request({
        prop: 'extracts',
        pageids: String(pageid),
        explaintext: '1',
        exsectionformat: 'plain',
      });
      const page = data.query?.pages?.find((item) => item.pageid === pageid);
      if (
        !page ||
        page.missing ||
        typeof page.title !== 'string' ||
        typeof page.extract !== 'string' ||
        !/[\p{L}\p{N}]/u.test(page.extract)
      )
        throw new Error('Missing public text');
      documents.push({
        id: `wikipedia-${pageid}`,
        title: page.title,
        text: page.extract.slice(0, 20000),
        url: `https://ko.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
      });
    } catch {
      failed++;
    }
  }
  if (failed)
    limitations.push(
      '일부 공개자료 요청이 실패하거나 시간 제한을 넘었습니다. 확보한 본문만 비교합니다.',
    );
  return {
    documents,
    status: failed
      ? documents.length
        ? 'partial'
        : 'unavailable'
      : documents.length
        ? 'ok'
        : 'no-results',
    limitations,
  };
}
