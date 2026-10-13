# 项目上下文

## 项目简介

Animal Buddy Web：面向小学三年级（7~9 岁）的儿童英语口语互动应用（人教版三年级上册 Unit 3 *Our Animal Friends*）。

后端能力联通状态（第一阶段：My Pet 内置智能体已真实打通）：
- ✅ **已真实联通**（后端 Express 路由 `server/routes/voice.ts` + `coze-coding-dev-sdk`）：
  - `/api/asr` 语音识别（英文）、`/api/tts` 语音合成（英文→mp3 URL）
  - `/api/talk/start` 开启场景，返回 Rex 教材脚本开场问题
  - `/api/chat` **内置教学智能体**（见下），返回结构化教学反馈
  - `/api/talk/record` 对话/纠错过程持久化（对象存储 JSON，含 expected/correction）
- 🧠 **内置 Animal Buddy 教学智能体架构（已取消跨项目 /stream_run 方案，不再依赖 `ANIMAL_BUDDY_AGENT_TOKEN`；弃用文件 `server/agentClient.ts` 已移除）**：
  - 代码位于 `server/tutor/`：`curriculum.ts`（教材知识）、`prompt.ts`（系统提示词，蓝本 `assets/05_Agent系统提示词V2.txt`）、`workflow.ts`（教学工作流引擎 + 会话状态机）。
  - **实现方式如实说明：不是平台 Knowledge/RAG**，而是把审核过的教材内容按 Part/页码/词汇/句型/对话脚本组织成**服务端结构化本地知识**（第一阶段仅 Unit 3 Part A P28-29 My Pet），严禁旧版 Amazing animals 内容。
  - **服务端教学工作流掌控判定**：对话脚本、轮次推进、答案判定（教材原句/可接受表达/不完整/语法错误）、`I has → I have` 纠错、连续两次答错给教材句型示范，均为确定性逻辑；豆包 `doubao-seed-2-0-pro-260215` 仅负责把教学意图润色成适合三年级、可 TTS 的一句英文，**评分/推进/答案不交给模型自由决定**。
  - 会话状态在服务端按 `uid::scene` 内存隔离；一次只问一个问题。
- ❌ **仍未接入**（后续阶段，不伪造连接）：教材原声 10 段 MP3 的服务端播放（文件已在项目根 `assets/`，第二阶段接）、At the Zoo 场景工作流（第二阶段）、服务端固定题库听写/评分与错题/学习报告/教师端（第三阶段，届时移除前端答案）、学习记录聚合看板。
- 前端接口出口集中在 `src/api/client.ts`；My Pet 的「选情境→AI 提问→语音回答→ASR→工作流分析→反馈/下一题→TTS→落库」全链路已在 Let's Talk 页真实打通。

## 技术栈

- **核心**: Vite 7, TypeScript, Express
- **UI**: Tailwind CSS（无框架，原生 TS + 模板字符串渲染）
- **路由**: 自研哈希路由 `src/pages/router.ts`（`#/`、`#/talk`、`#/listen`、`#/retry`、`#/progress`）

## 页面与素材

- 页面：`src/pages/` 下 `home.ts`（首页）、`talk.ts`（Let's Talk 情境对话）、`listen.ts`（Let's Listen 听力听写）、`retry.ts`（Try Again 错题巩固）、`progress.ts`（My Progress 学习成长）。
- 共享壳：`src/components/shell.ts`（内页薄荷绿顶栏 `topBar` + 左侧菜单 `sideMenu`），`src/components/ui.ts`（Toast、待接入徽章）。
- 素材：3D 绘本风插画存于 `public/assets/`，路径常量集中在 `src/assets.ts`。
- 交互：浏览器原生 TTS（`speechSynthesis`）与 `MediaRecorder` 仅作能力演示，非真实教材音频/ASR。

## 目录结构

```
├── scripts/            # 构建与启动脚本
│   ├── build.sh        # 构建脚本
│   ├── dev.sh          # 开发环境启动脚本
│   ├── prepare.sh      # 预处理脚本
│   └── start.sh        # 生产环境启动脚本
├── server/             # 服务端逻辑
│   ├── routes/         # API 路由（voice.ts：asr/tts/talk/start/chat/talk record）
│   ├── tutor/          # 内置教学智能体（curriculum 教材知识 / prompt 系统提示词 / workflow 工作流引擎）
│   ├── server.ts       # Express 服务入口
│   └── vite.ts         # Vite 中间件集成
├── src/                # 前端源码
│   ├── index.css       # 全局样式
│   ├── index.ts        # 客户端入口
│   └── main.ts         # 主逻辑
├── index.html          # 入口 HTML
├── package.json        # 项目依赖管理
├── tsconfig.json       # TypeScript 配置
└── vite.config.ts      # Vite 配置
```

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。
**常用命令**：
- 安装依赖：`pnpm add <package>`
- 安装开发依赖：`pnpm add -D <package>`
- 安装所有依赖：`pnpm install`
- 移除依赖：`pnpm remove <package>`

## 开发规范

- 使用 Tailwind CSS 进行样式开发

### 编码规范

- 默认按 TypeScript `strict` 心智写代码；优先复用当前作用域已声明的变量、函数、类型和导入，禁止引用未声明标识符或拼错变量名。
- 禁止隐式 `any` 和 `as any`；函数参数、返回值、解构项、事件对象、Express `req`/`res`、`catch` 错误在使用前应有明确类型或先完成类型收窄，并清理未使用的变量和导入。
