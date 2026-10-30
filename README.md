# Hamburger Protect

一个围绕「保卫汉堡店」展开的多人跑团任务公告板。玩家是被困在汉○王门店的倒霉员工与顾客，需要在丧尸危机中维持营业、分配工作、记录行动并等待救援。

## 在线访问

<https://hamburger.damiandicky.site>

备用入口：<https://hamburger-protect.vercel.app>

## 玩法入口

所有人先注册一个账号（账号名 + 密码 + 昵称），用同一个账号游玩：

- 员工：登录后填本场角色名、岗位、角色资料和班次码提交入店申请，GM 批准后，该战役会出现在「进行中的战役」列表。
- GM / 值班店长：登录后在「GM / 店长」页申请成为 GM，站长批准后才能创建战役、管理公告板。
- 账号与战役角色相互独立：同一个账号可以同时在一场战役担任员工、在其他战役担任 GM；进入公告板前显式选择本次使用的战役角色。
- 参观公开房间同样需要先登录账号。
- 同一账号同时只能在一个进行中的战役担任员工，但 GM 战役数量不受该约束。
- 只有获批 GM 能发布任务、修改检查项内容并审核工作报告；玩家可以编辑物资和更新检查状态。
- 战役结束后生成只读归档；包含玩家提交报告的完整快照仅本战役获批 GM 可读。

## 账号设置与找回

登录后可打开「账号设置」修改昵称、验证当前密码后更新密码，或退出其他设备。账号昵称与各战役角色名独立保存；普通「退出账号」只退出当前设备。

新注册和修改密码采用至少 15 个字符的长口令；支持空格，按 Supabase bcrypt 的限制拒绝超过 72 个 UTF-8 字节的输入。已有账号仍可使用原密码登录。注册时需要确认密码，所有密码输入均支持显示 / 隐藏和密码管理器自动填充。

账号资料最多缓存 30 秒，页面回到前台和轮询时会重新核对。数据库直接检查 profile 停用状态、Auth 封禁状态及匿名身份，权限不依赖客户端缓存。退出其他设备会撤销 refresh token，已经签发的 access token 在有效期结束前仍可能可用。

当前账号使用 `账号名@gm.local` 虚拟邮箱，不能接收重置邮件。忘记密码应联系站长，通过原先已有的联系渠道核验账号归属后，由站长使用 Supabase Admin API 重置密码；不能仅凭同名角色或班次码认领账号。自助邮件找回需要另行接入真实邮箱验证与 SMTP，当前不提供假邮件找回入口。

## 公告板交互动效

编辑便签与任务时，桌面编辑器从触发位置展开并反向收回，关闭后恢复键盘焦点；手机使用全屏表单。便签拖拽在桌面与触摸屏上都保持直接跟手：手机上轻点便签仍是编辑，拖动超过 8px 才移动；松手短暂落位，保存失败则回到原坐标和置顶层级。移动端导航指示器与公告板区域移动保持一致。

汉堡屋指数、任务状态与计数、在岗人数和待审批数量采用 120 ms 淡出、220 ms 淡入的文字替换，连续更新合并为最新值；辅助技术读取的文字立即更新。时钟不增加此动画。进入战役时先并行加载组件与公告板数据，再通过原生 View Transition API 连接列表与公告板；失败留在原入口，支持重试。没有 API 或开启「减少动态效果」时直接切换。

浏览器回归命令：`npm run check:motion-ui`。默认连接本地 Supabase 模式预览 `http://127.0.0.1:5174`，可通过 `HP_PREVIEW_URL` 指定地址、`CHROME_PATH` 指定 Chrome 路径。测试拦截 Auth/RPC 请求并使用独立夹具，不修改生产数据，覆盖桌面、手机、减少动态效果和 API 降级。测试截图保存在系统临时目录。

## 术语约定

同一个对象在不同语境下用不同的词，三者不混用：

- **战役**：GM 开始的这一局游戏本体。用于生命周期与系统语境，如创建战役、战役名称、归档战役、战役已结束。
- **房间**：战役的共享空间。用于公告板与管理语境，如房间配置、房间成员、房间图片、公开参观房间、移出房间。
- **班次**：汉堡店世界观里的上班班次。用于加入与排班语境，如班次码、申请加入班次、入店申请、危机排班、在岗与离岗。

## 本轮迭代能力

- 任务状态明确区分可领取、已领取、待审核、需重试和已完成；GM 可审核通过或退回重试。
- GM 可管理成员与入店申请，移出玩家后立即失权，未提交任务释放，玩家可重新申请。
- 角色岗位改为自由填写；本人可维护角色名、岗位和最长 2000 字的角色资料。
- 便签目录支持 GM 共享置顶；检查清单支持单层分类。
- 房间配置支持 7 个区块的标题和显隐，以及私有场景背景、便签纸张图片。图片支持 JPEG、PNG、WebP，单文件最大 5 MiB。
- 任意区块添加、复制、删除、游戏时间及社区串门尚未定义，不在本轮范围。

