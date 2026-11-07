# 多人 App / 公告板 Harness 原型

本分支从本地 `main` 派生，提供可运行的第一条完整流程：GM 创建组件 → 预览修改 → 发布 → 玩家操作授权资源 → 另一客户端同步读取。

## 这一版可以做什么

- 同一套 App、账号和战役入口。iOS／Android 进入战役后默认打开工作台，GM 和玩家共用客户端，身份按战役决定。
- 工作台支持说明、资源计数、进度钟；每个实例有独立 UUID、配置和运行数据。调查、潜入、汉堡店提供三个内置模板，添加模板不会覆盖已有内容。
- GM 可新增、改名、调整上限、设置可见范围和操作权限、移除组件。配置修改保留现有数值；上限低于当前数值时拒绝修改。
- 玩家只能填写开放的说明、增减开放的计数与进度；观察者只读。GM 私密组件在服务端过滤，不进入玩家的响应或模型上下文。
- 助手接收自然语言请求，返回说明或一批受限操作。用户检查预览后应用；手动操作也使用相同命令入口。未配置模型时明确提示，不把内置模板当作 AI 生成。
- 云端每 3 秒轮询可见组件。所有修改在服务端事务中校验身份、房间状态、版本、数值范围和幂等请求 ID，失败整批回滚。
- 断网时云端共享编辑暂停，不积压离线命令；重新连网后重新读取。当前会话中已读取的数据可留在内存，本版没有持久化云端私密内容缓存。

## 本地体验

```sh
npm install
VITE_BACKEND=local npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

打开 `http://127.0.0.1:5173/`，点击左下方「跑团工作台」：

1. 选择调查模板，检查三个新增组件并应用。
2. 切换顶部「演示身份」为玩家，减少调查经费并应用。
3. 同一浏览器另开一个窗口，进入同一工作台；以 GM 身份查看同步结果。
4. GM 增加私密说明，切回玩家确认该说明不可见。

本地模式使用 LocalStorage＋Web Locks，仅演示同源浏览器窗口同步，不能用于跨设备联机或存放真实私密资料。演示角色选择器不会在云端出现。AI 服务仅在 Supabase 模式启用。

## 云端与模型配置

先在独立 Supabase 测试项目中应用仓库全部迁移，包括：

`supabase/migrations/20261107010000_harness.sql`

沿用已有 `VITE_BACKEND=supabase`、`VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY`。两台设备指向同一项目、由两个账号进入同一战役即可共享组件。建团、GM 审批和玩家加入审批继续使用现有业务流程。

可选部署 `supabase/functions/board-agent`，在服务端 secrets 中配置：

| 变量 | 值 |
| --- | --- |
| `HARNESS_MODEL_URL` | OpenAI Chat Completions 兼容的完整 HTTPS 端点 |
| `HARNESS_MODEL_KEY` | 仅保存在 Edge Function 的模型密钥 |
| `HARNESS_MODEL` | 支持 `response_format: json_object` 的模型名称 |
| `HARNESS_ALLOWED_ORIGINS` | 逗号分隔的客户端来源；原生默认 `capacitor://localhost,https://localhost`，Web 测试需添加实际来源 |

模型密钥不能写入 `VITE_*` 或打包进 App。Supabase 自动提供 `SUPABASE_URL`、`SUPABASE_ANON_KEY`；函数不使用 service-role 密钥。函数通过携带发起者 JWT 的 `get_harness_board` 和 `reserve_harness_agent_request` RPC 验证身份、成员关系和限额。每个账号每分钟最多 6 次模型请求，单次模型请求超时 45 秒。

配置中的 `verify_jwt=false` 只关闭 Edge 网关旧式 JWT 检查，实际身份仍由上述数据库请求验证，以兼容非对称签名密钥。未认证或已撤权用户无法取得模型上下文或触发推理。

本次未执行云端迁移、函数部署或真实付费模型调用。模型适配器已用可控 HTTP 测试替身验证；具体供应商的结构化输出与跨域需在测试项目验收。

## 原生工程

