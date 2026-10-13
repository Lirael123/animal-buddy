# 项目上下文

## 项目简介

Animal Buddy Web：面向小学三年级（7~9 岁）的儿童英语口语互动应用（人教版三年级上册 Unit 3 *Our Animal Friends*）。

后端能力联通状态（第一阶段 My Pet 内置智能体 + 第二阶段 2A 教材知识源与教材原声已真实打通）：
- ✅ **已真实联通**（后端 Express 路由 `server/routes/voice.ts` + `coze-coding-dev-sdk`）：
  - `/api/asr` 语音识别（英文）、`/api/tts` 语音合成（英文→mp3 URL）
  - `/api/talk/start` 开启场景，返回 Rex 教材脚本开场问题
  - `/api/chat` **内置教学智能体**（见下），返回结构化教学反馈
  - `/api/talk/record` 对话/纠错过程持久化（对象存储 JSON，含 expected/correction）
  - `/api/audio`、`/api/audio/:id` **教材原声**（Unit 3 的 10 段真实 MP3，对象存储 `audio/unit/` + 动态签名 URL，非 TTS）
- 🧠 **内置 Animal Buddy 教学智能体架构（已取消跨项目 /stream_run 方案，不再依赖 `ANIMAL_BUDDY_AGENT_TOKEN`；弃用文件 `server/agentClient.ts` 已移除）**：
  - ✅ **第二阶段 2B：At the Zoo 场景已接通**（Part B：P31/P32/P33）。`curriculum.ts` 新增 `ZOO_WORDS`（p32 panda/monkey/tiger/elephant/lion）、`ZOO_ATTRIBUTES`（p33 big/small/tall/fast，均「已核对原图」可评分）、`ZOO_DIALOGUE`（4 轮：情境导入→动物识别→特征描述→综合运用，引导句型标 `adapted`，P31 原句未核验不作评分依据）；`workflow.ts` 新增结构化错误分类 `ErrorType`（grammar/word/mismatch/incomplete/asr_empty/unclear_transcript，ASR 不返回真实置信度，故用转写文本启发式判断并如实命名为 unclear_transcript，空/模糊结果不计分不推进）、语法硬规则改为"当前轮句型感知"（I has→I have 仅在本轮确实要求 I have... 时拦截，示范用联合修正句套用本轮句型而非固定例句），答非所问引导回题、词汇错提示用教材词、连续两次错给教材示范；`/api/chat` 返回 `errorType`/`asrNote`；`/api/talk/record` 新增记录 errorType/round/page/attempt/finished 学情字段（对象存储 JSON，会话按 uid::scene 隔离）。`SCENE_AUDIO_IDS` 为 zoo 启用 U03_07/08/09。
  - 代码位于 `server/tutor/`：`curriculum.ts`（教材知识，已扩为 Unit 3 P26-P37 全单元）、`audio.ts`（10 段原声清单）、`prompt.ts`（系统提示词，蓝本 `assets/05_Agent系统提示词V2.txt`）、`workflow.ts`（教学工作流引擎 + 会话状态机）。
  - **实现方式如实说明：不是平台 Knowledge/RAG**，而是把审核过的教材内容（依据 `assets/01_教材知识库_核对版.md`、`08_教材页码核对索引.csv`，均「已核对原图」）按 Part/页码/词汇/句型/对话脚本组织成**服务端结构化本地知识**（Unit 3 P26-P37 全量：核心词、阅读重点、动作、字母 Ii-Jj-Kk-Ll、易错纠错表、音频映射），严禁旧版 Amazing animals 内容。
  - **服务端教学工作流掌控判定**：对话脚本、轮次推进、答案判定（教材原句/可接受表达/不完整/语法错误）、`I has → I have` 纠错、连续两次答错给教材句型示范，均为确定性逻辑；豆包 `doubao-seed-2-0-pro-260215` 仅负责把教学意图润色成适合三年级、可 TTS 的一句英文，**评分/推进/页码/答案不交给模型自由决定**。
  - **差异化反馈**（第二阶段 2A 增强）：豆包会针对学生本轮具体原话生成个性化英文引导（如顺着他已说对的词靠近正确答案），但只改语言、不改标准答案/页码/判定/评分。
  - 会话状态在服务端按 `uid::scene` 内存隔离；一次只问一个问题。