## 站长审批 GM 权限

1. 申请者在「GM / 店长」页点击申请成为 GM 后，把账号名告知站长。站长不需要申请者的密码。
2. 站长登录 Supabase Dashboard，选择 **Hamburger-Protect → Table Editor → public.gm_access**。
3. 根据 `account_name`（格式为 `账号名@gm.local`）和 `display_name` 核对申请者；`auth_user_id` 可核对对应认证账号。
4. 编辑这条记录的 `status`，保存为 `approved`。页面会每 5 秒检查一次审批结果，获批后可创建班次或进入原有战役。
5. 拒绝申请时设置 `rejected`，撤销已有授权时设置 `revoked`。可填写 `review_note` 向申请者说明原因；`reviewed_at` 会自动更新时间。

GM 申请只在账号主动点击申请时建立，默认 `pending`；只读查询状态不会产生申请记录，重复申请不会覆盖已经批准、拒绝或撤销的结果。

只有 Supabase 项目管理员可以审批；网站里的 GM 不能审批自己或他人。审批表对普通账号只开放自己的结果查询，没有写权限。创建战役和所有 GM 写入操作由后端检查授权，撤销权限对现有会话生效。

更新前以匿名身份加入的老玩家已全部停用：档案停用、占位释放、待审申请取消，打开网站会被退出到签到处，需注册账号后用班次码重新申请加入；他们在原战役里留下的便签与工作记录仍保留为历史。

## GM 审批玩家入店

玩家提交班次码后先等待本班次 GM 审批。GM 登录公告板后，顶部「入店申请」按钮会显示待审批数量，点击按钮或点开「危机排班」即可查看角色名、岗位、申请时间和编号，填写可选备注并批准或拒绝。同名成员或申请会提示核对身份。

批准后才创建正式成员，玩家页面每 5 秒检查一次结果并自动进入。未批准前无法读取或修改公告板；其他班次的 GM 无法查看或处理这条申请，玩家无法审批自己或查看其他申请。入店申请、批准、拒绝和撤回都会进入工作记录。

同一账号每个班次只有一条申请，同一时间只能有一条待审批申请；重复提交不会重置批准或拒绝结果。玩家可以撤回尚未处理的申请再申请其他班次，班次归档会取消剩余待审批申请。更新前已加入的成员保留。

该功能阻止持有班次码的人自动加入；账号由账号名 + 密码找回，GM 批准前仍需联系玩家核对身份。

## 员工手册规则

网站文案与默认内容来自 `assets/汉堡王员工手册.docx`，主要映射为：

- 岗位自由：厨师、维修师、服务员、店长与顾客都可按现场情况行动。
- 危机营业：未获批准不得擅自离岗，管理层失联时依据现场信息继续处理。
- 创造性利用：厨房、前厅、仓库、维修区和休息室内的物资不局限于标签用途。
- 员工安全：异常顾客不适用常规服务流程，危险行动优先评估人员安全。
- 工作记录：任务提交相当于员工行动报告，需由 GM 审核。
- 汉堡与士气：没有明确行动时，角色默认继续制作汉堡。

## 技术栈

- Vite + React + TypeScript
- TanStack Query
- Supabase Auth、PostgreSQL、受控 RPC、RLS 与私有 Storage（生产后端）
- TanStack Query 每 5 秒轮询公告板
- Vercel

## 本地运行

```bash
npm install
npm run dev
```

默认访问 <http://127.0.0.1:5173>。本地未配置后端时使用浏览器演示仓储；也可以明确配置 `VITE_BACKEND=local`。生产环境使用 `VITE_BACKEND=supabase`，连接或认证失败不会回退到本地数据。

## Nhost 历史基线

Nhost 业务数据已经冻结，目录仅保留迁移审计、恢复基准与 Hasura metadata，不进入前端运行时：

```text
nhost/
├── nhost.toml
├── migrations/default/
│   ├── 20261015000000_hamburger_protect_schema/
│   └── 20261015010000_handbook_employee_roles/
└── metadata/databases/default/
    ├── tables/
    └── functions/
```

后端定义包含：

- 战役、成员岗位、任务、任务提交、留言、资源、检查项和事件日志
- 统一的账号名 + 密码账号；GM 能力来自独立审批，不来自账号类型
- PostgreSQL 约束保证同一账号只能有一个活跃玩家成员关系，同时允许其拥有多个 GM 成员关系
- GM 专属建局、任务管理、审核和归档函数
- 玩家专属加入、领取和提交任务函数
- GM 可控制公开参观；访客只读查看公告板并通过独立留言区互动
- Hasura `user` / `anonymous` 角色的行级、列级与关系权限

## 云端部署

