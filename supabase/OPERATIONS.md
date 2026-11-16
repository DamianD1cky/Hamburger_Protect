# Supabase 迁移运维步骤

## 事件钟

`20261116000000_event_clocks.sql` 增加事件钟表、GM 写入 RPC、成员及公开房间读取与活动记录。
迁移将现有战役的汉堡屋指数保留为状态刻度，不把绿3当成后果触发；新战役默认无事件钟。
各事件钟保存时校验独立 revision，冲突时拒绝覆盖。进度填满与回退只记录事件，不自动执行规则后果。
上线前应用迁移；前端可在旧服务器上继续读取旧指数，新增及修改需要新 RPC。

## 透视背景配置

`20261115010000_perspective_background.sql` 扩展既有 GM 外观 RPC，允许保存路口/车站
与动态开关。旧主题仍有效，图片路径、成员权限和物件坐标校验保持一致。
部署新前端前应用该迁移；无需上传视频或新增 Storage 资源。

## 直接执行

本目录提供新的 Supabase 后端与迁移工具。目标项目 `wnutyroweeipsxyhlocx` 已完成生产切换：Supabase 负责读写，Nhost 业务数据冻结保留为恢复基准。18 项云端 SQL 检查、匿名身份恢复及并发验收均已通过；默认保留全部历史数据。

先在仓库外的受保护环境文件配置 `MIGRATION_SOURCE_DB_URL` 与 `MIGRATION_TARGET_DB_URL`。来源是 Nhost PostgreSQL 的授权连接，目标是已部署基线的 Supabase 数据库；连接参数应包含平台要求的 TLS 配置。命令通过 Node 的 `--env-file` 读取，连接字符串和管理凭据不放进命令行。

| 配置 | 用途 |
|---|---|
| `MIGRATION_SOURCE_DB_URL` | 来源一致快照、业务停写与状态核查 |
| `MIGRATION_TARGET_DB_URL` | 新目标导入、核对与运行开关 |
| `MIGRATION_SUPABASE_URL` | 服务端创建目标 GM 账号 |
| `MIGRATION_SECRET_KEY` | 目标项目专用服务端 Secret |
| `MIGRATION_GM_ACCOUNT_DOMAIN` | 合成 GM 邮箱域名，默认 `gm.local` |

统一入口是 `node --env-file=仓库外的配置文件 scripts/migration/cli.mjs 命令`。请将说明中的路径替换为实际受保护文件，快照输出也必须位于仓库外。工具只输出数量、校验摘要、必要 ID 和状态，不输出密码或 token。

### 1. 本地与预发布验证

执行 `npm run check`、`npm run check:database`、`npm run check:migration` 和 `npm run build`。`supabase/tests/cloud_smoke.sql` 与 `supabase/tests/iteration_smoke.sql` 可通过已授权 CLI 的 `db query --linked --project-ref 目标项目 --file 测试文件` 运行，测试数据在事务结束时回滚。部署 Supabase 基线到新的目标项目，保持 `private.runtime.business_writes=false`。配置 Auth：匿名登录启用、密码最少 8 位、合成邮箱方案关闭邮件确认、Site URL 与允许重定向地址设置正确。

先导出一次来源一致快照，使用 `export --output 仓库外的快照.snapshot.json`；使用 `validate --file 快照路径` 校验文件，使用 `import --file 快照路径 --rehearsal` 导入空的演练目标，再使用 `verify --file 快照路径` 核对。演练项目用完后保留其核验结果；正式目标必须新建，不能让工具覆盖演练数据。

实际验证主版本、TLS 连接、GM 合成邮箱可用性和 Supabase Auth 事件。记录完整迁移耗时，用实测结果确定停写窗口。当前本地 SQL 测试不能代替跨连接竞争测试，预发布至少覆盖双人领取、并发审批与归档竞争。

### 2. 正式停写与最终导入

使用 `source-freeze` 在来源 11 张业务表安装语句级停写保护；既有 Hasura mutation、业务 definer 函数和旧会话均受到保护，Auth 表保留写入与刷新。安装过程在事务内执行，等待表锁后提交。用旧页面和旧 token 实际尝试写入，确认拒绝。另外在 Nhost Auth 配置中关闭公开注册与匿名新建，保留旧会话刷新和必要登录。数据库停写工具不会自动修改 Auth 服务配置。

导出最终快照，验证 `sourceFrozen=true`；使用 `import --file 快照路径` 导入空的正式目标，工具在事务内暂停仅用于派生事件的应用触发器，保持外键有效，逐表核对后提交。目标仍未开放业务写入。

运行 `migration-window --days 14` 开启身份迁移窗口。对需要迁移的真实 GM，运行 `create-gm --actor 原业务UUID --username 原账号名` 创建账号并关联。工具生成随机初始密码且不显示；站长核验本人后通过 Supabase Auth 安全重置并交接，用户设置新密码。若创建成功而关联失败，工具返回目标 Auth ID，站长先核对并解决孤立账号，不盲目重试。

