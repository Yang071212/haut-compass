# 工大 Compass

河南工业大学学生的日常工作台：聚合官方校园信息，精选适合大一与 C 语言入门阶段的 GitHub 项目、竞赛和前沿科技。支持搜索、分类、收藏、来源状态查看和刷新。

## 电脑和手机使用

线上入口：[工大 Compass](https://haut-compass.yang2014733256.chatgpt.site)。电脑和手机均可公开访问，无需 ChatGPT 账号或登录。正式 HTTPS 页面可通过浏览器“添加到主屏幕/安装应用”放到桌面，具体入口取决于浏览器。

本地建议使用 Node.js 22 或以上：

```powershell
npm ci
npm run build
npm start
```

电脑打开 [http://127.0.0.1:4318](http://127.0.0.1:4318)。手机和电脑连接同一 Wi-Fi，打开启动日志中的 `Phone on same Wi-Fi` 地址；电脑需要保持运行，首次访问可能需要允许 Windows 防火墙的专用网络访问。本地 HTTP 可浏览，安装到桌面请使用正式 HTTPS 入口。

收藏保存在当前浏览器的 `localStorage`，不跨设备同步。线上共享数据保存在云端快照中，本地运行使用本机独立快照。

## 更新方式

访客点击页面“更新”只会读取最新共享云端快照，不会启动全站采集。后台自动更新或已授权维护请求负责请求官方来源与 GitHub，并保存共享快照。来源失败会保留旧条目并显示异常。现有项目的 Star 会重新查询；新项目适用性、竞赛报名资格与科技内容仍需要结合官方原文继续核验。

已有每天北京时间 **08:00** 执行“抓取 → 核验精选 → 保存 → 复查”的定时任务。实际启用状态与最近运行结果以 Sites 计划为准。维护认证及旧任务兼容步骤见 [UPDATE.md](./UPDATE.md)。

公开渠道无法穷尽校内登录系统、微信公众号、班群和所有二级栏目。报名、费用、年级限制与调整通知以官方原文为准。

## 项目结构和接口

- `web/`：响应式界面、PWA 清单与浏览器交互。
- `lib/collector.js`：官方页面、资讯 Feed 和 GitHub 元数据采集。
- `data/seed.json`：初始核验内容与来源配置。
- `worker/entry.js`：接口和静态资源服务；`scripts/`：构建、本地运行与刷新。
- 云端存储：R2 绑定 `BUCKET`，快照键 `compass/snapshot.json`。

| 接口 | 作用 |
| --- | --- |
| `GET /api/data` | 匿名读取当前快照及来源状态 |
| `POST /api/refresh` | 需维护认证；同步刷新并持久化，调用方预留最多 90 秒 |
| `POST /api/curation` | 需维护认证；用完整数组替换指定的 `campus`、`projects`、`competitions`、`frontier` |

所有 `POST` 写入均要求 `X-Compass-Update-Key` 维护认证，缺失或不匹配返回 `401`。维护凭据不得出现在前端、仓库或访客请求中。认证和现有每日任务的兼容步骤见 [UPDATE.md](./UPDATE.md)。

本地 `npm run refresh` 更新本机快照，`npm test` 运行采集和状态判断测试。源码修改后重新执行 `npm run build`；只更新线上精选内容无需重新部署。

## 来源与开源

主要校园来源：[学校官网](https://www.haut.edu.cn/)、[教务处](https://jwc.haut.edu.cn/)、[学工部](https://xgb.haut.edu.cn/)、[团委](https://youth.haut.edu.cn/)、[就业创业中心](https://job.haut.edu.cn/)、[图书馆](https://lib.haut.edu.cn/)、[人工智能与大数据学院](https://aidata.haut.edu.cn/)、[信息科学与工程学院](https://computer.haut.edu.cn/)。更多渠道依据[学校机构设置](https://www.haut.edu.cn/jgsz1.htm)核实。

开源库：[Lucide](https://github.com/lucide-icons/lucide) 提供图标，[Fuse.js](https://github.com/krisk/Fuse) 提供模糊搜索，[Cheerio](https://github.com/cheeriojs/cheerio) 解析网页，[fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) 解析 Feed，[esbuild](https://github.com/evanw/esbuild) 构建 Worker。第三方许可证保留于 `/licenses.txt` 和依赖文件中；产品界面不显示 ChatGPT 创作者署名。
