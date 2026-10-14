# Hamburger Protect

一个美漫汉堡店后厨公告板网站。

## 在线访问

<https://hamburger-protect.vercel.app>

## 功能

- 发布、编辑和拖动留言
- 发布、编辑、完成和退回制作任务
- 切换备料与卫生检查状态
- 使用浏览器 `localStorage` 保存本地数据
- 桌面端全景展示，移动端按区域聚焦

## 本地运行

```bash
python3 -m http.server 4173
```

然后访问 <http://127.0.0.1:4173>。

## 技术实现

项目使用原生 HTML、CSS 和 JavaScript，无构建步骤。网站数据仅保存在当前浏览器中。
