# 原 Agent 联调阻塞诊断（脱敏）

状态：**阻塞中** —— 平台自定义环境变量未注入到当前开发沙箱进程环境。

## 两个布尔判断（本轮）
- `process.env.AB_ENV_PROBE === "present"` → **false**
- `ANIMAL_BUDDY_AGENT_TOKEN` 非空 → **false**

## 完整核查范围（不重复展开，详见提交记录）
shell env / PID1 / dev 进程 environ / 全量 env 变量名 / `.coze` / `.env*` / 挂载路径 —— 无任何用户自定义变量。

## 关键结论
- 平台注入变量全部为 `COZE_*` 前缀，无用户自定义变量。
- `COZE_PROJECT_ENV=DEV`，但 `COZE_DEVBOX_ENV=prod`、`COZE_SERVER_ENV=prod`（疑为注入差异根因，需平台确认）。
- 需求：若平台支持"开发环境重新初始化"或"安全凭据运行时读取"机制，请提供**确认的入口或端点契约**后再接入；在获得明确指引前，**不编造**入口，不修改已就绪的原 Agent 调用逻辑。

## 应用侧
- `/api/chat` 读取 `process.env.ANIMAL_BUDDY_AGENT_TOKEN`，缺失时如实 502，不回退豆包。
- ASR/TTS/record/网页/素材全部保留；未部署生产；未删除数据；任何 Token 未写入源码/终端/前端/日志。