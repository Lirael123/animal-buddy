# 项目上下文

## 项目简介

Animal Buddy Web：面向小学三年级（7~9 岁）的儿童英语口语互动应用（人教版三年级上册 Unit 3 *Our Animal Friends*）。当前为**高保真可交互前端预览**，后端 Agent 能力（教材知识库/录音、ASR、TTS、学习记录）尚未联通，UI 统一标注「待接入」，接口出口集中在 `src/api/client.ts`。

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
│   ├── routes/         # API 路由
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