已经存在的目标账号可由站长核验后运行 `bind --actor 原业务UUID --auth 新认证UUID`；此命令不能用于未经核验的角色找回。工具保留审批状态，不能自动批准用户。迁移期间目标公开注册保持关闭；完成全部旧 GM 账号预占后再开启统一账号注册。当前匿名账号已停用，不再开启匿名新建。

### 3. 历史匿名身份迁移接口

本节只保留迁移期的审计记录。匿名身份已经停用，活跃前端不再携带 Nhost SDK 或 `VITE_NHOST_*` 配置；`migrate-identity` 不应重新开放。

为函数配置以下 Secret：

| 配置 | 值的含义 |
|---|---|
| `MIGRATION_PUBLISHABLE_KEY` | 目标 Supabase 公开 key |
| `MIGRATION_SECRET_KEY` | 服务端专用目标 Secret，或仅本地使用的 service_role key |
| `NHOST_AUTH_URL` | 固定旧 Auth 基地址，包含 `/v1`，不含末尾 `/user` |
| `MIGRATION_ENDS_AT` | 明确 ISO 截止时间，与数据库窗口一致 |
| `MIGRATION_ALLOWED_ORIGINS` | 逗号分隔的正式与预发布域名 |

函数验证目标 JWT 和旧 Nhost Bearer token，再由服务端 RPC 原子关联，用户不能提交认证服务器地址或可信旧 ID。每个目标认证身份最多 20 次迁移尝试每小时；数据库与 Edge 时间窗口均必须开放。当前 Edge 截止时间故意保持过期；正式身份迁移前需同步更新 `MIGRATION_ENDS_AT`。设置 JWT 验证为开启，不为解决错误而关闭。

迁移期内，旧 refresh token 已失效或旧浏览器身份丢失的玩家无法自动恢复，只能由 GM 与站长人工核验。当前统一账号模式不再创建或绑定匿名身份。

### 4. 部署、开放与观察

更新 Vercel 的 Supabase 公开配置后重新构建，先检查已绑定 GM 和已有玩家的读取。维护期间不允许创建新的业务身份，防止新数据混入最终数据核对。

运行 `verify --file 最终快照` 核对目标，再运行 `target-open --file 最终快照`。开放命令会再次连接来源，检查它仍停写，并检查目标 RLS、直接写权限、触发器和逐表内容后开启目标。它不替代实际 Auth、页面和跨连接测试。

开放后在专用验收战役验证完整流程，观察错误和真实用户反馈。来源保持停写。需要检查开关可运行 `status`；需要暂停目标业务可运行 `target-close`。

### 5. 回退与收尾

目标开放业务写入前可恢复旧 Vercel 版本、旧配置，再运行 `source-thaw`。命令只解除来源业务保护，不删除历史数据库或备份。旧 Nhost 会话在窗口内保留。

目标开放写入后，先关闭目标、保留全部新增数据，优先修复目标。当前工具没有自动反向同步：新业务身份在旧 Nhost Auth 中可能不存在，不能直接回到旧站并丢弃新数据。必须另行完成反向数据与账号恢复，或明确获得接受数据损失的授权。

观察至少一次真实跑团流程。身份窗口结束后运行 `migration-window --days 0`，关闭 Edge Function 并撤销迁移专用 Secret。活跃前端已经移除 Nhost 配置与运行时代码；保留迁移工具、备份和未绑定历史 profile 作为审计资料。是否停用旧 Nhost 项目由既定恢复窗口决定。

### 6. 网站迭代增量迁移

`20261028000000_iteration_p0_p2.sql` 是生产基线之后的增量迁移，新增房间配置、清单分类、角色资料、便签置顶、成员移出和私有图片 Storage。部署顺序固定为：本地数据库回归、`npm run supabase:push:dry`、`npm run supabase:push`、真实云端 smoke SQL、前端构建、Vercel 部署、生产只读 smoke。

生产增量迁移默认由 `scripts/supabase-push-management.mjs` 通过 Supabase Management API 的 HTTPS SQL 通道部署。脚本比较本地与远端版本，对每条待部署 migration 使用事务和 advisory lock，并在同一事务登记 `supabase_migrations.schema_migrations`。这条通道不需要把数据库密码放进命令行，也不依赖数据库直连域名的 IPv6/TLS 状态。

`npm run supabase:push:direct` 保留官方 `supabase db push` 直连方式，只在数据库直连网络和凭据均正常时使用。若直连出现 `ECONNRESET`，先比较直连与 pooler 的 PostgreSQL TLS 握手；不要通过反复重试、关闭 TLS 或把密码写入仓库绕过。云端 smoke 使用 `npx supabase db query --linked --file <测试 SQL>`，测试 SQL 必须自行开启事务并回滚测试数据。

