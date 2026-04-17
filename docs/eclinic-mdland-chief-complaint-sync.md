# eClinic（MDLand）Chief Complaint 同步：实现过程、问题与方案

本文记录 FastDoc 浏览器扩展将 SOAP 写入 MDLand eClinic **Chief Complaint / HPI** 并保存落地的过程：侧栏 `Export` → `background` 转发 → `content` 在页面多 frame 中操作 DOM。最终实现采用 **与 DocPro 观察到的序列对齐** 的路径，在真实环境中验证通过。

## 目标

1. 从侧栏抓取 / 同步与 EMR 同 tab 的页面内容（多 iframe）。
2. **Tap to match**：提取 Patient Demographics 区段纯文本供后续 LLM。
3. **AI EMR Export**：把 SOAP（Subjective → CC，Objective/Assessment/Plan/编码 → HPI）写入 eClinic，并尽可能 **可靠保存**。

## 架构要点（WXT / MV3）

- **Side panel** 发 `browser.runtime.sendMessage`；**background**（service worker）用 `tabs.sendMessage` 把任务发到 tab 的 content script。
- 异步回复：`sendResponse` + `return true`，避免 `Unknown error`。
- **Content script**：`allFrames: true`，仅 **top frame** 统一处理 sync，避免多 frame 同时 `sendResponse` 竞态。
- **权限**：`tabs` + 足够 `host_permissions`（如 `<all_urls>` 或 MDLand 域名），否则无法访问目标 frame。

## 实现过程（按时间线）

### 1. 桥接与侧栏

- `FD_EXTRACT_EMR_DEMOGRAPHICS`、`FD_SYNC_EMR_CHIEF_COMPLAINT` 等消息类型；`requestId` + `debug` 贯穿 sidepanel / background / content，便于 `[FastDoc][…]` 前缀日志对齐。

### 2. Demographics

- 问题：Demographics 在 **OfficeVisit** 子 frame（`officevisit_Spec.aspx`），顶层 `document` 扫不到。
- 方案：合并 `collectSameOriginDocs` + `collectSameOriginDocsFromWindowTree`，按 URL/特征优先 `officevisit_Spec`；区段文本在「Patient Demographics」与「Chief Complaint」之间切片，减少噪声。

### 3. Chief Complaint 初版（直接改 DOM）

- 在 `officevisit_Spec` 中找 `#div_chiefComplaint_view` / `#div_presentIllness_view`，或在 `ov_ChiefComplaint.aspx` 子 frame 里找富文本 iframe 的 `body`。
- **跨 iframe 的 `instanceof HTMLElement` 失效**：用 `nodeType === 1` + `tagName` 的 `isElementNode` 判断。

### 4. 保存与「Save 卡住」

- 早期尝试：`saveIt()`、`#SavePage`、表单 `submit`、`form.requestSubmit` 等，易出现：
  - 点到 **模板保存**（错误上下文）；
  - **workarea0 vs workarea1** 错帧，触发的是另一工作区的保存；
  - 仅改 iframe `innerHTML`，EMR **不认脏状态**，手动 Save 无效或 UI 锁死。
- 缓解尝试：`autoSave` 开关、gentle 写入（减少合成事件）、去掉对 Save 按钮的强行改 `disabled`/`pointer-events`（避免干扰原生状态机）。

### 5. 转折点：对齐 DocPro（验证成功）

在本机 Chrome 扩展目录中对 **DocPro**（`hmiegipencmamebkcldkgmoldjlnbnnp`）做只读分析（`sw.js` + `scripts/mdland_officevisit_spec.js`），归纳 MDLand 路径（**不复制其闭源代码**，仅复现交互序列）：

| 步骤 | 行为 |
|------|------|
| 上下文 | 脚本挂在 **`ov_doctor_spec.aspx`**（`allFrames`），用该 frame 的 `document` |
| 导航 | `MenuFrame` → `contentDocument` → 点击 **`#menu_span_chiefcomplaint`** |
| CC | `document.getElementById('chiefComplaint')` iframe → 内层 **`chiefComplaint_ifr`** → 双击 **`chiefComplaint_bold`** |
| 写入 | 内层文档 **`#tinymce`**：`DOMParser` 解析 HTML 后 **`replaceChildren(...body.childNodes)`**（等价于 DocPro 内联 `d()` 的思路） |
| HPI | **`presentIllness_ifr`** + **`presentIllness_bold`** ×2 + **`#tinymce`** 同样写入 |
| 保存 | `autoSave` 时：`#procbarTDOfficeVisit` 点击；若 **`#SavePage`** 的 `visibility !== 'hidden'` 再点一次 **procbar**（避免误开模板保存） |

FastDoc 中实现为 **`tryMdlandDoctorSpecDocProChiefSync`**：对 `initialTargets` 里所有 **`ov_doctor_spec.aspx`** 排序（优先 **`workarea1`**），依次尝试直至成功；失败则 **回退** 到原有 `ov_ChiefComplaint` 编辑器路径。

### 6. Export 与自动保存

- `pages/soap-page.tsx` 构建 sync payload 时设 **`autoSave: true`**，使 DocPro 对齐路径在写入后执行 procbar / SavePage 守卫序列。

## 关键文件

- `entrypoints/content.ts`：frame 扫描、MDLand DocPro 序列、 demographics / 旧版 chief 回退。
- `entrypoints/background.ts`：消息路由、`sendResponse` 异步。
- `entrypoints/sidepanel/App.tsx`：`autoSave` 归一为 `payload.autoSave === true`、调试日志。
- `wxt.config.ts`：`tabs`、host 权限。
- `pages/soap-page.tsx`：Export payload（含 `autoSave`）。

## 排障建议

1. 打开 **`debug: true`**（侧栏已有开关逻辑时），看 **`[FastDoc][content][requestId] mdland-docpro:`** 系列日志与返回中的 **`diagnostics.trace`**。
2. 确认当前 visit 对应的 **`workareaN`** 与脚本命中的 **`ov_doctor_spec`** 一致（多工作区时优先 `workarea1` 仅为启发式，可按需调整排序）。
3. 若 MDLand 升级 DOM：用 DevTools 对比 **MenuFrame / chiefComplaint / tinymce / procbar** 是否仍一致。

## 合规说明

DocPro 为第三方商业扩展；本文档所述为 **对其在本地已安装文件中对外可见行为的工程归纳**（URL、选择器、点击顺序），FastDoc 实现为 **自行编写的等价步骤**，不粘贴对方混淆源码。

## 结果

按上述 **MDLand DocPro 对齐路径** + `autoSave` 后，在目标 eClinic 环境中 **Export 测试成功**（写入 + 保存链路符合预期）。
