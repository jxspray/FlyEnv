# phpStudy 站点导入插件

## 功能

- 扫描 phpStudy 的 Nginx/Apache 站点并合并，读取域名、项目目录、端口、SSL、伪静态和来源 PHP。
- 核对每个站点与目标 PHP，支持同来源版本批量匹配，并复用 FlyEnv PHP 版本管理界面安装缺失版本。
- 确认后备份配置，按进度逐站点追加导入，保留成功、失败、跳过和待检查结果。

当前支持 Windows，已安装宿主基线为 FlyEnv 4.20.3。界面文案为中文。

0.1.1 的表格包含展开、站点、来源 PHP、迁移 PHP 四列。站点表头复选框支持全选、取消和半选，操作作用于当前筛选中的可选项。切换筛选时保留已有选择，并显示筛选范围外的已选数量。

支持按主域名或别名模糊搜索、来源 PHP 版本和 Web 服务组合筛选。来源同时包含 Apache 与 Nginx 的站点可由任一服务命中。选好站点与迁移版本后，点击确认导入提交当前配置。

PHP 站点沿用 FlyEnv 的主次版本运行服务，同一主次版本须选择相同的完整版本。导入后在宿主服务页启动对应服务。

## 构建

在项目根目录运行以下命令。

```powershell
yarn build:phpstudy-import
```

产物位于 release/plugins/phpstudy-import，包含独立 flyenv-plugin 包及本地 registry.json。

## 本地安装

在项目根目录启动静态服务。

```powershell
python -m http.server 9089 --bind 127.0.0.1 --directory release/plugins/phpstudy-import
```

打开 FlyEnv 的设置、插件、第三方插件源，添加以下地址，再安装 phpStudy 站点导入。

```text
http://127.0.0.1:9089/registry.json
```

安装后在左侧站点区域打开 phpStudy 导入。插件已安装后可以关闭本地静态服务，后续升级时再启动。

4.20.3 含早期内置站点导入。可在设置的模块显示项中隐藏 site-import 对应的内置入口，独立插件标识为 phpstudy-import。

以后发布到服务器时，将插件包及 registry.json 放到同一目录，并把 registry.json 的 artifact.url 改为实际包地址，保留相应 SHA-256。

## 数据与结果

默认引用原项目目录。导入前在 FlyEnv 数据目录的 server/backups 下备份站点配置，完成后同步宿主站点列表及 hosts。

来源目录偏好使用插件的 Storage API 保存。扫描、导入状态由插件单例控制器持有，切换页面可继续查看任务结果。

无法处理的代理或自定义配置会显示原因。目录和 SSL 路径可在核对页修正，写入前再次验证实际路径与 PHP 可执行文件。

## 独立测试

在项目根目录运行命令行回归测试。

```powershell
yarn test:site-import
yarn test:phpstudy-import-plugin
```

第一条覆盖解析、版本核对、批量导入失败边界和控制器生命周期。第二条使用临时数据目录和本地 HTTP 服务，验证插件包的安装、加载、宿主桥接、监听清理、启停用和卸载。

插件包测试读取 release/plugins/phpstudy-import 中的产物，首次测试前先运行 yarn build:phpstudy-import。

需要操作完整界面时，使用 FlyEnv 插件开发模式并指定测试数据目录。

```powershell
$env:FLYENV_DATA_ROOT = Join-Path (Get-Location) 'tmp/phpstudy-import-dev-data'
yarn plugin:dev phpstudy-import
```

开发模式在 Electron 测试窗口中加载插件，界面继续使用宿主提供的 Vue、IPC 和版本管理组件。界面测试时可扫描本机 phpStudy，导入结果写入指定测试目录。
