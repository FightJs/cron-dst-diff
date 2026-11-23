# 推广准备

用一个可复验的案例说明为什么迁移 Cron 库时应检查夏令时转换日。Chromium 实测中，Luxembourg 秋季回拨的第二个 02:30（01:30Z）只出现在 Croner 11.0.0 的列表。这个观察适用于案例表达式、时间窗与运行环境。案例背景见上游讨论。[Croner #438](https://github.com/Hexagon/croner/issues/438)

- 现有材料为中文 README、实际浏览器截图和可下载、可用 Node 复验的 JSON。截图使用内置案例，未包含用户数据。[截图](docs/fall-chromium.png)
- 优先渠道为 CSDN 技术文章和 X 短帖。文章可以展示春秋两次转换并解释 UTC 与本地时间的区别。短帖可使用秋季截图，附公开演示链接及版本。
- 当前状态为本地构建和验证完成。源码仓库已创建，GitHub Pages 演示已配置。文章和帖子待发布，星标增长和反馈未知。[在线演示](https://fightjs.github.io/cron-dst-diff/)[GitHub 仓库](https://github.com/FightJs/cron-dst-diff)