- ✅ **第三阶段 3A：正式听写题库 + 服务端固定评分 + 错题记录 + 个人学习进度**（`server/tutor/dictation.ts` + `records.ts` 新增）：
  - **听写题库**（`dictation.ts`）：来源于 `assets/03_听写固定题库.json/csv`（已核对），33 题 `scorable=true`（Part A 宠物 dog/cat/fish/bird/rabbit P29、Part B 野生动物 panda/monkey/tiger/elephant/lion P32、形容词 big/small/tall/fast P33、教材句子 P28/29/31）；每个题目含唯一 ID/type/page/section/难度/标准答案/可接受答案/source。拼读示例、动作词、拓展词与 **P34 Listen and circle 一律 `scorable=false` 禁止自动评分**，不得编造听力答案。
    - **来源标记如实**：教材句子 `source=textbook → 播放教材原声 MP3`（`/api/dictation/audio` 映射到 `audio/unit/`，签名 URL）；单词/自编练习 `source=adapted → TTS 合成并明确标注“教学改编”`，绝不冒充教材原句。
  - **服务端固定评分**（`scoreDictation`，答案库不下发浏览器）：大小写/句末标点宽容；可接受等价答案；`missing_article`（仅缺 a/an/the → vocabOk=true、formOk=false，温和提示规范表达）；`grammar`（has/have 等）、`word`、`unclear`（ASR 空/超短 → `asrSkipped=true` 不扣知识分）；豆包不参与改分。
  - **API**（`voice.ts`）：`/api/dictation/list`（题元信息，无答案）、`/api/dictation/submit`（评分+幂等入账）、`/api/dictation/audio`、`/api/dictation/records`、`/api/progress`。全部 `requireUid`（3–32 位合法虚拟学生 ID）服务端侧鉴权，只返回属主本人数据，未授权拒绝（401）。
  - **错题记录/进度**（`records.ts`）：对象存储 `dictation/records/{uid}/*.json`，按 `uid+qid+session` 幂等——同批次重复提交/刷新合并更新同一记录、`counted` 不重复累计；记录 firstAnswer/retries/errorType/aiHintCount/corrected/firstCorrect/mastered/vocabOk/formOk/asrSkipped。进度 `aggregateProgress` 按 qid 取最优记录，输出 exercised/masteredVocab/firstPassRate/correctionCount/pending/reviewRecommend（按真实错题推荐复习，不造假数据）。
  - **2B 遗留修正**：`missingDefiniteArticleOnly` 已重命名为 `detectMissingRequiredArticle`（函数语义准确），并前置到 bare-word 接受命中前——`I see panda→I see a panda`、`It is elephant→It is an elephant` 现会给出温和规范表达提示（`missing_article`），词汇理解与句型正确性分离记录；但**仅限** I see a / It is a / This is a / I have a 句型，且多词句子式回答才触发（单个裸词 panda 仍视为可接受变式），回归 My Pet/Zoo 不受影响。
- 📖 **教材原声**（`server/tutor/audio.ts` + `assets/说明文档.md`）：10 段 MP3 已本地 `assets/` 且已真实上传对象存储 `audio/unit/`（持久化 storageKey，播放前 `generatePresignedUrl` 动态签名）。**录音文字逐字核验、听力答案核验均为「未完成」**，一律标 `pending`，不得据文件名伪造原声文字/答案；P30 first sound、P34 Listen and circle 未核验答案不参与评分。
- ❌ **仍未接入**（后续阶段，不伪造连接）：其余教材原声在 Let's Talk 之外的整段播放面板、未核验听力题的自动评分、正式教师端身份认证与班级数据查看、学习记录聚合看板。
- 前端接口出口集中在 `src/api/client.ts`；My Pet 的「选情境→AI 提问→语音回答→ASR→工作流分析→反馈/下一题→TTS→落库」全链路与「听教材原声」已在 Let's Talk 页真实打通。

## 技术栈

- **核心**: Vite 7, TypeScript, Express
- **UI**: Tailwind CSS（无框架，原生 TS + 模板字符串渲染）
- **路由**: 自研哈希路由 `src/pages/router.ts`（`#/`、`#/talk`、`#/listen`、`#/retry`、`#/progress`）

## 页面与素材

- 页面：`src/pages/` 下 `home.ts`（首页）、`talk.ts`（Let's Talk 情境对话）、`listen.ts`（Let's Listen 听力听写）、`retry.ts`（Try Again 错题巩固）、`progress.ts`（My Progress 学习成长）。
- 共享壳：`src/components/shell.ts`（内页薄荷绿顶栏 `topBar` + 左侧菜单 `sideMenu`），`src/components/ui.ts`（Toast、待接入徽章）。
- 素材：3D 绘本风插画存于 `public/assets/`，路径常量集中在 `src/assets.ts`。
- 交互：浏览器原生 TTS（`speechSynthesis`）与 `MediaRecorder` 仅作 Let's Listen 本地跟读/键盘输入的能力演示；真实教材原声、ASR/TTS、听写评分与学习记录均由服务端真实完成。

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