1. 使用 `npm run supabase:push` 将已评审迁移部署到已链接的 Supabase 项目，禁止对生产库执行重置。
2. 先运行云端事务 smoke test；R10 使用 `npx supabase db query --linked --file supabase/tests/public_visits_smoke.sql`，再确认 `private.runtime` 的业务写入与公开状态。
3. Vercel 配置 `VITE_BACKEND=supabase`、Supabase URL、publishable key 和 GM 账号域名。
4. 运行 `npm run check`、`npm run check:database`、`npm run build` 和密钥扫描后部署前端。
5. 生产域名为 <https://hamburger.damiandicky.site>；部署后验证桌面、手机、Auth 和 Storage 签名 URL。

## 目录结构

```text
src/
├── app/                         应用入口与状态编排
├── components/board/            公告板视图组件
├── components/composer/         任务/留言编辑器
├── components/handbook/         员工手册速查
├── features/access/             登录、建局、加入战役
├── features/campaign/domain/    战役领域类型与状态机
├── features/campaign/data/      本地与 Supabase 数据仓储
├── features/campaign/hooks/     React 数据接口
├── hooks/                       纯视图交互 Hook
└── lib/supabase/                Supabase 客户端
nhost/                           旧数据库迁移、配置与 Hasura metadata
supabase/                        生产数据库迁移、测试与 Edge Functions
```

## 验证

```bash
npm run check
npm run check:accounts
npm run check:database
npm run check:migration
npm run build
npm run check:secrets
```

## 开源仓库的密钥保护

前端只配置 Supabase URL、publishable key 等公开标识。管理密钥、JWT 私钥、个人访问令牌和密码保存在本地忽略文件或云平台的 Secret 配置中；`VITE_` 前缀的变量会进入公开网页，不能存放凭据。

本地安装 Gitleaks 后，运行 `npm run setup:security` 启用提交前与推送前检查，运行 `npm run check:secrets` 扫描全部 Git 历史。每个新克隆都需要执行一次设置。GitHub Actions 会扫描提交历史和公开文件，输出中的凭据全部脱敏。

提交者邮箱也会公开。请在 GitHub 的 Settings → Emails 中复制隐私邮箱，使用 `git config --local user.email "你的 GitHub 隐私邮箱"` 配置本仓库。此设置只影响后续提交，无法删除旧提交中的邮箱。

若凭据曾进入公开历史，应先在对应服务撤销或轮换，再处理 Git 历史；仅删除当前文件无法消除历史副本。


## Supabase 接入与迁移

Supabase 已承接生产读写，历史数据和 GM 身份已迁移。前端运行时只支持 Supabase；冻结的 Nhost 业务数据保留为迁移审计与恢复基准，不能直接承接当前业务写入。

Supabase 前端公开配置：

```dotenv
VITE_BACKEND=supabase
VITE_SUPABASE_URL=你的项目 URL
VITE_SUPABASE_PUBLISHABLE_KEY=你的 publishable key
VITE_GM_ACCOUNT_DOMAIN=gm.local
```

本地 Supabase CLI 提供的 anon key 可以填入同一公开 key 配置。管理 Secret、数据库连接和密码绝不能使用 `VITE_` 前缀。

后端文件位于 `supabase/`，数据库基线包含 11 张业务表、独立 `profiles`、RLS、受控业务函数、原子日志和归档隐私。新实例默认关闭业务写入；部署 SQL 后仍需导入与核对数据，再显式开放。

```bash
npm run check
npm run check:accounts
npm run check:database
npm run check:migration
npm run build
```

数据库测试使用 PGlite 执行 PostgreSQL SQL，模拟 Supabase 可信 JWT 上下文，验证权限和业务状态。迁移测试验证快照校验、完整回滚、日志、微秒时间、identity 序列及 HTTP 身份验证。它们不替代云端 Auth、真实连接和并发事务验收。

本地完整 Supabase 需要 Docker；当前可用 CLI：

```bash
npm run supabase:up
npm run supabase:status
```

部署时先通过 CLI 认证并链接到正确目标项目，再使用 `npm run supabase:push`。本地配置默认 PostgreSQL 17，目标数据库必须先实测版本与兼容性。不要对现有生产库运行重置命令。

迁移操作顺序、环境变量及回退限制见 [Supabase 运维步骤](supabase/OPERATIONS.md)。真实快照只保存到仓库外，工具默认拒绝覆盖文件、拒绝导入非空目标、拒绝在业务写入开放时导入。

迁移后的站长审批位置为 Supabase Table Editor 的 `public.gm_access`；只修改目标身份对应记录的 `status` 和可选备注。账号身份保存在 `profiles`，授权仍来自 GM 审批表及战役成员关系，不能通过编辑用户 metadata 批准 GM。

原 Nhost 中 24 个带密码的 GM 已通过 bcrypt 哈希迁移保留原密码，账号名和审批状态不变；无需使用迁移初始密码。另有 1 个来源账号原本没有密码，继续按站长交接方式处理。
