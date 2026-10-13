# GitHub Pages 통합 배포

대상: https://created412.github.io/saengibu-auditor/

2026-10-14. 기존 주소의 첫 화면은 생기부 감사관이다. 상단의 표절감사관/생기부 감사관 버튼으로 이동하고, 양쪽에서 같은 글을 전달한다. `/saengibu-auditor/#/compare`는 표절감사관 직접 링크다. 해시 경로를 사용하므로 새로고침해도 GitHub Pages 경로 오류가 나지 않는다.

공개판 표절 검사는 Web Worker에서 기존 비교 엔진을 실행한다. TXT·DOCX·HWPX·텍스트 PDF 추출과 결과 JSON/인쇄를 제공한다. 비교자료가 없으면 일치율을 만들지 않는다. 위키백과 검색은 사용자가 켠 경우에만 제한된 학술 주제어를 전송한다. 계정/SQLite 문서 보관함은 공개판에 포함하지 않고 사용 안내에 설명한다.

AI 탐지는 ONNX Runtime Web 1.24.3으로 브라우저에서 실행한다. 사용자 원문은 AI 서버로 전송하지 않는다. 기본 꺼짐이며 사용자가 켜면 226,086,116바이트(약 216MiB)의 모델과 약 12MB 런타임을 내려받는다. 모델만 브라우저 캐시에 보관하며 원문을 캐시에 저장하지 않는다. 캐시 사용이 불가능해도 분석은 수행한다. 기기 성능/메모리 제한에 따라 실행되지 않을 수 있다. 실행 중 입력 수정·체크 해제로 작업을 중지한다. 최대 240초, 실제 분석 범위 밖은 명시한다.

원본 모델은 변경 없이 로드하고 ONNX로 변환한 뒤 가중치 저장만 float16, 계산은 float32로 유지했다. 합성 검증 문장 4개에서 원본 대비 점수 절대 차이 최대 0.000467. 브라우저 WordPiece 토큰 ID는 Python 토크나이저와 같은 4개 문장(한국어·영문·구두점·유니코드·특수 토큰)에서 일치한다. 이는 변환/연결 검증이며 탐지 정확도 평가가 아니다. 실험 기능 표시는 유지한다. 원본 모델 카드, 수정 사항 NOTICE, Apache 2.0 및 런타임 라이선스를 함께 배포한다.

## 빌드

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd run build:pages
node scripts/preview-pages.mjs
```

모델 파일은 `scripts/export-browser-ai.py`로 생성한다. 출력은 `public/ai-model`이며 `scripts/build-pages.mjs`가 공개 파일만 `.test-data/pages-build`로 묶는다. DB, 계정, 사용자 문서, Python 환경, 테스트 작업 데이터는 배포하지 않는다. 기존 원격 저장소를 `.test-data/pages-deploy`에 복제하고 검증된 정적 산출물을 복사해 main으로 배포한다. 기존 저장소의 js/css/tests와 Git 기록은 보존한다.

검증: 자동 테스트 128개 통과, 로컬·Pages 두 빌드 성공. 브라우저 정적 서버에서 예제의 실제 비교 결과 44.7%, AI 합성 본문의 실제 ONNX 추론 점수 0.997 표시 확인. 두 감사관 전환 확인. 기존 원격의 감사 규칙·사전은 내용 변경 없이 통합 복사본과 동일함을 diff로 확인했다.
