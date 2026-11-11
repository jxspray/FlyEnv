# 开发日志

## 2026-11-10

- 移除站点、项目、自定义模块、计划任务、启动组、代码库、Cloudflare 隧道的授权数量限制。
- 移除截图、图片压缩、AI 聊天的试用时长限制，以及启动后的试用过期提醒。
- 删除 Host、Image、Ollama 的 Fork 授权拒绝和插件安装、更新、旧记录迁移的授权条件。清理失效的插件授权参数及本地校验工具。
- 授权页面继续显示实际账号状态；旧试用字段及 IPC 参数保留兼容。
- Node 原生 TypeScript 转换方式运行启动组、渲染操作边界测试均通过，包含语言项目端口契约检查。修改脚本语法、授权门槛源码检查及 git diff --check 通过。
- 当前目录缺少 node_modules，Yarn 测试入口因 tsx 缺失失败。完整 ESLint、类型检查、构建和桌面实测待验证。

### Windows 本地编译

- 使用现有 yarn build:win，前端生产编译、Electron 主进程和 Fork 编译完成，Go Helper 已生成。
- 依赖位于 D:/CodexBuild/FlyEnv/node_modules，通过 F:/FlyEnv/node_modules 目录联接使用；Electron 运行时经镜像下载成功。
- 编译检查发现并修正授权移除遗留的未使用引用及格式问题，修改文件 ESLint、启动组、渲染操作边界和 Helper 契约检查通过。
- Windows 安装包在 node-window-manager 原生扩展重编译阶段失败，本机缺少 Visual Studio C++ 工具链。自动审批拦截工具链安装命令，原因为 blocked by policy，待手动安装后重试。
- Vite 输出循环分块、大体积分块和混合动态导入警告，桌面运行仍待验证。

### Windows 安装包构建完成

- 用户安装 Visual Studio 2022 Build Tools 后继续构建，先链接依赖再应用项目已有 patch-package 补丁，窗口管理原生扩展编译通过。
- node-pty 源码构建仍缺少 Spectre 库。本次使用随包提供的 Windows x64 预编译文件，已在 Electron 39.8.10 中验证原生模块加载和终端命令执行；临时打包驱动关闭重复原生重编译，项目构建配置未改动。
- 跨盘 node_modules 联接导致首次打包漏收依赖，改用 D:/CodexBuild/FlyEnv 实体构建快照重新打包，12 个关键包加载和终端执行检查通过。
- 打包工具从镜像下载并按构建工具内置 SHA-256 校验。临时驱动明确选择内置支持的 NSIS 工具集 1.2.1，生成 Windows x64 本地未签名安装包，大小 154987467 字节。
- 最终安装包为 release/FlyEnv-Setup-4.20.2.exe，SHA-256 为 13CFB1C756CFB9B50CC753B4BB4F4B09E14B1C92615D32247E9031BB21C656AD。校验通过的解包应用同步到 release/win-unpacked。
- 安装向导和完整图形界面业务流程仍待实测。

### 已安装版本测试

- 确认运行程序位于 D:/Software/FlyEnv，版本 4.20.2.0，已安装 app.asar 与本次打包产物 SHA-256 一致。
- 在已安装 Electron 39.8.10 内加载窗口管理、终端、图片处理、文件系统等 12 个关键依赖成功，终端命令执行成功。
- 已安装 sharp 完成内存测试图 PNG 到 JPEG 转换和 64×48 到 32×24 缩放，输出元数据符合预期。
- 已安装 Helper 主文件、备份与本次编译文件 SHA-256 一致。检查到的当前 main.log 中没有 error、uncaught、cannot find module 或 fatal 匹配行。
- FlyEnv 主窗口进程处于响应状态。Computer Use 首次捕获返回 FrameArrived timed out，刷新窗口选择后重试返回 window capture timed out；图形界面操作和授权数量/时限限制的端到端测试待窗口捕获恢复后继续。

### 10 个站点数量限制实测

- 使用 D:/Software/FlyEnv 已安装产物的 Fork runtime，经与界面相同的 Host.handleHost 新增入口逐个创建 10 个静态测试站点，未向测试 Fork 提供激活码。
- 域名为 flyenv-limit-test-01.localhost 至 flyenv-limit-test-10.localhost，HTTP 端口为 18881 至 18890，站点根目录位于 D:/Software/FlyEnv-Data/www/flyenv-limit-test-01 至 flyenv-limit-test-10。
- 初始站点数为 0，每次新增后调用 hostList 回读，数量依次为 1 至 10，第 4 至第 10 个站点均成功。
- 40 份 Web 服务配置文件存在；新测试进程再次读取仍为 10 个站点，确认持久化成功。站点创建及保存路径未再触发 3 个站点限制。
- 测试站点保留在实际数据目录供用户查看。本次为 CLI 后端入口实测，图形界面新增按钮及 HTTP 服务访问尚未实测。用户可切换其他页面后返回站点列表刷新。

