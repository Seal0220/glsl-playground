// demo/viewer.js
import { Projectron } from '../src'

/*
 *  簡易工具
 */
var $ = s => document.getElementById(s)

/*
 * 
 *  初始化 Projectron（僅作為幾何 viewer）
 * 
 */

var canvas = $('view')

// 允許用 ?size=512 之類改 internal 比較貼圖大小（跟 demo/maker.js 一致）
var size = 256
var qSize = parseInt(new URLSearchParams(location.search).get('size'))
if (qSize > 8) size = qSize

// 建立 Projectron（新版：canvas, size）
var proj = new Projectron(canvas, size)
// 若需要在 console 測試：window.p.drawTargetImage(1/2) 等
window.p = proj

// 讓畫布維持「正方形」，避免立方體被壓扁
function resizeCanvasSquare() {
    var w = canvas.clientWidth || 512
    var h = canvas.clientHeight || w
    var side = Math.min(w, h)
    canvas.width = side
    canvas.height = side
    drawNeeded = true
}
resizeCanvasSquare()
window.addEventListener('resize', resizeCanvasSquare)

/*
 * 
 *  載入匯出的幾何資料
 *      預期在 HTML 中有一個 <script id="viewData">...</script>
 *      或 <textarea id="viewData">...</textarea>
 * 
 */

document.body.onload = () => {
    var node = $('viewData')
    if (!node) {
        console.warn('viewer.js: 找不到 #viewData，無法匯入資料')
        requestAnimationFrame(render)
        return
    }
    var data = node.textContent || node.value || ''
    if (data.trim()) {
        proj.importData(data)
    }
    requestAnimationFrame(render)
}

/*
 * 
 *  render loop：單純依照 cameraRot 繪製幾何
 * 
 */

var cameraRot = [0, 0]
var drawNeeded = true

function render() {
    if (drawNeeded) {
        // 與 demo/maker.js 一樣使用 -cameraRot
        proj.draw(-cameraRot[0], -cameraRot[1])
        drawNeeded = false
    }
    requestAnimationFrame(render)
}

/*
 * 
 *  滑鼠拖曳控制視角
 * 
 */

var rotScale = 1 / 150
var cameraReturn = 0.9
var dragging = false
var lastLoc = [0, 0]

var getEventLoc = ev => {
    if (typeof ev.clientX === 'number') return [ev.clientX, ev.clientY]
    if (ev.targetTouches && ev.targetTouches.length) {
        var touch = ev.targetTouches[0]
        return [touch.clientX, touch.clientY]
    }
    return null
}

var startDrag = ev => {
    ev.preventDefault()
    dragging = true
    lastLoc = getEventLoc(ev) || lastLoc
}

var drag = ev => {
    if (!dragging) return
    var loc = getEventLoc(ev)
    if (!loc) return
    ev.preventDefault()
    cameraRot[0] += (loc[0] - lastLoc[0]) * rotScale
    cameraRot[1] += (loc[1] - lastLoc[1]) * rotScale
    lastLoc = loc
    drawNeeded = true
}

var stopDrag = ev => {
    if (ev && ev.originalEvent) ev = ev.originalEvent
    dragging = false
    returnCamera()
}

canvas.addEventListener('mousedown', startDrag)
canvas.addEventListener('touchstart', startDrag)
document.body.addEventListener('mouseup', stopDrag)
document.body.addEventListener('touchend', stopDrag)
document.body.addEventListener('mousemove', drag)
document.body.addEventListener('touchmove', drag)

/*
 * 
 *  鏡頭回彈（慣性衰減）
 * 
 */

function returnCamera() {
    if (dragging) return
    cameraRot.forEach((rot, i) => {
        rot *= cameraReturn
        cameraRot[i] = (Math.abs(rot) < 1e-4) ? 0 : rot
        drawNeeded = true
    })
    if (cameraRot[0] || cameraRot[1]) {
        requestAnimationFrame(returnCamera)
    }
}
