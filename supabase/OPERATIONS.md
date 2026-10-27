# Supabase 迁移运维步骤

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

执行 `npm run check`、`npm run check:database`、`npm run check:migration` 和 `npm run build`。`supabase/tests/cloud_smoke.sql` 可通过已授权 CLI 的 `db query --linked --project-ref 目标项目 --file supabase/tests/cloud_smoke.sql` 运行，测试数据在事务结束时回滚。部署 Supabase 基线到新的目标项目，保持 `private.runtime.business_writes=false`。配置 Auth：匿名登录启用、密码最少 8 位、合成邮箱方案关闭邮件确认、Site URL 与允许重定向地址设置正确。

先导出一次来源一致快照，使用 `export --output 仓库外的快照.snapshot.json`；使用 `validate --file 快照路径` 校验文件，使用 `import --file 快照路径 --rehearsal` 导入空的演练目标，再使用 `verify --file 快照路径` 核对。演练项目用完后保留其核验结果；正式目标必须新建，不能让工具覆盖演练数据。

实际验证主版本、TLS 连接、GM 合成邮箱可用性和 Supabase Auth 事件。记录完整迁移耗时，用实测结果确定停写窗口。当前本地 SQL 测试不能代替跨连接竞争测试，预发布至少覆盖双人领取、并发审批与归档竞争。

### 2. 正式停写与最终导入

使用 `source-freeze` 在来源 11 张业务表安装语句级停写保护；既有 Hasura mutation、业务 definer 函数和旧会话均受到保护，Auth 表保留写入与刷新。安装过程在事务内执行，等待表锁后提交。用旧页面和旧 token 实际尝试写入，确认拒绝。另外在 Nhost Auth 配置中关闭公开注册与匿名新建，保留旧会话刷新和必要登录。数据库停写工具不会自动修改 Auth 服务配置。

导出最终快照，验证 `sourceFrozen=true`；使用 `import --file 快照路径` 导入空的正式目标，工具在事务内暂停仅用于派生事件的应用触发器，保持外键有效，逐表核对后提交。目标仍未开放业务写入。

运行 `migration-window --days 14` 开启身份迁移窗口。对需要迁移的真实 GM，运行 `create-gm --actor 原业务UUID --username 原账号名` 创建账号并关联。工具生成随机初始密码且不显示；站长核验本人后通过 Supabase Auth 安全重置并交接，用户设置新密码。若创建成功而关联失败，工具返回目标 Auth ID，站长先核对并解决孤立账号，不盲目重试。

已经存在的目标账号可由站长核验后运行 `bind --actor 原业务UUID --auth 新认证UUID`；此命令不能用于未经核验的角色找回。工具保留审批状态，不能自动批准用户。当前目标公开注册保持关闭；完成全部旧 GM 账号预占后，再通过受控 Auth 配置开启注册及玩家匿名新建。

### 3. 匿名身份迁移接口

部署 `migrate-identity` Edge Function。前端迁移窗口内保留原 `VITE_NHOST_SUBDOMAIN` 与 `VITE_NHOST_REGION`，只用于旧会话刷新和证明；业务仓储由 `VITE_BACKEND=supabase` 选择。

为函数配置以下 Secret：

| 配置 | 值的含义 |
|---|---|
| `MIGRATION_PUBLISHABLE_KEY` | 目标 Supabase 公开 key |
| `MIGRATION_SECRET_KEY` | 服务端专用目标 Secret，或仅本地使用的 service_role key |
| `NHOST_AUTH_URL` | 固定旧 Auth 基地址，包含 `/v1`，不含末尾 `/user` |
| `MIGRATION_ENDS_AT` | 明确 ISO 截止时间，与数据库窗口一致 |
| `MIGRATION_ALLOWED_ORIGINS` | 逗号分隔的正式与预发布域名 |

函数验证目标 JWT 和旧 Nhost Bearer token，再由服务端 RPC 原子关联，用户不能提交认证服务器地址或可信旧 ID。每个目标认证身份最多 20 次迁移尝试每小时；数据库与 Edge 时间窗口均必须开放。当前 Edge 截止时间故意保持过期；正式身份迁移前需同步更新 `MIGRATION_ENDS_AT`。设置 JWT 验证为开启，不为解决错误而关闭。

旧 refresh token 已失效或旧浏览器身份丢失的玩家无法自动恢复，由 GM 核验角色并交给站长绑定新匿名身份。新会话未恢复旧身份时，不自动创建另一个 profile；迁移失败页面保留重试入口。

### 4. 部署、开放与观察

更新 Vercel 的 Supabase 公开配置后重新构建，先检查已绑定 GM 和已有玩家的读取。维护期间不允许创建新的业务身份，防止新数据混入最终数据核对。

运行 `verify --file 最终快照` 核对目标，再运行 `target-open --file 最终快照`。开放命令会再次连接来源，检查它仍停写，并检查目标 RLS、直接写权限、触发器和逐表内容后开启目标。它不替代实际 Auth、页面和跨连接测试。

开放后在专用验收战役验证完整流程，观察错误和真实用户反馈。来源保持停写。需要检查开关可运行 `status`；需要暂停目标业务可运行 `target-close`。

### 5. 回退与收尾

目标开放业务写入前可恢复旧 Vercel 版本、旧配置，再运行 `source-thaw`。命令只解除来源业务保护，不删除历史数据库或备份。旧 Nhost 会话在窗口内保留。

目标开放写入后，先关闭目标、保留全部新增数据，优先修复目标。当前工具没有自动反向同步：新业务身份在旧 Nhost Auth 中可能不存在，不能直接回到旧站并丢弃新数据。必须另行完成反向数据与账号恢复，或明确获得接受数据损失的授权。

观察至少一次真实跑团流程。身份窗口结束后运行 `migration-window --days 0`，关闭 Edge Function 并撤销迁移专用 Secret，再从活跃前端移除 Nhost 配置和迁移代码。保留备份和未绑定历史 profile；是否停用旧 Nhost 项目由既定恢复窗口决定。

## 深度交互

当前方案没有承诺保留旧密码、零停机或开放写入后的即时回退。匿名身份在新平台仍依赖浏览器会话，长期角色找回机制需要单独设计。生产执行必须同时具备来源和目标授权连接；只有前端 URL 和 publishable key，仍不足以导入历史数据。


当前目标已经是生产数据库，后续不要执行空库导入、准备导入或同步脚本。最终同步已在来源冻结时完成，账号关联未被覆盖。新的结构变更应通过新的 Supabase migration 发布。

GM 账号预占已由 `scripts/migration/reserve-gm.mjs` 完成。随后运行 `npm run migration:gm-passwords`，通过 Supabase Admin API 的 `password_hash` 创建能力迁移了 24 个 bcrypt 密码哈希，并逐账号核对目标哈希；Auth UUID、业务身份和审批状态不变。迁移初始密码已从本地交接文件中清除。1 个来源账号原本没有密码，仍保留迁移初始密码供站长单独交接。此文件不进入前端构建、报告或部署资源。

匿名身份恢复窗口至 2026-11-10，期满后关闭 Edge Function 的迁移窗口并撤销迁移专用 Secret。