## 2026-11-11

### MCP 已安装版本连接测试

- 使用本机 MCP 配置中的令牌连接 http://127.0.0.1:7682，MCP 握手成功，服务标识 flyenv，协议服务版本 1.0.0。
- list_tools 成功返回 16 个工具。通过 MCP list_sites 读取到全部 10 个数量限制测试站点，名称与端口均符合预期。
- 本次仅执行连接、工具发现和站点查询；写操作及 HTTP 站点访问尚未通过 MCP 实测。测试脚本与结果位于 tmp/mcp-installed-test.mjs、tmp/mcp-installed-test-result.json，均未记录令牌。

### 全部 FlyEnv 自有许可证检查清理及外部接口盘点

- 删除 App 激活码在线查询、申请、本机 RSA 校验、GitHub 许可证绑定及仅由许可证页使用的账号登录链路；删除对应页面、IPC、懒加载 runtime、Server 字段及广播。
- SetupStore 仅保留设置页标签；截图直接初始化，清理所有旧锁定模板、跳转入口及试用时间状态，保留既有 Fork 参数位置用于兼容。
- 启动上报响应不再写许可证。生产环境仍向 api.one-env.com/api/app/start 发送机器标识、系统及版本，此项列入外部接口报告。
- 外部接口报告为 docs/外部接口与地址清单-2026-11-11.md，重点接口核对调用用途、触发条件和字段，另列 485 个 HTTP/HTTPS 地址出现位置及 148 个固定域名。候选包含网页链接和模板，动态下载源及外部程序网络行为需另行运行时验证。
- 修改文件 ESLint 通过；插件旧记录迁移和开发模式共 26 项测试通过；渲染操作边界、语言项目端口、启动组及启动目录测试通过。源码及编译后 main/fork 分块的许可证残留检查通过。
- 自动审批拦截 dist 清理命令，原因为 blocked by policy，改为 tmp/license-cleanup-build-1794328028036 独立输出目录完成主进程、Fork 和渲染层生产编译。首次独立输出遇到 Monaco 插件对 Windows 绝对路径的拼接错误，改用相对输出路径后通过。Vite 仍报告循环分块、混合导入及大分块警告。
- 当前安装目录和上一次 release 安装包尚未部署这次源码改动。

### 保留反馈并移除启动上报和远程账号管理

- 根据用户确认保留意见反馈，删除生产环境 App-Start 调用及 App.start 上报请求。反馈表单、入口和 feedback_app 请求通过模拟传输回归验证，未发送真实反馈。
- 删除 CloudflareTunnel 前后端及导航，删除 ClaudeCode、Codex、Kimi、OpenCode、Antigravity、CopilotCli、Hermes、OpenClaw、CLIProxyAPI 管理页面及安装/会话/认证入口。版本分发、枚举和 MCP 服务名单同步移除已删除服务。
- MCP 和本地记忆插件依赖六种客户端的本地配置写入，保留 addMcp 及必要本地辅助方法，六种临时配置写入、原字段保留均通过测试。
- Qdrant 模板设置 telemetry_disabled=true，启动环境添加 QDRANT__TELEMETRY_DISABLED=true；Meilisearch 三平台模板启用 no_analytics=true，启动追加 --no-analytics，覆盖已有配置。官方依据见外部接口报告。
- 修改文件 ESLint、渲染操作边界、语言项目端口、启动组、启动目录及 26 项插件测试通过。生产编译通过。
- 新包内 12 个依赖加载和终端命令执行通过，包内分块未检出启动上报、许可证及 Cloudflare API，反馈请求存在，遥测模板关闭。

- Windows x64 新安装包已生成并复制到 release/FlyEnv-Local-Setup-NoReport-4.20.2.exe，大小 154783973 字节，SHA-256 为 5540734C6ECEB9D1D949546441ADC7ED4918CF5F8C6A66FA01ED703A3FC53596。本地未签名构建；安装向导及图形界面业务未实测，当前安装目录仍为前次版本。


## 2026-11-11 站点导入与自定义更新

