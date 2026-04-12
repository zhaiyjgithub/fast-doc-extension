# Local Mock LLM Speaker Attribution Plan

**Goal:** 录音结束后，用本地 mock LLM 函数对原始 STT 文本做说话人归因（Doctor / Patient），取代手动 Speaker Toggle 的人工维护，并在控制台打印"虚拟 LLM 调用"日志，方便后续替换为真实 API。

**Architecture:** 创建 `lib/mock-llm-speaker-attribution.ts` 封装本地归因逻辑；在 `recording-page.tsx` 的 `handleStopRecording` 中调用；live script 实时区域继续使用 Speaker Toggle（实时标注辅助），录音结束后的 transcript 以 mock 归因结果为准。

**Tech Stack:** 纯本地 TypeScript 函数、语义启发式规则（中英文）、`console.group` 日志模拟 LLM 调用监控。

---

## 背景：为何选方案 2（Post-Processing LLM Attribution）

| 问题 | 方案 1（手动 Toggle） | 方案 2（LLM 归因） |
|------|----------------------|-------------------|
| 说话人区分 | 用户手动切换，操作负担大 | 录后自动，无需操作 |
| 实时性 | 实时，但需干预 | 录后处理，~0ms 额外感知延迟 |
| 准确率 | 取决于用户操作是否及时 | 取决于模型/启发式规则 |
| 落地成本 | 已实现 | 本地 mock 无额外成本 |
| 升级路径 | 需整体改造 | 替换一个函数即可接入真实 API |

---

## 完整数据流

```
录音中：
  Chrome STT → onFinalResult → liveLines (speaker = activeSpeaker from toggle)
                                      ↓ (实时显示，toggle 仍可用作辅助参考)

按下 Stop：
  liveLines → rawTexts (只取 text，忽略 toggle speaker) → mockLLMAttributeSpeakers()
                ↓
  console.group("[MockLLM] Speaker Attribution")
    prompt: "以下是医患对话原始文本，请判断每句话属于 Doctor 还是 Patient..."
    segments: [{idx, text}, ...]
    attributions: [{idx, text, speaker, confidence, reason}, ...]
    formattedTranscript: "Doctor: ...\n\nPatient: ..."
  console.groupEnd()
                ↓
  transcript = formattedTranscript
  setState('processing') → 400ms → 展示 transcript textarea（可编辑）→ Generate EMR
```

---

## File Structure

- **Create:** `lib/mock-llm-speaker-attribution.ts` — 本地启发式归因 + 控制台日志
- **Modify:** `pages/recording-page.tsx:handleStopRecording` — 接入归因函数

---

## 启发式规则（中英文均支持）

### Doctor 信号词
- **疑问句** 结尾含 `?` / `？`
- 中文：`您`、`有没有`、`多长时间`、`多久`、`什么时候`、`告诉我`、`需要`、`建议`、`给您`、`检查`、`体温`、`血压`、`复查`、`开药`
- 英文：`any `、`have you`、`do you`、`when did`、`how long`、`i'll`、`let me`、`prescrib`、`recommend`、`order`、`vitals`、`follow up`、`exam`

### Patient 信号词
- 中文：`我`（开头）、`头`、`肚子`、`发烧`、`咳嗽`、`疼`、`不舒服`、`感觉`、`天了`、`周了`
- 英文：`i have`、`i've`、`i feel`、`my `、`started`、`days`、`weeks`、`hurts`、`pain`

### 兜底规则
若规则无法判断，参考「上一句说话人」交替原则（典型问诊轮流对话）。

---

## 控制台日志格式（模拟 LLM 监控）

```
▶ [MockLLM] Speaker Attribution ─────────────────────────────
  📤 Virtual Prompt (would be sent to GPT-4o / Claude):
     System: You are a medical conversation analyzer. ...
     User: Classify each segment as Doctor or Patient. ...
     Segments: [
       { idx: 0, text: "Hello, what brings you in today?" },
       { idx: 1, text: "I've had a headache for three days." },
       ...
     ]

  📥 Attribution Results:
     [0] Doctor   (conf: high)   reason: "question pattern + greeting"
     [1] Patient  (conf: high)   reason: "first-person symptom description"
     ...

  📋 Formatted Transcript:
     Doctor: Hello, what brings you in today?
     Patient: I've had a headache for three days.
     ...
◀ ─────────────────────────────────────────────────────────────
```

---

## Task 1: 创建 `lib/mock-llm-speaker-attribution.ts`

**Files:**
- Create: `lib/mock-llm-speaker-attribution.ts`

```typescript
export interface RawSegment {
  idx: number
  text: string
  time: string
}

export interface AttributedSegment extends RawSegment {
  speaker: 'Doctor' | 'Patient'
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

export function mockLLMAttributeSpeakers(segments: RawSegment[]): AttributedSegment[] {
  // ... (see implementation)
}
```

---

## Task 2: 修改 `recording-page.tsx`

- `handleStopRecording` 中，将 `liveLines` 转换为 `RawSegment[]`（只取 text + time，忽略 toggle speaker）
- 调用 `mockLLMAttributeSpeakers` 得到 `AttributedSegment[]`
- 转换为 transcript 字符串供 textarea 展示

---

## 升级路径

将 `mockLLMAttributeSpeakers` 函数体替换为：
```typescript
async function realLLMAttributeSpeakers(segments: RawSegment[]) {
  const res = await fetch('/api/attribute-speakers', {
    method: 'POST',
    body: JSON.stringify({ segments })
  })
  return res.json()
}
```
调用方（`recording-page.tsx`）不需要改动，只换掉这一个函数。
