# Deepgram Frontend Temporary Token Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在当前无后端 API 的前提下，前端先请求 Deepgram 临时 token，再立即用该 token 建立 WebSocket STT 连接。

**Architecture:** 录音开始时前端用长期 API key 请求 `POST https://api.deepgram.com/v1/auth/grant` 拿到短期 JWT（access_token），将该短期 token 传入现有 `useDeepgramSTT` 连接流程。`useDeepgramSTT` 保持“子协议优先 + query fallback”与会话防竞态逻辑，只把认证凭证来源从“直接 API key”切换为“token provider 优先”。错误面向 UI 统一映射为可提示的 `token-fetch-failed`。

**Tech Stack:** React, TypeScript, WXT/Vite, Deepgram WebSocket Listen API, Deepgram `/v1/auth/grant` token API

---

### Task 1: 新增前端临时 token 获取模块

**Files:**
- Create: `lib/deepgram-temporary-token.ts`
- Test: N/A (当前仓库无可复用自动化测试框架；使用手工验证 + TypeScript 检查)

- [ ] **Step 1: 新建 token 获取函数（失败即抛错）**

```ts
// lib/deepgram-temporary-token.ts
export interface DeepgramGrantResponse {
  access_token?: string
  expires_in?: number
}

export async function getDeepgramTemporaryToken(apiKey: string): Promise<string> {
  const key = apiKey.trim()
  if (!key) {
    throw new Error('missing-api-key')
  }

  const res = await fetch('https://api.deepgram.com/v1/auth/grant', {
    method: 'POST',
    headers: {
      Authorization: `Token ${key}`,
    },
  })

  if (!res.ok) {
    throw new Error(`deepgram-grant-failed:${res.status}`)
  }

  const data = (await res.json()) as DeepgramGrantResponse
  const token = (data.access_token ?? '').trim()
  if (!token) {
    throw new Error('deepgram-grant-invalid-response')
  }
  return token
}
```

- [ ] **Step 2: 运行 TypeScript 检查，确认新文件无类型错误**

Run: `yarn compile`  
Expected: 允许存在仓库既有错误；不新增与 `lib/deepgram-temporary-token.ts` 相关错误。

---

### Task 2: 扩展 `useDeepgramSTT` 支持 token provider

**Files:**
- Modify: `hooks/use-deepgram-stt.ts`

- [ ] **Step 1: 扩展错误类型与 options 接口**

```ts
export type DeepgramSTTError =
  | 'api-key-missing'
  | 'token-fetch-failed'
  | 'connection-failed'
  | 'recorder-failed'
  | null

export interface UseDeepgramSTTOptions {
  apiKey: string
  getAccessToken?: () => Promise<string>
  language?: string
  onFinalSegment: (text: string, speaker: 'Doctor' | 'Patient') => void
  onInterimUpdate?: (text: string) => void
}
```

- [ ] **Step 2: 在 `start()` 内先异步拿 token，再进入原有连接逻辑**

```ts
const start = React.useCallback((stream: MediaStream) => {
  // ... existing cleanup ...

  const bootstrap = async () => {
    let token = ''
    try {
      token = getAccessToken
        ? (await getAccessToken()).trim()
        : apiKey.trim()
    } catch {
      if (!isOwnedSession()) return
      setError('token-fetch-failed')
      setIsConnected(false)
      stopStreamTracks()
      closeWS(false)
      return
    }

    if (!token) {
      if (!isOwnedSession()) return
      setError(getAccessToken ? 'token-fetch-failed' : 'api-key-missing')
      setIsConnected(false)
      stopStreamTracks()
      closeWS(false)
      return
    }

    // 原有 WebSocket + MediaRecorder 逻辑保持不变，只替换凭证来源为 token
    // connect(true) -> new WebSocket(urlWithoutToken, ['token', token])
    // fallback -> new WebSocket(urlWithToken)
  }

  void bootstrap()
}, [apiKey, getAccessToken, closeWS, stopRecorder, stopStreamTracks])
```

- [ ] **Step 3: 确保现有防竞态和 teardown 逻辑保持**

Run checklist:
- `sessionIdRef` guards 仍在所有 ws handler
- `stop/reset/unmount` 仍清理 recorder/socket/stream
- `stop()` 的 `Finalize` tail-close 逻辑不变

- [ ] **Step 4: 运行 TypeScript 检查**

Run: `yarn compile`  
Expected: 不新增与 `hooks/use-deepgram-stt.ts` 相关错误。

---

### Task 3: 录音页接入 token provider 与错误提示

**Files:**
- Modify: `pages/recording-page.tsx`
- Modify: `hooks/use-deepgram-stt.ts`（仅当需要同步错误文案类型）

- [ ] **Step 1: 引入 token 获取函数并创建 callback**

```ts
import { getDeepgramTemporaryToken } from '@/lib/deepgram-temporary-token'

const fetchDeepgramAccessToken = React.useCallback(async () => {
  return await getDeepgramTemporaryToken(DEEPGRAM_API_KEY)
}, [])
```

- [ ] **Step 2: useDeepgramSTT 传入 `getAccessToken`**

```ts
const deepgram = useDeepgramSTT({
  apiKey: DEEPGRAM_API_KEY,
  getAccessToken: fetchDeepgramAccessToken,
  language: 'en-US',
  onFinalSegment: handleFinalSegment,
})
```

- [ ] **Step 3: UI 错误分支新增 `token-fetch-failed` 提示**

```ts
if (deepgram.error === 'token-fetch-failed') {
  toast.error('Deepgram temporary token request failed. Check API key/network and try again.')
  setState('ready')
  return
}
```

- [ ] **Step 4: 运行手工验证**

Manual test checklist:
1. 选择患者，开始录音：应先请求 token，再连接 WebSocket 成功。
2. 停止后再继续录音：应再次拿 token 并成功恢复。
3. 将 key 改错后测试：应提示 token 获取失败（而非静默失败）。

---

### Task 4: 最终质量校验（子代理双阶段 review）

**Files:**
- Modify: 无（review task）

- [ ] **Step 1: Spec review（子代理）**

Pass criteria:
- 已实现“前端先 get token，再立刻 WebSocket”
- 原有录音生命周期未回归
- 错误路径对用户可见

- [ ] **Step 2: Code quality review（子代理）**

Pass criteria:
- 无新增 critical / important 生命周期问题
- 无明显凭证泄漏日志
- 复杂逻辑有必要注释但不过度注释

- [ ] **Step 3: 本地收口检查**

Run:
- `git diff -- lib/deepgram-temporary-token.ts hooks/use-deepgram-stt.ts pages/recording-page.tsx`
- `yarn compile`

Expected:
- 仅目标文件改动
- 无新增与本次改动相关的类型错误