- 新增 SiteImport 独立模块，页面负责核对草稿，单例控制器负责跨页进度及 IPC，fork 负责扫描、备份和逐站点导入。
- 复用 PHP 版本管理及 Host.handleHost，匹配完整版本并保留主次版本运行语义；支持批量映射、来源指纹复核、别名重复识别、目录及证书路径修正。
- Host 编辑增加跨 worker 写入锁，站点列表先写临时文件再原子替换。写入失败时回读确认结果并清理新站点配置，已完成站点独立保留。
- 对 E:\phpstudy_pro 只读扫描得到 72 个候选、7 种 PHP 来源版本，无阻断项、1 条扫描提示。真实导入使用隔离目录，两个有效站点完成、缺失目录项失败后继续，重复项跳过；模拟只读 host.json 时原列表完整、失败配置回收。
- 关于我们和启动自动检查改由 About 更新控制器调用主进程 UpdateManager，移除原官方 GitHub 检查接口；用户自定义更新源用独立 Storage 保存。默认空源，检查及下载由 electron-updater 处理，安装前复用 Application.stop。
- 新增更新元数据脚本和发布手册，Windows 本地打包自动生成 latest.yml。版本递增到 4.20.3，Windows 文件版本跟随 package.json。
- 站点导入、私有更新和渲染操作边界测试通过；修改文件 ESLint、生产编译通过。全项目类型检查仍存在既有报错，本次新增模块与更新文件未出现类型诊断。

- 4.20.3 安装包生成成功，路径 release/FlyEnv-Local-Setup-4.20.3.exe，大小 154946582 字节，SHA-256 为 F79B6122EB418CC01E1CBBB86508DE4278056021B8939012BD3C2897F99A63E0。latest.yml 和 blockmap 已生成。
- 本地 HTTP 真实检查并下载安装包，SHA-512 比对通过；错误哈希下载被拒绝且不能安装，全部请求的分阶段用户标识为空。安装前停止及安装调度使用模拟验证，真实覆盖安装与图形界面点击尚未实测。
- 新包 12 个关键依赖加载及终端命令通过。包内核对站点导入、自定义更新、内嵌 app-update.yml，原官方版本接口移除；反馈保留，既有上报移除与遥测关闭审计通过。
- 本机打包沿用已验证原生依赖并关闭重复重建，产物为 Windows x64 未签名本地安装包。

## 2026-11-11 本机更新安装

- 按用户要求使用本地 4.20.3 安装包，将 D:\FlyEnv 的全用户安装从 4.20.2 更新到 4.20.3，安装返回码为 0。
- 程序文件版本、系统安装记录均为 4.20.3；安装后 app.asar 与已验证构建哈希一致，app-update.yml 存在。
- 安装后启动 FlyEnv，核对运行路径及主窗口响应。

## 2026-11-11 站点导入迁移为独立插件

- 按用户要求迁移到 plugins/phpstudy-import，插件版本 0.1.0，独立标识 phpstudy-import，入口名称 phpStudy 导入。
- 移除本功能的内置枚举、fork 注册、Host 菜单入口和 src 专属目录；通过既有插件机制加载。刷新站点改为调用宿主 AppStore.initHost，hosts 同步使用宿主 IPC，避免重复打包 HostStore。
- 生成独立插件包和本地 registry.json，新增构建、安装回归命令及插件说明。
- 真实插件管理器隔离安装、加载、启停用及卸载通过；renderer 宿主桥接、进度与监听清理通过。已安装 4.20.3 后台通过插件加载器完成真实扫描与隔离导入，72 个来源候选、7 种 PHP 版本，导入部分失败、重复跳过和提交失败清理通过。
- 插件源码 ESLint、导入契约及操作边界测试通过；插件文件无类型诊断，全项目仍有既有报错。图形界面点击未实测。
- 插件包大小 390426 字节，SHA-256 为 374B7DB9FC7FE527B21E5EBE44E9FD24CA2AAE89507B44382D9ABFB091CE5A01，路径 release/plugins/phpstudy-import/phpstudy-import-0.1.0.flyenv-plugin。当前交付独立包，安装验证使用隔离目录。

## 2026-11-11 插件独立测试

- 按用户要求重新执行 test:site-import 与 test:phpstudy-import-plugin，解析、导入边界、宿主桥接、隔离安装、启停用和卸载均通过。
- 使用已安装 4.20.3 打开插件测试窗口，加载 dist/plugins/phpstudy-import/package，单独指定数据与 Electron 用户目录。测试进程主窗口响应正常。
- 测试目录记录于 tmp/phpstudy-import-manual-session.json，插件说明补充独立命令行测试与界面开发模式入口。

## 2026-11-11 插件 0.1.1 表格选择与筛选

- 表格改为展开、站点、来源 PHP、迁移 PHP 四列，站点表头及行内放置复选框，支持全选/取消/半选，去掉顶部选择按钮及核对列。
- 去掉逐行确认草稿状态，在确认导入时提交快照；保留 PHP 和站点配置校验，并在迁移 PHP 单元格展示问题。
- 新增域名/别名模糊搜索、来源 PHP 和 Web 服务组合筛选，扫描结果携带 Apache/Nginx 来源，兼容旧结果路径推断。筛选外选择保留，表头只选择当前可用项，取消可清除当前范围已有选择。
- 真实 Element Plus 界面交互测试通过，覆盖四列、半选、组合筛选、空结果、隐藏选择及直接确认导入。独立插件安装、宿主桥接、原导入回归及 ESLint 通过，插件文件无类型诊断，全仓库有既有类型报错。
- 产物 release/plugins/phpstudy-import/phpstudy-import-0.1.1.flyenv-plugin，大小 391455 字节，SHA-256 为 8872C8878E3C23B79DEC5F62412CB25584A5CA28E19C273CBA796F53AC0B36AD，本地 registry.json 已更新。界面验证采用隔离演示数据。

