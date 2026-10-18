# GitHub Release 发布步骤

当前版本：**1.0.2**。仓库：<https://github.com/ILikeIneine/auto_split>。

## 1. 本地打包

在项目目录运行：

```powershell
cd G:\auto_split
npm test
npm run package
```

生成两个文件：

- `dist/auto-split-1.0.2.zip`：插件安装包，包含运行文件和图标，`manifest.json` 直接位于 ZIP 根目录。
- `dist/auto-split-1.0.2.zip.sha256`：校验文件，可一同上传。

`dist/` 已被 `.gitignore` 忽略，不需要把 ZIP 提交到 Git。包内不包含设计过程图片、测试或 Git 数据。

打包命令使用 Python 3.9+ 的标准库，不需要 pip 或 npm 依赖。Python 只用于开发打包，用户安装插件无需 Python。

以后发布新版本时，先同步增加 `extension/manifest.json` 和 `package.json` 中的版本号，再重新运行打包命令。

## 2. 保存并推送对应源码

检查并提交要随此版本发布的改动，使 GitHub 标签所指向的源码与 ZIP 一致：

```powershell
git status
git add extension package.json README.md tools/build-icons.py tools/package.py docs/RELEASING.md artwork/auto-split-icon-approved.png
git diff --cached --stat
git commit -m "Release Auto Split v1.0.2 with extension icons"
git push origin master
```

提交前检查暂存区；已经暂存的其他修改也会包含在这次提交中。设计过程中的其他 `artwork/` 文件可以自行决定是否纳入版本库，插件包只包含选定图标。

## 3. 在 GitHub 新建 Release

1. 打开 <https://github.com/ILikeIneine/auto_split/releases/new>。
2. 在 **Choose a tag** 中输入 `v1.0.2`，选择创建这个新标签；如果已有同名标签，先核对它是否对应本次版本。
3. **Target** 选择已经推送本次修改的 `master` 分支。
4. **Release title** 填写 `Auto Split v1.0.2`。
5. 描述可使用下方示例。
6. 在附件区域上传 `auto-split-1.0.2.zip`，也可附上 `.sha256` 文件，等待上传完成。
7. 可先点 **Save draft** 检查附件与内容；确认后点 **Publish release**。正式版本可标记为最新版本，无需勾选预发布。

## 发布说明示例

```markdown
### 更新
- 新增“小人推动分隔线”图标，用于工具栏、扩展管理页和弹窗。
- 提供 16、32、48、128 像素透明 PNG 图标。

### 安装
1. 使用 Chrome 155 或更高版本。
2. 下载下方 Assets 中的 auto-split-1.0.2.zip，并解压到固定目录。
3. 打开 chrome://extensions，开启“开发者模式”。
4. 点击“加载已解压的扩展程序”，选择包含 manifest.json 的解压目录。
5. 刷新已经打开的网页，即可点击链接使用自动分屏。

已有用户：更新原插件目录中的文件后，在扩展管理页点击“重新加载”，再刷新网页。
```

## 下载者如何识别附件

安装时选择手动上传的 `auto-split-1.0.2.zip`。GitHub 自动生成的 **Source code (zip)** 是完整源码仓库；如果使用它，需要选择里面的 `extension` 子目录加载。

GitHub Release 提供下载分发。普通用户通过以上开发者模式步骤安装；自动安装和自动更新需要另行通过 Chrome 网上应用店分发。

## 图标来源

本版本使用用户最后确认并附上的图片，原文件保存为 `artwork/auto-split-icon-approved.png`。仅等比例缩小生成四种尺寸，保留透明度，没有使用后续设计版本替换它。重建 PNG 时可以运行 `python tools/build-icons.py`；这只是一项开发工具，不属于插件运行依赖。

官方操作文档：<https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository>。