已生成 `ios/` 和 `android/`，应用 ID 为 `app.hamburgerprotect.table`，复用现有 React 界面和登录流程：

```sh
# 选择测试项目环境后，将当前 Web 构建同步进原生工程
npm run app:sync
npm run app:ios
# 或
npm run app:android
```

`app:sync` 使用当前 Vite 环境；本机离线演示构建可用 `VITE_BACKEND=local npm run app:sync`。安装包不启动 Vite，也不要求玩家自行部署前端；云端多人功能仍依赖共同的 Supabase 服务。

Capacitor 8.6，iOS 最低 15，Android 最低 API 24、编译／目标 API 36。原生编译需要对应 Xcode／Android SDK、JDK；发行签名和应用商店发布另行配置。当前图标和启动屏沿用 Capacitor 工程初始资源，正式发行前需替换。

`capacitor.config.json` 使用 JSON，避免当前仓库 TypeScript 7 与旧 Node 22 配置加载 API 的兼容问题。不要配置远程 `server.url` 来代替内置 App 资源。

## 协议与并发规则

- `HarnessBoard`：`schema: 1`、房间级 `revision`、组件实例数组。
- `Block`：`id/kind/title/visibility/editable/max` 为配置，`value/text` 为运行数据。
- `Command`：唯一 ID、基础版本、1–20 个操作；最多 100 个组件。
- 工具集合：`create`、`configure`、`adjust`、`write`、`remove`。AI 和按钮都不能执行任意代码。
- UI 编辑表单和模型提案绑定读取时的版本。期间发生其他修改会要求重新生成，避免将过期草稿套用到最新版本。
- 写操作先锁战役，再处理幂等、版本检查和整批操作；与成员移除、归档共用战役锁。
- 幂等账本保存在 `private.harness_commands`，包含发起者、基础版本、操作和时间；客户端不能直接读取该表，避免日志泄露。
- 同一请求重放时重新检查成员权限，并返回当下可见状态，不返回可能包含旧私密内容的历史响应。
- 不把助手对话作为状态真相；只有命令返回成功才显示保存成功。

本版采用保守的房间级版本校验，编辑不同组件也可能产生冲突。后续有实际并发压力时可细化到组件版本。新增组件与传统汉堡店板并列存储，避免将原有固定模块的数据在此轮迁移中重写。

## 验证

```sh
npm run check
npm run check:harness
npm run check:harness-db
npm run check:database
node --experimental-strip-types --test scripts/tests/accounts.mjs
# 本地演示服务启动后：
npm run check:harness-ui
```

`check:harness-db` 在 PGlite PostgreSQL 中应用全部迁移，验证私密读取、玩家与观察者权限、批次回滚、陈旧版本、幂等、撤权重试、归档和模型限额。无需远端凭据。

浏览器测试使用独立上下文，覆盖桌面／手机、两个窗口同步、角色切换、改配置保留玩家数据、陈旧提案拒绝、页面往返。截图输出系统临时目录 `/tmp/harness-ui/`，不加入仓库。

本次验证：Web 生产构建及两端 `cap sync` 成功；新增 PostgreSQL 38 项、既有数据库 166 项、账号 8 项断言通过，模型适配器测试通过。iOS 编译尝试停留在 Swift Package 解析阶段，已停止，未确认原生编译成功。本机有 Xcode 26.3 和 iOS SDK，但没有已安装的模拟器运行时；Android 未安装 JDK／SDK，未尝试编译。未生成可验收的原生安装包。

## 仍待后续迭代

这是一版组件与命令闭环原型，还不是完整通用跑团平台。暂未提供表格／列表／附件、字段所有者、私人 Agent 会话历史、多步自主 Agent 循环、撤销界面、模板导入导出、推送、离线合并、局域网主机及应用内更新。现有建团／角色入口仍保留汉堡店用语和 GM 审批规则。

跨真实设备联机、后台恢复、真机键盘／文件操作、真实模型质量和发行安装包均需在部署测试环境及安装原生 SDK／设备后验收。不要将浏览器视口测试当作真机 App 验证。
