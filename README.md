# Hamburger Protect

一个围绕「保卫汉堡店」展开的多人跑团任务公告板。

## 在线访问

<https://hamburger-protect.vercel.app>

## 当前阶段

项目已迁移到 React/TypeScript，并保留原有公告板视觉和本地演示数据。后端结构已切换为 Nhost：PostgreSQL 迁移、Hasura GraphQL metadata、用户权限和任务事务函数均已纳入版本控制。创建 Nhost Cloud 项目并配置环境变量后即可进行真实多人联调。

## 技术栈

- Vite + React + TypeScript
- TanStack Query
- Nhost Auth、PostgreSQL、Realtime GraphQL
- Hasura metadata 权限
- Vercel

## 本地运行

```bash
npm install
npm run dev
```

默认访问 <http://127.0.0.1:5173>。未配置 Nhost 或未登录时，应用使用浏览器本地演示仓储。

## Nhost 环境变量

复制 `.env.example` 为 `.env.local`，填写 Nhost 项目的公开客户端配置：

```bash
VITE_NHOST_SUBDOMAIN=your-project-subdomain
VITE_NHOST_REGION=your-project-region
```

不要将 `HASURA_GRAPHQL_ADMIN_SECRET`、PAT 或其他管理密钥放入前端环境变量。

## Nhost 后端

```text
nhost/
├── nhost.toml
├── migrations/default/20261015000000_hamburger_protect_schema/
│   ├── up.sql
│   └── down.sql
└── metadata/databases/default/
    ├── tables/
    └── functions/
```

后端定义包含：

- 战役、成员、任务、任务提交、留言、资源、检查项和事件日志
- 玩家只能同时参加一个进行中的战役
- 只有 GM 能创建、编辑和删除任务
- 玩家通过受控 GraphQL 函数领取及提交任务
- GM 通过受控函数审核提交
- 战役结束后生成只读 JSONB 快照
- Hasura `user` 角色的行级、列级与关系权限

## 云端部署

1. 在 Nhost Dashboard 创建项目并连接本 GitHub 仓库。
2. Nhost 会从 `nhost/` 应用迁移和 metadata。
3. 在 Vercel 配置 `VITE_NHOST_SUBDOMAIN` 与 `VITE_NHOST_REGION`。
4. 重新部署前端。

## 目录结构

```text
src/
├── app/                         应用入口与全局 Provider
├── components/board/            公告板视图组件
├── components/composer/         任务/留言编辑器
├── features/campaign/domain/    战役领域类型与状态机
├── features/campaign/data/      本地/Nhost 数据仓储
├── features/campaign/hooks/     React 数据接口
├── hooks/                       纯视图交互 Hook
└── lib/nhost/                   Nhost 客户端
nhost/                           数据库迁移、配置与 Hasura metadata
```

## 验证

```bash
npm run check
npm run build
npx @nhost/cli@latest config validate
```