`campaign-media` 必须保持私有，允许类型仅为 JPEG、PNG、WebP，单文件上限 5 MiB。前端只保存对象路径，通过短期签名 URL 展示。GM 上传新图片或恢复默认后应删除旧对象；排查失败上传时先核对房间配置路径，再清理孤立对象，不能扩大 bucket 为公开读取。

移出成员会立即终止其活跃房间读取，释放没有待审核报告的未完成任务，并取消旧入店申请；待审核报告和历史内容保留。运行线上验收时只使用独立测试身份与战役，结束后按依赖顺序清理，并确认临时战役、业务身份和 Storage 对象均为 0。

### 骰盘部署

先运行 `npm run check:dice`、`npm run check:board-objects` 和浏览器回归，再通过 `npm run supabase:push` 部署 `shared_dice`，然后执行 `npx supabase functions deploy roll-dice --use-api`。骰子三个表在迁移中加入 `supabase_realtime` publication；RLS 过滤私密结果，客户端重连后通过 `get_dice_state` 补齐记录。

`roll-dice` 在函数内使用 Auth `getUser` 校验 Bearer，然后以用户 JWT 调用准备和回执 RPC；只有服务器 service role 可写入随机结果。配置中的 gateway `verify_jwt=false` 用于兼容新版签名密钥，不表示匿名投掷开放。自托管修改 `DICE_ALLOWED_ORIGINS` 时，应配置自己的页面域名；不要把 service role key 放到前端。

默认跨域策略同时允许 `localhost` 与 `127.0.0.1` 的 5173、5174 和 4173 端口；显式配置 `DICE_ALLOWED_ORIGINS` 会覆盖默认列表。请求头使用同版本 SDK 的 `@supabase/supabase-js/cors` 清单，避免 SDK 升级后预检遗漏。浏览器请求被跨域策略阻止时服务器可能没有收到投掷，Node 联机测试不会执行浏览器预检；验证应包含从实际页面地址触发的请求。

每次请求以客户端 UUID 幂等；一项 GM 检定中每位玩家仅允许一次有效响应。每人每分钟最多 30 次新投掷，每次初始骰子最多 100 颗、随机抽取最多 1000 次。爆炸、重投的安全上限不会被 3D 动画改变。公开结果不能再改成秘密；暗骰者的回执、历史和实时 payload 不包含结果。

### 7. R10 公开参观与访客留言

`20261028010000_public_visits.sql` 增加 GM 控制的公开参观、专用公开快照、独立访客留言和公开媒体读取。部署后运行：

```bash
npx supabase db query --linked --file supabase/tests/public_visits_smoke.sql
```

公开参观不创建 `campaign_members`，不返回班次码、角色资料正文或任务提交报告 ID。访客只能通过受控 RPC 新增留言，同一身份 30 秒限一条；GM 可以删除留言。直接表写入继续撤销，`visitor_messages` 必须启用 RLS。

`campaign-media` 仍为私有 bucket。公开访客只能在房间处于 `active` 且 GM 已公开时创建签名 URL；前端公开签名有效期为 60 秒，并与成员签名缓存隔离。关闭公开后，新公告板请求、新媒体签名和留言读取必须立即失败。已经加载到浏览器的内容无法追回，不应将公开开关描述为内容销毁。

### 8. 账号与战役角色解耦

`20261029030000_campaign_roles.sql` 固化战役角色边界：账号可以在不同战役分别担任 GM 与玩家，但同一战役中的成员角色不能被入店审批改写。已有成员再次提交该战役的入店申请会返回 `ALREADY_CAMPAIGN_MEMBER`；跨战役申请继续按「最多一个活跃玩家成员关系」约束处理。

部署前运行 `npm run check:database`，必须覆盖两个方向：已有 GM 在另一场战役获批为玩家，以及已有玩家获批 GM 后创建另一场战役。前端不保存全局「当前身份」，只从 `campaign_members` 读取活跃战役列表，并由用户进入具体战役时选择对应成员关系。

### 9. 账号管理加固（2026-10-29）

`20261029040000_account_management.sql` 新增仅本人可调用的昵称修改 RPC，并把 Auth 封禁状态和匿名标记加入 `private.current_actor_id()`。它保留现有账号 ID、GM 审批、成员关系和历史内容。昵称修改不能修改 Auth ID、停用状态或角色。

发布顺序：运行 `npm run check:accounts`、`npm run check:database`、`npm run check:migration` 和 `npm run build`；部署增量 migration；运行 `npx supabase db query --linked --file supabase/tests/account_management_smoke.sql`；发布前端。浏览器合同回归使用 `npm run check:access-ui`，依赖运行中的 `supabase-preview` 与 Chrome；`HP_PREVIEW_URL` / `CHROME_PATH` 可覆盖环境。测试明确使用 Auth/RPC 夹具，不能替代云端真实密码验证和 SMTP 验收。

