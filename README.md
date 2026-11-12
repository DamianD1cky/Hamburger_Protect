# Hamburger Protect

一个面向多人跑团的实时任务公告板。GM 可以创建战役、组织玩家、发布任务和维护共享公告板；玩家可以领取任务、更新物资与检查项、提交工作记录，并通过便签和连线共同整理现场信息。

代码采用 MIT License。仓库附带的原创美术资源采用 CC BY-NC 4.0，仅允许非商业使用。详见[许可说明](#许可)。

## 在线体验

- 正式站：<https://hamburger.damiandicky.site>
- 备用入口：<https://hamburger-protect.vercel.app>

在线环境包含真实账号和共享数据。只想查看界面或参与开发时，建议先使用本地演示模式。

## 主要功能

- **多人战役**：GM 创建战役并审批玩家加入，同一账号可以在不同战役拥有不同角色。
- **共享公告板**：16∶9 固定板面，支持桌面和手机自动适配。
- **任务流程**：发布、领取、提交、审核、退回重试和完成归档。
- **房间管理**：成员审批、角色资料、战役归档、公开参观和访客留言。
- **自由便签**：创建、编辑、拖动、排序、换色、图钉、连线与关系说明。
- **板面物件**：可移动业务模块、Emoji 贴纸和共享工作记录。
- **分层主题**：房间背景、板面材质和边框独立配置，支持自定义图片。
- **权限隔离**：Supabase Auth、PostgreSQL、RLS、受控 RPC 和私有 Storage。
- **移动端导航**：手机按物资、任务、排班、防御和记录区域快速切换。

## 技术栈

- React 19 + TypeScript + Vite
- TanStack Query
- Supabase Auth + PostgreSQL + Storage
- PostgreSQL RLS 与 `security definer` RPC
- Vercel

公告板采用固定世界坐标，窗口尺寸只影响视口适配，不改变便签、连线、贴纸和模块之间的空间关系。前端通过乐观更新保持拖动反馈，数据库使用原子操作避免并发保存覆盖其他物件的位置。

## 快速开始

要求：

- Node.js 22
- npm

安装并启动：

```bash
npm install
npm run dev
```

打开 <http://127.0.0.1:5173>。

未配置 Supabase 时，开发环境自动使用浏览器内的演示仓储。也可以在 `.env.local` 中显式指定：

```dotenv
VITE_BACKEND=local
```

演示模式适合界面开发，不提供真实账号、跨设备同步或自定义图片持久化。

## 连接 Supabase

从模板创建本地环境文件：

```bash
cp .env.example .env.local
```

填写公开的前端配置：

```dotenv
VITE_BACKEND=supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_GM_ACCOUNT_DOMAIN=gm.local
```

本地完整 Supabase 环境需要 Docker：

```bash
npm run supabase:up
npm run supabase:status
```

将项目部署到托管 Supabase 前，应先登录 CLI、链接自己的项目，再执行：

```bash
npm run supabase:push
```

不要将 service role key、数据库密码、JWT 私钥或个人访问令牌写入 `VITE_*` 变量。`VITE_*` 会被打包进公开网页。

生产迁移、云端 smoke test 和回退限制见 [Supabase 运维步骤](supabase/OPERATIONS.md)。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 类型检查并构建生产包 |
| `npm run preview` | 预览生产构建 |
| `npm run check` | TypeScript 检查 |
| `npm run check:access-ui` | 账号入口浏览器回归 |
| `npm run check:motion-ui` | 公告板桌面与移动端回归 |
| `npm run check:accounts` | 账号领域测试 |
| `npm run check:database` | PostgreSQL 权限与业务状态回归 |
| `npm run check:board-objects` | 公告板物件与迁移回归 |
| `npm run check:migration` | 历史迁移工具回归 |
| `npm run check:secrets` | 扫描 Git 历史中的敏感信息 |

浏览器回归默认连接 `http://127.0.0.1:5174`，可通过 `HP_PREVIEW_URL` 指定其他预览地址，通过 `CHROME_PATH` 指定 Chromium/Chrome。

## 项目结构

```text
assets/                         项目美术与内容资源
src/
├── app/                        应用入口与状态编排
├── components/board/           公告板视图和编辑器
├── components/composer/        任务与留言编辑器
├── components/handbook/        员工手册界面
├── features/access/            账号、建局和加入战役
├── features/campaign/domain/   战役领域模型
├── features/campaign/data/     本地与 Supabase 仓储
├── features/campaign/hooks/    查询、缓存与乐观更新
├── hooks/                      视图交互 Hook
└── lib/supabase/               Supabase 客户端
supabase/
├── migrations/                 PostgreSQL 增量迁移
├── tests/                      云端事务 smoke test
└── functions/                  Edge Functions
nhost/                          冻结的历史迁移审计基线
```

`nhost/` 不参与当前前端运行时；新的后端变更应通过 `supabase/migrations/` 提交。

## 安全

- 前端只允许保存 Supabase URL 和 publishable key 等公开配置。
- 本地凭据放在被 Git 忽略的环境文件或云平台 Secret 中。
- 运行 `npm run setup:security` 可以安装本仓库的提交前敏感信息扫描。
- GitHub Actions 会执行数据库检查和 Git 历史密钥扫描。
- 发现安全问题时，请不要在公开 Issue 中粘贴凭据、用户数据或可利用细节。请通过仓库所有者公开的私密联系方式报告。

如果凭据曾进入 Git 历史，应先在对应服务撤销或轮换；仅删除当前文件不能使旧凭据失效。

## 参与贡献

1. Fork 仓库并从 `main` 创建分支。
2. 保持改动聚焦，数据库变更使用新的增量 migration。
3. 为行为变化补充相应测试。
4. 提交前至少运行：

```bash
npm run check
npm run check:database
npm run build
```

涉及公告板拖动、移动端布局或视图交互时，再运行：

```bash
npm run check:motion-ui
```

提交贡献即表示你有权提交相关内容，并同意你的代码贡献按 MIT License 发布。请勿提交无授权的图片、字体、音频、品牌素材或用户数据。

## 许可

这是一个**混合许可仓库**，不是所有文件都采用 MIT：

### 源代码

除下述美术资源和第三方内容外，源代码、SQL、配置及仓库原创技术文档采用 [MIT License](LICENSE)。

MIT 允许商业使用、修改、分发和私有使用，但必须保留版权和许可声明。

### 美术资源

以下仓库附带的原创美术资源采用 [Creative Commons Attribution-NonCommercial 4.0 International](assets/LICENSE.md)：

```text
assets/felt.webp
assets/room-kitchen-clean.jpg
assets/scene-blur.jpg
assets/scene.webp
assets/stickers/*.webp
```

这些资源可以在遵守署名要求的前提下用于非商业项目，但**不得用于商业用途**。如需商业授权，必须事先取得版权所有者的单独书面许可。

MIT 代码可以用于商业项目，但商业发行前必须替换或移除上述受限美术资源，包括页面背景、板面纹理、贴纸和 favicon。仅保留 MIT 声明不能解除美术资源的非商业限制。

`assets/汉堡王员工手册.docx` 不属于 MIT 软件许可或上述美术许可的授权范围，不应作为可复用素材重新分发。运行时由用户上传的内容也不因进入本项目而改变其原有权利归属。

第三方组件、图标和字体遵循各自许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 免责声明

本项目是独立创作的跑团工具，与任何现实餐饮品牌及其关联公司不存在隶属、赞助或背书关系。所有第三方商标、品牌名称和标识归其各自权利人所有。
