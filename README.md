# GLSL Playground

GLSL Playground 是一個以 WebGL 與 GLSL 為核心的互動式實驗專案，整合了多邊形演化、模型預覽、Shader 編輯與材質測試等功能。專案以靜態網站形式輸出於 `docs/`，可作為教學展示、圖形計算課程作業、WebGL 實驗平台，或作為後續擴充工具頁面的基礎。


## Features

- `GenSolo`：以單張參考圖驅動三角形模型演化，觀察多邊形集合逐步逼近目標影像。
- `GenMix`：同時使用主視圖與側視圖進行評分，以雙視角幾何平均分數約束模型演化結果。
- `GenViewer`：匯入 `.ply` 模型並以可編輯的 vertex / fragment shader 進行即時預覽。
- `GLSL Editor`：提供獨立的 shader 編輯與編譯介面，適合快速測試 GLSL 程式片段。
- `ObjBasic`：載入 OBJ 模型與貼圖素材，切換多種著色模式並支援現場修改 shader。
- 靜態工具頁載入架構：首頁以 hash 導航切換各工具頁面，例如 `#gensolo`、`#genmix`、`#genviewer`。

## Core Concept

`GenSolo` 與 `GenMix` 的核心是以 GPU 驅動的多邊形演化流程重建影像：

1. 在 3D 空間中建立由三角形組成的模型資料。
2. 每一代隨機執行頂點變形、屬性變異、增加面或移除面等操作。
3. 將結果投影到 2D 畫面後，與參考圖進行差異比較。
4. 若新結果分數較高，或在容忍範圍內且使用更少多邊形，則保留本次突變。

在 `GenMix` 中，系統會分別以正面與固定側面視角渲染，再以兩個分數的幾何平均作為最終適應度，使演化結果同時受兩張圖像限制。

## Getting Started

### Requirements

- Node.js 16 以上
- npm
- 支援 WebGL 的現代瀏覽器

### Install

```bash
npm install
```

### Start Development Server

```bash
npm start
```

開發伺服器由 `webpack-dev-server` 提供，內容來源為 `docs/`。啟動後可在瀏覽器開啟本機網址進行互動測試。

### Build Static Site

```bash
npm run build
```

建置後的 bundle 會輸出到 `docs/assets/bundles/`，供 GitHub Pages 或其他靜態主機直接部署。

## Project Structure

```text
.
|-- demo/                     # Webpack 入口與各工具頁 runtime
|-- docs/                     # 靜態網站輸出、頁面模板、素材與打包結果
|   |-- assets/
|   |-- pages/
|   `-- index.html
|-- src/                      # Projectron 核心邏輯與 GLSL shader
|   |-- shaders/
|   |-- index.js
|   `-- polydata.js
|-- package.json
`-- README.md
```

## Main Modules

### `src/`

`src/index.js` 提供 `Projectron` 核心類別，負責：

- 建立 WebGL context 與 framebuffer
- 管理多邊形資料與突變流程
- 計算單視角或雙視角的比較分數
- 匯出 / 匯入自訂模型資料格式
- 匯出 / 匯入 ASCII PLY 幾何資料

### `demo/`

`demo/` 內含各工具的前端入口程式，經 Webpack 打包後輸出到 `docs/assets/bundles/`：

- `app-shell.js`：首頁工具切換、頁面載入與 runtime 管理
- `maker.js`：`GenSolo` / `GenMix` 的控制邏輯
- `viewer.js`：`GenViewer` 的 PLY 預覽與後處理 shader 編輯
- `editor.js`：獨立 GLSL 編輯器
- `objbasic.js`：OBJ 模型著色測試與模式切換

### `docs/`

`docs/` 為實際部署內容，包含：

- `index.html`：工具總入口
- `pages/*.html`：各工具面板模板
- `assets/images`、`assets/ply`：示範圖片與模型資料
- `assets/external/objbasic`：ObjBasic 使用的外部 shader、模型與貼圖素材

## Usage Notes

- `GenSolo` 適合從單張影像建立初步輪廓。
- `GenMix` 適合以兩張不同視角的圖片約束模型形體。
- `GenViewer` 與 `ObjBasic` 皆支援直接修改 GLSL 並重新套用結果。
- PLY 匯入目前以 ASCII 格式、三角面資料為主要支援目標。
- 若瀏覽器或顯示卡未提供 WebGL 支援，部分功能將無法使用。

## Scripts

- `npm start`：啟動開發伺服器
- `npm run build`：建置靜態輸出至 `docs/`

## Credits

- 原始概念與基礎實作來自 [fenomas/glsl-projectron](https://github.com/fenomas/glsl-projectron)
- `ObjBasic` 頁面使用的 `"Bagel Seal"` 模型作者為 Jerry Bot，授權為 CC BY-NC 4.0

## License

上游專案 `fenomas/glsl-projectron` 採用 MIT License。本 repository 目前尚未附上獨立的 `LICENSE` 檔案；若要正式對外發布，建議在根目錄補上明確授權文件，以便第三方確認使用條件。

網站內容與介面文字另可依 `docs/index.html` 中標示之條款管理。第三方素材仍以其原始授權為準。
