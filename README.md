# 工大 Compass · 公开静态镜像

无需 ChatGPT 登录。页面、图标、搜索库和数据均从 GitHub Pages 同源载入，支持项目子路径及手机布局。

## 每日同步

`.github/workflows/pages.yml` 每日 UTC 00:30（北京时间 08:30）尝试同步，也支持手动触发与推送发布。GitHub 定时任务可能延迟，长期不活跃的公开仓库可能被平台暂停定时执行。源站每天 08:00 采集，此镜像在其后拉取 `https://haut-compass.vercel.app/api/data`。

只接受成功返回、五组数据齐全、`delivery.mode=live`、更新时间有效且不超过 36 小时的数据。上游失败、过旧或时间倒退时保留原 `updatedAt` 和内容，增加中文提示并照常部署保留内容；工作流最后报告失败，方便管理员发现。镜像检查时间单独记录，绝不改作信息更新时间。

首次发布前，在仓库 Settings → Pages → Build and deployment 中选择 GitHub Actions。工作流使用仓库自带 `GITHUB_TOKEN` 发布，拉取公开数据不需要 API 密钥。

## 本地验证

需要 Node.js 22 或更高版本，无 npm 依赖。

```sh
npm test
npm run refresh
python -m http.server 8787 --directory public
```

浏览器访问 `http://localhost:8787/`。测试检查资源在 `/haut-compass/` 子路径下的解析、PWA 路径、JSON 数据形状与更新时间，以及同步成功/失败的语义。原始数据仍以学校或赛事官方通知为准。

开源资源许可保留于 `public/licenses.txt`，包括 Lucide 和 Fuse.js。
