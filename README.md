# GLSL-Projectron（雙視角版本）

本專案為 [fenomas/glsl-projectron](https://github.com/fenomas/glsl-projectron) 的延伸版本。  
在原本「單一視角、多邊形演化逼近影像」的基礎上，加入：

- 主視圖（正面）＋側視圖（繞 Y 軸 +90°）的 **雙視角**
- 兩張目標圖像的 **幾何平均分數** 作為適應度
- 中文操作介面、縮圖預覽與重置功能

---

## 1. 概念說明

GLSL-Projectron 是一個使用 WebGL / GPGPU 的圖像重建實驗。

- 在 3D 空間中隨機生成大量三角形（多邊形雲）。
- 每一代透過 **突變（mutate）＋篩選（保留分數較高者）** 更新多邊形。
- 將 3D 場景投影到 2D 平面後，與目標圖片比較差異，得到分數（score）。
- 分數越高代表越接近目標影像。

本 fork 版本中：

- 第一張圖片為「主視圖」（正面 Frontal View）。
- 第二張圖片為「側視圖」（固定繞 Y 軸 +90° 之右側 View）。
- 每一代演化時，會同時：
  - 用正面 camera 畫出 scratch1，與正面參考圖比較得分 `scoreFront`。
  - 用側面 camera 畫出 scratch2，與側面參考圖比較得分 `scoreSide`。
  - 將兩者做幾何平均：`totalScore = sqrt(scoreFront * scoreSide)` 作為最終分數。
- 若新分數較好（或在容忍度內、且多邊形數更少）就保留這一代的突變。

---

## 2. 線上展示

https://glsl.seal.blue/projectron/

進入後可直接操作

---

## 3. 安裝與執行

### 3.1 前置需求

- Node.js（建議 16+）
- npm

### 3.2 開發模式（webpack-dev-server）

```bash
git clone https://github.com/<你的帳號>/<repo 名稱>.git
cd <repo 名稱>
npm install
npm start
