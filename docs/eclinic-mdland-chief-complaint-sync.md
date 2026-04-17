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

## FastDoc 原方案 vs DocPro 方案：对比与「为什么原方案不行」

下面「原方案」指对齐 DocPro 之前，FastDoc 在 eClinic 上采用的主流做法：**在已打开的 `ov_ChiefComplaint.aspx` 子 frame 或 `officevisit_Spec` 展示层上直接改 DOM，再猜保存函数/按钮**。

### 对照表

| 维度 | FastDoc 原方案（未对齐前） | DocPro 观察到的方案（现 FastDoc `mdland-docpro` 路径） |
|------|-----------------------------|--------------------------------------------------------|
| **脚本主上下文** | 常从 **top** 遍历到 `ov_ChiefComplaint.aspx` 或只改 OfficeVisit **展示 div** | 以 **`ov_doctor_spec.aspx`** 该 frame 的 `document` 为锚点（与 EMR 外壳一致） |
| **如何进入「可编辑」Chief** | 假设用户已打开 editor，或直接写 `body` / `innerHTML` | 先走 **`MenuFrame` → `#menu_span_chiefcomplaint`**，与人工点菜单一致 |
| **写入目标** | 富文本 iframe 的 **`body`**，或外层 `#div_*_view` 的 `textContent` | 内层 **`chiefComplaint_ifr` / `presentIllness_ifr`** 文档里的 **`#tinymce`** |
| **写入方式** | `innerHTML` / `textContent` + 自行 `dispatchEvent` | **`DOMParser` + `replaceChildren`**（等价 DocPro 内联 `d()`），贴近 TinyMCE 预期 DOM |
| **工具栏/状态** | 一般不调 EMR 自带按钮 | **双击 `chiefComplaint_bold` / `presentIllness_bold`**，与页面内建行为一致 |
| **保存** | 调 `saveIt()`、点 `#SavePage`、`saveAction`、`form.submit` 等「猜」 | 先 **`#procbarTDOfficeVisit`**，再用 **`#SavePage` visibility** 决定是否二次点击 procbar，避开模板保存 |
| **多 workarea** | 易命中 **第一个** `ov_doctor_spec` / 错误 `workarea` 的 Save | 对多个 `ov_doctor_spec` 排序重试（如优先 `workarea1`） |

### 为什么原方案「能看见字」却不行（核心原因）

1. **上下文不在 EMR 设计的主状态机里**  
   Chief 的「真编辑区」在 DocPro 路径里是通过 **菜单 + `chiefComplaint` iframe 链** 打开的；直接在 **`ov_ChiefComplaint.aspx` 子文档**里改 `body`，或只改 OfficeVisit **只读展示节点**，往往 **不经过** EMR 内部「已修改 / 可提交」的同一条链路，结果是：**界面有字，Save 不认或点了无反应**。

2. **写错 DOM 节点（`body` vs `#tinymce`）**  
   TinyMCE 类编辑器依赖 **`#tinymce` 容器子节点** 与编辑器实例同步；只改外层 iframe `body` 或整块 `innerHTML`，容易出现 **编辑器内核状态与 DOM 脱节**，表现为保存无效、甚至 **Save 按钮像被锁住**（页面仍按「未安全变更」或错误模态处理）。

3. **保存动作在「错误的 frame / workarea」上触发**  
   多 iframe 下 `saveIt`、`#SavePage` 可能属于 **另一 `workarea`** 或 **全局模板** 流程；一旦点错，会打开 **Save Template** 等弹层，打断 Chief 保存，并让用户感觉 **顶部 Save 失效**。

4. **过度「帮用户解锁」Save 反而破坏原生逻辑**  
   曾尝试改 `disabled`、`pointer-events`、强行关弹层等，会 **与 EMR 自己的锁定/遮罩状态冲突**，加剧「点 Save 没反应」的假象；最小干预（对齐 DocPro：少动按钮属性、走 procbar 序列）更稳。

5. **与 DocPro 的注入面不一致**  
   DocPro 的 MDLand 规则是 **`ov_doctor_spec.aspx` + `allFrames`**；原方案若只在 **子 editor URL** 上操作，缺少与 **同一 `document` 下 `MenuFrame`、`procbarTDOfficeVisit`** 的协同，保存与导航天然弱一档。

**结论：** 原方案失败，不是因为「不能用 content script」，而是因为 **没有复现 eClinic 期望的「导航 → tinymce 写入 → procbar/SavePage 守卫」这条业务链**；对齐 DocPro 序列本质是 **对齐 EMR 前端状态机**，而不是单纯「找到一段 HTML 改掉」。

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