## 2026-11-11 重启插件测试窗口

- 按用户要求重启独立插件测试实例，核对旧进程身份和测试数据目录，未发现服务 PID 记录。桌面截图捕获超时后，通过命令行结束旧测试进程并使用相同测试目录重新启动。
- 新进程为 15256，主窗口响应正常，加载目录的插件版本为 0.1.1。测试会话记录已更新。

## 2026-11-11 应用更新至 4.20.4

- 应用版本提升至 4.20.4，使用全新构建目录生成主进程、fork、renderer 和静态资源，避免旧内置导入代码残留。
- 生成 Windows x64 安装包、blockmap 和 latest.yml，安装包大小 154789033 字节，SHA-256 为 CD6BFE1EC41AD678AF6F6571E255B41A6B4AE40AFC89EBEAD57D31DCF79EB2DB。
- 静默安装到 D:/FlyEnv，安装返回 0，版本为 4.20.4，安装后 app.asar 与构建产物哈希一致。
- 通过真实 PluginManager 将 phpstudy-import 0.1.1 安装并启用到 D:/FlyEnv-Data，使用系统安全存储保护插件安装密钥。
- 更新器回归、独立插件回归通过，安装包 12 项依赖与 PTY 启动通过，许可证/上报移除、意见反馈保留及更新功能包内检查通过。
- 正式应用通过本地调试接口检查侧栏和插件页面，并只读扫描 E:/phpstudy_pro 得到 72 个站点；四列表头、域名及 PHP/Web 筛选入口正常，未执行导入。界面截图及报告位于 tmp/app-4.20.4-installed-plugin.png、tmp/app-4.20.4-ui-check.json。
- 验证后通过应用既有退出流程关闭调试实例，重新正常启动，未保留调试端口；最终进程 7520 主窗口响应正常。


## 2026-11-11 提交并推送 pro 分支

- 按用户要求将当前 4.20.4 源码、phpStudy 导入插件 0.1.1、相关测试及文档整理提交至 pro。
- 已核对远程 pro 的 7 条额外历史提交，其最终文件树与本次开发基线一致；从 origin/pro 创建本地 pro，保留远程历史。
- 安装包、dist、tmp、本机数据及凭据不纳入版本提交。

## 2026-11-11 导入插件 0.1.2 别名留空

- 扫描器不再将 Nginx 附加域名或 Apache ServerAlias 填入别名，合并站点时不补入别名；保留展开行手动输入及既有重复校验。
- 更新回归覆盖默认空别名、Nginx/Apache 合并和手动别名筛选及提交。站点导入测试、独立插件安装加载测试及 ESLint 通过。
- 已构建 release/plugins/phpstudy-import/phpstudy-import-0.1.2.flyenv-plugin 并更新本地 registry.json，大小 391441 字节，SHA-256 为 336722E7E22D6428BF0B281467763DDB2010226F042AE3794F6A7A83A1052D00。
- 当前运行的正式应用仍加载 0.1.1，本次未替换运行中的插件或重启应用；更新插件后重新扫描生效，现有站点及已生成草稿不自动清空别名。

## 2026-11-11 本地站点 503 排查

- 用户反馈本地域名 www.yaoyujian.com 返回 Service Unavailable。固定解析到 127.0.0.1 请求复现 Apache 503。
- 站点指向 E:/Work/yaoyujian/code-master/public，PHP 后端为 127.0.0.1:9085；Apache 日志记录 AH00957/AH01079 连接拒绝，Nginx 既有日志也指向相同未监听端口。
- 未发现 php-cgi 进程或 9085 监听，D:/FlyEnv-Data/app/php-8.5.12 程序文件存在。界面显示 PHP 开关禁用。建议进入 PHP 页面选择并启动 8.5.12，再验证页面。
- 桌面工具无法完成点击，返回 coordinate input geometry is unavailable；未启动 PHP，未修改站点配置或应用源码。


## 2026-11-11 提交插件 0.1.2

- 将别名默认留空的插件 0.1.2、回归测试及相关文档提交至 pro，保留手动别名输入。
- 已核对本地与 origin/pro 基线一致；本次代码与已通过导入回归、插件安装加载和 ESLint 的代码一致。
