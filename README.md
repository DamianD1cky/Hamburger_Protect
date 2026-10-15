# Hamburger Protect

一个围绕「保卫汉堡店」展开的多人跑团任务公告板。玩家是被困在汉○王门店的倒霉员工与顾客，需要在丧尸危机中维持营业、分配工作、记录行动并等待救援。

## 在线访问

<https://hamburger-protect.vercel.app>

## 玩法入口

- GM / 值班店长：用账号名 + 密码注册或登录，创建一次危机营业战役并获得 6 位班次码。
- 玩家：填写角色名、岗位和班次码，以匿名员工身份加入，无需注册。
- 同一玩家只能参加一个进行中的战役。
- 只有 GM 能发布任务、修改物资与检查项，并审核玩家提交的工作报告。
- 战役结束后生成只读归档。

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
- Nhost Auth、PostgreSQL、Realtime GraphQL
- Hasura metadata 权限
- Vercel

## 本地运行

```bash
npm install
npm run dev
```

默认访问 <http://127.0.0.1:5173>。未配置 Nhost 时，应用使用浏览器本地演示仓储；配置后显示真实 GM / 玩家入口。

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
├── migrations/default/
│   ├── 20261015000000_hamburger_protect_schema/
│   └── 20261015010000_handbook_employee_roles/
└── metadata/databases/default/
    ├── tables/
    └── functions/
```

后端定义包含：

- 战役、成员岗位、任务、任务提交、留言、资源、检查项和事件日志
- 店长账号（账号名 + 密码）与匿名玩家账号
- PostgreSQL 约束保证玩家只能同时参加一个进行中的战役
- GM 专属建局、任务管理、审核和归档函数
- 玩家专属加入、领取和提交任务函数
- Hasura `user` / `anonymous` 角色的行级、列级与关系权限

## 云端部署

1. Nhost 从仓库根目录读取 `nhost/` 并自动应用迁移和 metadata。
2. Vercel 配置 `VITE_NHOST_SUBDOMAIN` 与 `VITE_NHOST_REGION`。
3. 推送 `main` 后，Nhost 与 Vercel 分别自动部署后端和前端。

## 目录结构

```text
src/
├── app/                         应用入口与状态编排
├── components/board/            公告板视图组件
├── components/composer/         任务/留言编辑器
├── components/handbook/         员工手册速查
├── features/access/             登录、建局、加入战役
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
npx @nhost/cli config validate
```
