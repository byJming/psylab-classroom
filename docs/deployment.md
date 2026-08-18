# 静态部署

PsyLab 构建产物不需要应用服务器、账号或数据库。运行 `pnpm build` 后，将 `dist/` 内的全部文件以原样、UTF-8 静态文件发布即可。

## GitHub Pages

仓库已提供 `.github/workflows/deploy-pages.yml`。在 GitHub 仓库 Settings > Pages 中将 Source 设为 GitHub Actions；推送到 `main` 后 workflow 会安装锁定依赖、运行类型检查/lint/单元测试、构建并发布 `dist/`。

## Cloudflare Pages

连接仓库后配置：

- Build command：`pnpm build`
- Build output directory：`dist`
- Node.js version：`22`

不要配置运行时环境变量、分析脚本或结果收集 Functions。结果仍由用户下载后通过学校既有渠道提交。

## 高校静态服务器/离线镜像

将 `dist/` 上传到站点目录，保持 `index.html` 和 `assets/` 的相对位置；也可以将该目录复制到离线电脑后用任意静态服务器打开。静态主机仍可能保留访问日志和 IP，部署方应在本地隐私说明中列明日志目的、访问权限、保存期限与删除流程。

## 发布前人工检查

- 在目标 Chrome/Edge Windows 版本完成四个实验，检查按键布局、中文长文案、下载文件和返回页面。
- 用学校网络和目标静态域名验证资源加载；不要把静态托管误解为实验数据的零暴露。
- 至少完成两次真实课程场景试用并记录反馈。使用 [课程场景试用记录模板](course-trial-feedback-template.md)，不要将学生结果包或可识别信息提交到仓库。该项是稳定发布的产品退出条件，不能由自动化测试替代。
