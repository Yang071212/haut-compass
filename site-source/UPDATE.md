# 每日更新维护说明

## 目标与位置

目标站点：[工大 Compass](https://haut-compass.yang2014733256.chatgpt.site)，公开访问，无需 ChatGPT 账号或登录。工作目录：`C:\Users\Yang\Documents\ChatGPT\New project\haut-workbench`。已有每天 **08:00，Asia/Shanghai** 的更新任务；实际启用状态与最近运行结果仍应查询 Sites 计划，不能仅凭本文判断运行成功。

用户是河南工业大学软件工程大一学生，正在学习 C 语言。优先寻找 GitHub 上高 Star、仍有维护、此阶段能动手使用的项目，再核实校园消息、可参加竞赛与前沿科技。界面不显示 ChatGPT 创作者署名，第三方许可证继续保留。线上内容更新通常不修改源码、不重新部署。

## 访问和凭据

1. 优先使用 Sites 连接器，按 URL/slug 确认目标是 `haut-compass`，不要操作其他站点。
2. 页面及 `GET /api/data` 匿名可读。所有 `POST` 写入需要维护认证，访客页面“更新”按钮只读取最新共享快照，不触发来源采集。
3. 维护调用从 Sites `get_site` 返回的 `siwc_bypass_bearer_token` 获取稳定的不透明服务 token，在内存中计算该 token 的 UTF-8 字节的 SHA-256 摘要，并编码为小写十六进制字符串。
4. 仅向上述目标站点发送维护请求：`OAI-Sites-Authorization: Bearer <临时取得的原 token>`，并附加 `X-Compass-Update-Key: <计算得到的摘要>`。不得向第三方来源发送任一凭据。
5. Worker 将请求中的摘要与 Sites secret `COMPASS_UPDATE_PROOF` 比对。部署维护者应通过 Sites secrets 配置此摘要；原 token 不存入应用。缺失或不匹配的写入请求返回 `401`，不会采集或修改共享数据。
6. token 与摘要仅在调用内存中使用；除将摘要配置为上述 Sites secret 外，不得打印、写文件、写日志、写入计划提示词、保存到仓库或放入前端和普通环境变量。结果只报告脱敏状态。

现有 08:00 任务如果仍只发送旧的 `OAI-Sites-Authorization`，首次写入会返回 `401`。读取该响应中的维护认证说明，重新通过 `get_site` 获取 token、计算摘要并带上 `X-Compass-Update-Key` 后再重试；也应更新任务步骤，后续每次写入都附带此头。`401` 不代表页面需要访客登录，不应通过放开写入权限处理。任务提示词只保存计算方法和步骤，不保存凭据值。

## 每次运行顺序

1. `GET /api/data`：读取当前快照，在内存保留完整数组，记录 `updatedAt`、`curatedAt`、来源状态和条目 ID。
2. 按上述维护认证步骤调用 `POST /api/refresh`：先执行来源采集与 GitHub 元数据更新。调用同步等待，客户端预留最多 90 秒。若返回 `401`，先修正认证再重试；若超时，先再次读取快照确认是否完成，不要立刻反复启动刷新。
3. 再次 `GET /api/data`，以刷新后的数据为基础核查新通知及失败来源。保留原文链接；受限页面标明需校园网/VPN，不绕过访问限制，不把列表标题扩写成未经证实的细则。
4. 联网搜索和打开原文，整理需要更新的 `campus`、`projects`、`competitions`、`frontier` 完整数组。先查 GitHub 官方仓库和 Releases；竞赛以学校/教务处/学院及主办方官方通知为准；科技内容以论文、仓库和机构/厂商正式发布为准。
5. 对抓取失败的校园来源，可搜索并打开其可公开访问的官方原文，将核实条目补入 `campus`。来源 HTTP 失败状态继续保留，不能因为搜索补到了内容就伪称原站抓取成功。
6. 带上维护认证调用 `POST /api/curation`，请求体只包含需要更新的数组。**提供的数组会整体替换旧数组**，必须保留仍有效的原有条目，避免只提交当天新增内容而删掉全部历史精选。
7. 最后 `GET /api/data`，验证持久化后的 `curatedAt`、数组数量、代表性新条目和原文链接。检查已过截止的赛事不再显示报名中。只有读回正确，才能报告更新成功。
8. 报告新增/修订数量、实际成功的来源数、重要截止与未解决异常。无重要变化时按计划配置保持安静；失败、需要账号操作或重要机会临期时再提醒。

云端 R2 绑定：`BUCKET`；快照键：`compass/snapshot.json`。接口写入即持久化，页面从快照读数据，无需重新部署。失败来源保留旧条目；成功读取但没有变化，不能描述成发现新消息。收藏仅在各设备的 `localStorage` 中，本流程不管理个人收藏。

## 精选标准

**GitHub 项目**：核实当前 Star、许可证、最近维护时间、README 与运行入口。适用性优先，避免只因 Star 高就推荐复杂基础设施。兼顾 C/算法基础、Git、学习资料、开发工具和能产出小成果的应用。发现新价值再加入，不每天替换全部项目。说明新生能做什么、前置知识和起步任务；不能把“仓库有源码”描述成“已在用户设备测试通过”。

**校园信息**：覆盖学校官网、教务、学工、团委、就业、图书馆、学院及生活服务渠道。区分活动预告、通知、结果公示与活动回顾。逐条保留官方链接、发布日期、来源；无法核实发布日期时保留空值，不用采集日期代替。涉及个人名单时只提供必要概述和原文，不扩大传播个人信息。

**竞赛**：区分报名中、持续练习、待核实、已截止、关注下届。确认届次、范围、校内截止、费用、组队及年级条件。日期采用北京时间 ISO 格式；截止无法核验就留 `null` 并标待核实，不按往年日期推算。全国截止不代替学校/学院更早节点。训练平台与正式奖项分清，遵守主办方关于赛中 AI 辅助的规则。

**前沿科技**：优先 GitHub Releases、研究机构博客、论文和官方文档，给出日期、短摘要及对学生的意义。区分新发布与旧资料更新，避免将转载或营销标题当研究结论。

不能承诺“不遗漏”：范围仅为已配置公开渠道，校内系统、公众号、班群和未配置二级栏目可能有信息差。

## 写入格式

`POST /api/curation` 接受下列可选字段，省略的数组保持原样，空数组会清空对应栏目：

```json
{
  "campus": [],
  "projects": [],
  "competitions": [],
  "frontier": []
}
```

`campus` 最多 400 项，其他每组最多 100 项，请求文本最多 1000000 字符。每项必需 `id`、HTTP(S) 原文 `url`，以及 `title` 或 `name`。项目另需 `repo`，格式为 `owner/repository`。先读 `GET /api/data` 并沿用实际字段结构，**不要把示例空数组直接提交线上**。

| 栏目 | 建议保留/核实的字段 |
| --- | --- |
| campus | id, title, url, sourceId, source, date, category, summary, collectedAt |
| projects | id, repo, name/title, url, stars, language, license, description, fit, category, pushedAt, verifiedAt |
| competitions | id, title, url, source, deadline, status, category, description, fit, eligibility, checkedAt |
| frontier | id, title, url, source/sourceId, date, category, summary, collectedAt |

`/api/refresh` 更新来源和现有项目 Star，不会自动完成新项目筛选及每项竞赛的资格审查，因此每日原文核验与 `curation` 仍然必要。来源和初始内容在 `data/seed.json`，采集逻辑在 `lib/collector.js`，界面在 `web/`，接口在 `worker/entry.js`；修改源码或新增采集源才需要构建与重新部署。

