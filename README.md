# projects

这是一个基于 Express + Vite + TypeScript + Tailwind CSS 的全栈 Web 应用项目，由扣子编程 CLI 创建。

**核心特性：**
- 🚀 前端：Vite + TypeScript + Tailwind CSS
- 🔧 后端：Express + TypeScript，提供 RESTful API
- 🔥 开发模式：Vite HMR + Express API，单进程启动
- 📦 生产模式：Express 静态服务 + API，高性能部署

## 快速开始

### 启动开发服务器

```bash
coze-dev dev
```

启动后，在浏览器中打开 [http://localhost:5000](http://localhost:5000) 查看应用。

开发服务器支持热更新（HMR），修改代码后页面会自动刷新。

### 构建生产版本

```bash
coze-dev build
```

构建生成 `dist/`（前端）和 `dist-server/`（Express 后端）。本应用的 ASR、TTS、教学工作流和学习记录需要 Node 后端；只把 `dist/` 放到 GitHub Pages 等静态托管服务，会导致 `/api/*` 失效。GitHub 仓库保存源代码，不会自动更新扣子线上版本。

### 预览生产版本

```bash
coze-dev start
```

启动 Express 生产服务器，同时提供前端和 API。普通 Node 托管环境使用 `corepack pnpm install --frozen-lockfile`、`corepack pnpm build`、`corepack pnpm start`；请使用 packageManager 指定的 pnpm 9。

### Animal Buddy 运行配置与验证

- 服务端读取 `.env`（参考 `.env.example`）。模型、语音和存储凭据不能用 `VITE_` 前缀，否则可能进入浏览器构建。
- 扣子发布环境沿用平台注入的 SDK 身份；外部 Node 托管需配置 SDK 支持的 `COZE_API_TOKEN`，并验证账号权限、配额和对象存储配置。GitHub 访问令牌不能用作 Coze API 凭据。
- `AB_SESSION_SECRET` 设置为固定的随机长字符串（至少 32 字节），使签名匿名学生 cookie 在重启后继续有效；未设置时使用本次进程的随机密钥，重启会重新生成学生身份。多个实例必须使用同一密钥。
- 学生身份由 HttpOnly 签名 cookie 确定，忽略客户端传入的 uid。旧的共享 `animal-buddy-user` 数据保留，但不能分配给某一位新学生。当前无实名账号或教师端认证。
- 教材原声优先从仓库 `assets/*.mp3` 同源提供；缺文件时才尝试原对象存储链接。单句听写使用对应题目文字的 TTS，明确标为合成朗读；未核验录音切片不能用于单句评分。
- `/api/health` 只报告后端存活及云端凭据是否配置，`checked:false` 表示没有证明服务可调用；模型成功响应后页面才显示“模型已响应”。模型不可用时使用明确标注的教材工作流话术。ASR/TTS 不伪装成功。
- 生产环境会话仍是单进程内存态，学习记录仍依赖对象存储。多实例正式使用前应迁移会话与记录到共享数据库，并实现存储分页（当前对超过 1000 条记录明确报错）。
- 验证：`corepack pnpm ts-check`、`corepack pnpm build`、`corepack pnpm test`。浏览器中再核验麦克风授权、30 秒录音上限、重听、场景切换和移动端点击播放。
- GitHub 修复提交完成后，需在扣子导入更新代码、重新构建并发布，原 `coze.site` 地址才会应用修改。

## 项目结构

```
├── server/                # 后端服务器目录
│   ├── index.ts          # express 服务器入口
│   ├── routes/           # API 路由目录
│   │   └── index.ts      # 路由定义
│   └── vite.ts           # Vite 集成逻辑
├── src/                   # 前端源码目录
│   ├── index.ts          # 前端应用入口（初始化）
│   ├── main.ts           # 前端主逻辑文件
│   └── index.css         # 全局样式（包含 Tailwind 指令）
├── index.html            # HTML 入口文件
├── vite.config.ts        # Vite 配置
├── tailwind.config.ts    # Tailwind CSS 配置
└── tsconfig.json         # TypeScript 配置
```

**目录说明：**

- **`server/`** - 后端服务器代码
  - `server.ts` - 服务器主入口，负责创建和启动 Express 应用
  - `routes/` - API 路由模块，支持按功能拆分路由
  - `vite.ts` - Vite 开发服务器和静态文件服务集成

- **`src/`** - 前端应用代码
  - 所有前端相关代码都在这里

**工作原理：**

- **开发模式** (`coze-dev dev`)：
  - 运行 `server/server.ts` 启动 Express 服务器
  - Vite 以 middleware 模式集成到 Express
  - 前端支持 HMR（热模块替换）
  - 后端 API 和前端在同一进程，端口 5000

- **生产模式** (`coze-dev start`)：
  - `coze-dev build` 构建前端 → `dist/` 目录
  - `coze-dev build` 构建后端 → `dist-server/index.js` (CommonJS 格式)
  - 运行 `dist-server/index.js` 启动生产服务器
  - Express 服务静态文件 + API 路由
  - 单一 Node.js 进程，轻量高效

## 核心开发规范

### 1. 后端 API 开发

**添加新的 API 路由**

在 `server/routes/index.ts` 中添加路由：

```typescript
// GET 请求示例
router.get('/api/users', (req, res) => {
  res.json({
    users: [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ],
  });
});

// POST 请求示例
router.post('/api/users', (req, res) => {
  const userData = req.body;
  // 处理业务逻辑
  res.json({
    success: true,
    user: userData,
  });
});

// 动态路由参数
router.get('/api/users/:id', (req, res) => {
  const userId = req.params.id;
  res.json({
    id: userId,
    name: 'User ' + userId,
  });
});
```

**拆分路由模块**（推荐）

当路由变多时，可以按功能拆分：

```typescript
// server/routes/users.ts
import { Router } from 'express';

const router = Router();

router.get('/api/users', (req, res) => {
  // 用户列表逻辑
  res.json({ users: [] });
});

router.post('/api/users', (req, res) => {
  // 创建用户逻辑
  res.json({ success: true });
});

export default router;
```

然后在 `server/server.ts` 中注册：

```typescript
import usersRouter from './routes/users';

// 注册路由
app.use(usersRouter);
```

**前端调用 API**

```typescript
// GET 请求
async function getUsers() {
  const response = await fetch('/api/users');
  const data = await response.json();
  console.log(data);
}

// POST 请求
async function createUser(name: string) {
  const response = await fetch('/api/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });
  const data = await response.json();
  console.log(data);
}
```

**API 最佳实践**

- ✅ 所有 API 路由以 `/api` 开头，避免与前端路由冲突
- ✅ 使用 RESTful 设计：GET 查询、POST 创建、PUT 更新、DELETE 删除
- ✅ 返回统一的响应格式：`{ success: boolean, data?: any, error?: string }`
- ✅ 添加错误处理和参数验证

### 2. 样式开发

**使用 Tailwind CSS**

本项目使用 Tailwind CSS 进行样式开发，支持亮色/暗色模式自动切换。

```typescript
// 使用 Tailwind 工具类
app.innerHTML = `
  <div class="flex items-center justify-center min-h-screen bg-white dark:bg-black">
    <h1 class="text-4xl font-bold text-black dark:text-white">
      Hello World
    </h1>
  </div>
`;
```

**主题变量**

主题变量定义在 `src/index.css` 中，支持自动适配系统主题：

```css
:root {
  --background: #ffffff;
  --foreground: #171717;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}
```

**常用 Tailwind 类名**

- 布局：`flex`, `grid`, `container`, `mx-auto`
- 间距：`p-4`, `m-4`, `gap-4`, `space-x-4`
- 颜色：`bg-white`, `text-black`, `dark:bg-black`, `dark:text-white`
- 排版：`text-lg`, `font-bold`, `leading-8`, `tracking-tight`
- 响应式：`sm:`, `md:`, `lg:`, `xl:`

### 2. 依赖管理

**必须使用 pnpm 管理依赖**

```bash
# ✅ 安装依赖
pnpm install

# ✅ 添加新依赖
pnpm add package-name

# ✅ 添加开发依赖
pnpm add -D package-name

# ❌ 禁止使用 npm 或 yarn
# npm install  # 错误！
# yarn add     # 错误！
```

项目已配置 `preinstall` 脚本，使用其他包管理器会报错。

### 3. TypeScript 开发

**类型安全**

充分利用 TypeScript 的类型系统，确保代码质量：

```typescript
// 定义接口
interface User {
  id: number;
  name: string;
  email: string;
}

// 使用类型
function createUser(data: User): void {
  console.log(`Creating user: ${data.name}`);
}

// DOM 操作类型推断
const button = document.querySelector<HTMLButtonElement>('#my-button');
if (button) {
  button.addEventListener('click', () => {
    console.log('Button clicked');
  });
}
```

**避免 any 类型**

尽量避免使用 `any`，使用 `unknown` 或具体类型：

```typescript
// ❌ 不推荐
function process(data: any) { }

// ✅ 推荐
function process(data: unknown) {
  if (typeof data === 'string') {
    console.log(data.toUpperCase());
  }
}
```

## 常见开发场景

### 添加新页面

本项目是单页应用（SPA），如需多页面：

1. 在 `src/` 下创建新的 `.ts` 文件
2. 在 `vite.config.ts` 中配置多入口
3. 创建对应的 `.html` 文件

### DOM 操作

```typescript
// 获取元素
const app = document.getElementById('app');
const button = document.querySelector<HTMLButtonElement>('.my-button');

// 动态创建元素
const div = document.createElement('div');
div.className = 'flex items-center gap-4';
div.textContent = 'Hello World';
app?.appendChild(div);

// 事件监听
button?.addEventListener('click', (e) => {
  console.log('Clicked', e);
});
```

### 数据获取

```typescript
// Fetch API
async function fetchData() {
  try {
    const response = await fetch('https://api.example.com/data');
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to fetch data:', error);
  }
}

// 使用数据
fetchData().then(data => {
  console.log(data);
});
```

### 环境变量

仅允许公开的前端配置使用 `VITE_` 前缀；服务端密钥使用不带此前缀的变量，并保存在服务端 `.env` 或托管平台密钥设置中：

```bash
VITE_API_URL=https://api.example.com
```

在代码中使用：

```typescript
const apiUrl = import.meta.env.VITE_API_URL;
console.log(apiUrl); // https://api.example.com
```

## 技术栈

**前端：**
- **构建工具**: Vite 7.x
- **语言**: TypeScript 5.x
- **样式**: Tailwind CSS 3.x

**后端：**
- **框架**: Express 4.x
- **内置中间件**: express.json(), express.urlencoded(), express.static()

**工具：**
- **包管理器**: pnpm 9+
- **运行时**: Node.js 18+
- **开发工具**: tsx (TypeScript 执行器)

## 参考文档

**前端：**
- [Vite 官方文档](https://cn.vitejs.dev/)
- [TypeScript 官方文档](https://www.typescriptlang.org/zh/docs/)
- [Tailwind CSS 文档](https://tailwindcss.com/docs)

**后端：**
- [Express 官方文档](https://expressjs.com/)
- [Express 中文文档](https://expressjs.com/zh-cn/)

## 重要提示

1. **必须使用 pnpm** 作为包管理器
2. **使用 TypeScript** 进行类型安全开发，避免使用 `any`
3. **使用 Tailwind CSS** 进行样式开发，支持响应式和暗色模式
4. **环境变量必须以 `VITE_` 开头** 才能在客户端代码中访问
5. **开发时使用 `coze-dev dev`**，支持热更新和快速刷新
6. **API 路由以 `/api` 开头**，避免与前端路由冲突
7. **单进程架构**：开发和生产环境都是前后端在同一进程中运行

## 常见问题

**Q: 如何分离前后端端口？**

如果需要前后端分离部署，可以：
- 前端：使用 `npx vite` 单独启动（默认端口 5173）
- 后端：修改 `server.ts`，移除 Vite middleware，单独启动

**Q: 如何添加数据库？**

```bash
# 安装数据库客户端（以 PostgreSQL 为例）
pnpm add pg
pnpm add -D @types/pg

# 在 server.ts 中使用
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
```

**Q: 如何部署？**

1. 运行 `coze-dev build` 构建前后端
2. 将整个项目上传到服务器
3. 运行 `pnpm install --prod`
4. 运行 `coze-dev start` 启动服务