Auth 云配置需要逐项与生产核对，不能把本地 `site_url` 覆盖到生产：

- `external_anonymous_users_enabled=false`，对应本地 `auth.enable_anonymous_sign_ins=false`。2026-10-29 本次只读核查发现生产仍为开启状态。
- `password_min_length=15`，对应本地 `auth.minimum_password_length=15`。只影响新密码，原密码仍可登录；应与新版前端同时发布。生产核查时仍为 8。
- `security_update_password_require_current_password=true`：使用 Auth 管理配置启用原密码验证；改密代码传递 `current_password`，并额外用不持久化的 SDK 会话验证旧密码。
- **不要误用** `auth.email.secure_password_change`：当前 CLI 2.122.0 将它映射为 `security_update_password_require_reauthentication`，会让超过 24 小时的会话需要邮箱 nonce；虚拟邮箱无法接收。官方 CLI 页面对此字段的说明与安装版本存在差异，以上以安装版本映射及 Auth 服务源代码为准。

人工找回：先通过用户在申请/游玩之前已有的联系渠道核验身份，再核对 Auth ID 与 profile；使用服务端 `auth.admin.updateUserById(authUserId, { password: generatedTemporaryPassword })`，将临时密码通过已核验渠道单独交接，要求用户登录后自行改密。只在受保护环境运行 Admin API，不向前端提供 service-role key，不记录明文密码，不凭公开角色名、班次码或新建账号替换原账号归属。当前前端不支持自行绑定真实邮箱，因为直接替换 Auth email 会破坏现有账号名登录映射。

## 深度交互

骰盘表情与贴纸缩放使用 `20261115000000_dice_reactions_sticker_scale.sql`。部署后可运行 `supabase db query --linked --file supabase/tests/dice_social_sticker_smoke.sql`；临时战役、表情与贴纸均在事务结束时回滚。表情只保存每位成员的最新一条，显示期限为 4 秒，服务器限制每秒最多一条。`get_dice_social` 只返回可见投掷的成员 ID 和过期时间，不返回公式或点数；`dice_reactions` 已加入 Realtime publication。表情及投掷状态在本地按服务端时间过期，订阅正常时每 30 秒兜底校验，订阅失败时每 5 秒补查，关闭骰盘后停用社交查询。

配置优化使用 `20261116010000_settings_patch_social_expiry.sql`。先部署迁移再发布前端；新前端不回退到会覆盖整份设置的旧 RPC。`patch_campaign_settings` 仅更新请求中的键，`null` 删除某个自定义标题／颜色，显隐以模块键和布尔值提交；模块位置继续通过 `move_board_module` 单独保存。提交包含编辑时的原值，冲突返回 `CAMPAIGN_SETTINGS_CONFLICT`；已成功请求的重复提交可安全重试。`patch_board_appearance` 对整个外观草稿执行同样的原值检查。

本地发布检查包括 `npm run check`、`npm run check:board-objects`、`npm run check:dice` 和构建。迁移部署后运行 `supabase db query --linked --file supabase/tests/settings_patch_smoke.sql`，临时房间和操作日志全部回滚。历史 `supabase/migrations/` 与 Nhost 迁移资料保留；Nhost CLI 不再默认安装。配置成功替换的旧纸张素材暂时保留，避免并发页面的签名 URL 失效，后续按引用扫描与保留期回收。

初始方案未假设旧密码可迁移；实际执行已保留 24 个来源 bcrypt 密码，仍不承诺开放写入后的即时回退。匿名身份在新平台仍依赖浏览器会话，长期角色找回机制需要单独设计。生产执行必须同时具备来源和目标授权连接；只有前端 URL 和 publishable key，仍不足以导入历史数据。


当前目标已经是生产数据库，后续不要执行空库导入、准备导入或同步脚本。最终同步已在来源冻结时完成，账号关联未被覆盖。新的结构变更应通过新的 Supabase migration 发布。

GM 账号预占已由 `scripts/migration/reserve-gm.mjs` 完成。随后运行 `npm run migration:gm-passwords`，通过 Supabase Admin API 的 `password_hash` 创建能力迁移了 24 个 bcrypt 密码哈希，并逐账号核对目标哈希；Auth UUID、业务身份和审批状态不变。迁移初始密码已从本地交接文件中清除。1 个来源账号原本没有密码，仍保留迁移初始密码供站长单独交接。此文件不进入前端构建、报告或部署资源。

匿名身份恢复窗口至 2026-11-10，期满后关闭 Edge Function 的迁移窗口并撤销迁移专用 Secret。
