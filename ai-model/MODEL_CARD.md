---
license: apache-2.0
language:
- ko
metrics:
- roc_auc
base_model:
- monologg/koelectra-base-v3-discriminator
pipeline_tag: text-classification
tags:
- ai
- detect
---

#### koelectra-base-v3-discriminator-ai-detect

Model Details

[2025 SW중심대학 디지털 경진대회 : AI부문 : 생성형 AI(LLM)와 인간 : 텍스트 판별 챌린지](https://dacon.io/competitions/official/236473) 수상작       
이 모델은 한성대학교 SW중심대학사업단으로부터 후원 받은 Cloud GPU 로 학습되었습니다.

How to Get Started with the Model

```python
from transformers import AutoTokenizer, AutoModelForSequenceClassification

tokenizer = AutoTokenizer.from_pretrained("monologg/koelectra-base-v3-discriminator")
model = AutoModelForSequenceClassification.from_pretrained("hyun5ooo/koelectra-base-v3-discriminator-ai-detect")

inputs = tokenizer("안녕, 세상!", return_tensors="pt")
outputs = model(**inputs)
```

Evaluation    

2025 SW중심대학 디지털 경진대회 : AI부문 / Public 리더보드 기준 
|Model|roc-auc|
|---|---|
|deberta base|0.903|
|deberta xlarge|0.904|
|mdeberta base |0.894|
|koelectra base |0.894|
|klue roberta large |0.892|