import * as ort from 'onnxruntime-web/wasm';
import { inspectAiText } from '../../server/ai-core.js';
import { createTokenizer } from './tokenizer.js';
import { validateText } from '../../server/extract.js';

const progress = (message) => self.postMessage({ progress: message });
const hash = async (data) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(x => x.toString(16).padStart(2, '0')).join('');
async function loadModel(base) {
  const manifestResponse = await fetch(base + 'ai-model/manifest.json');
  if (!manifestResponse.ok) throw new Error('AI 모델 정보를 불러오지 못했습니다.');
  const manifest = await manifestResponse.json();
  let cache;
  try { cache = await caches.open('auditor-ai-' + manifest.sha256.slice(0, 16)); } catch { /* Private mode can disable cache. */ }
  const bytes = new Uint8Array(manifest.bytes);
  let offset = 0;
  for (let i = 0; i < manifest.parts.length; i++) {
    const part = manifest.parts[i], url = base + 'ai-model/' + part.file;
    progress(`AI 모델 준비 ${i + 1}/${manifest.parts.length} · 처음에는 약 ${Math.ceil(manifest.bytes / 1024 / 1024)}MB를 내려받습니다`);
    let response = await cache?.match(url);
    const cached = !!response;
    response ||= await fetch(url);
    if (!response.ok) throw new Error('AI 모델 다운로드에 실패했습니다. 네트워크를 확인해 주세요.');
    const data = await response.arrayBuffer();
    if (data.byteLength !== part.bytes || await hash(data) !== part.sha256) {
      await cache?.delete(url);
      throw new Error('AI 모델 파일 검증에 실패했습니다. 다시 시도해 주세요.');
    }
    bytes.set(new Uint8Array(data), offset);
    offset += data.byteLength;
    if (!cached) { try { await cache?.put(url, new Response(data)); } catch { /* Inference also works without persistent cache. */ } }
  }
  if (offset !== manifest.bytes || await hash(bytes) !== manifest.sha256) throw new Error('AI 모델 전체 검증에 실패했습니다.');
  progress('AI 모델을 메모리에 불러오는 중');
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = base + 'vendor/';
  const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  const vocabulary = await fetch(base + 'ai-model/vocab.txt');
  if (!vocabulary.ok) throw new Error('AI 토크나이저를 불러오지 못했습니다.');
  return { session, encode: createTokenizer(await vocabulary.text()), manifest };
}
self.onmessage = async ({ data: { body, base } }) => {
  let loaded;
  try {
    const result = await inspectAiText(validateText(body.text), {
      infer: async (segments) => {
        loaded = await loadModel(base);
        const outputs = [];
        for (let i = 0; i < segments.length; i++) {
          progress(`AI 구간 분석 ${i + 1}/${segments.length} · 원문은 외부로 전송하지 않습니다`);
          const ids = loaded.encode(segments[i].text), tokens = ids.length;
          if (tokens < 80 || tokens > 512 || segments[i].text.trim().length < 150) { outputs.push({ score: null, tokens }); continue; }
          const tensor = (values) => new ort.Tensor('int64', BigInt64Array.from(values, BigInt), [1, tokens]);
          const feeds = { input_ids: tensor(ids), attention_mask: tensor(ids.map(() => 1)), token_type_ids: tensor(ids.map(() => 0)) };
          const prediction = await loaded.session.run(feeds);
          const logits = prediction.logits.data;
          const score = 1 / (1 + Math.exp(Number(logits[0]) - Number(logits[1])));
          outputs.push({ score, tokens });
          Object.values(feeds).forEach(t => t.dispose());
          Object.values(prediction).forEach(t => t.dispose());
        }
        return outputs;
      },
    });
    result.processing = 'browser';
    result.model = { ...result.model, runtime: 'ONNX Runtime Web 1.24.3 / float16 weights, float32 compute', artifactSha256: loaded?.manifest.sha256 || null };
    result.limitations.push('브라우저용 경량 변환 모델입니다. 원본 모델과 점수가 다를 수 있으며 별도의 정확도 검증은 완료되지 않았습니다.');
    self.postMessage({ result });
  } catch (e) { self.postMessage({ error: typeof e.message === 'string' ? e.message : '이 기기에서 AI 모델을 실행하지 못했습니다. PC의 최신 Chrome 또는 Edge에서 다시 시도해 주세요.' }); }
  finally { await loaded?.session.release(); }
};
