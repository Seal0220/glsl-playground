import { Projectron } from '../src'

var $ = s => document.getElementById(s)

/*
 * init
 */

var size = 256
var s = parseInt(new URLSearchParams(location.search).get('size'))
if (s > 8) size = s

var canvas2d = document.createElement('canvas')
canvas2d.width = 256
canvas2d.height = 256
var canvas3d = $('view3d')
var proj = new Projectron(canvas2d, size)
var viewerProj = new Projectron(canvas3d, size)

window.p = proj

var mainImage = null
var sideImage = null

var mainDefaultSrc = './img/1.png'
var sideDefaultSrc = './img/TS.jpg'

var paused = true
var previewCameraMode = 'front'
var generations = 0
var gensPerFrame = 20
var gensPerSec = 0

var draw2dNeeded = true
var last2dDraw = 0
var lastGenCt = 0
var lastHtmlUpdate = 0

var viewerCameraRot = [0, 0]
var viewerCameraPreset = [0, 0]
var viewerDrawNeeded = true
var viewerSyncDirty = true
var lastViewerSync = 0

function getActivePanel() {
    return window.__projectronActivePanel || 'genmix'
}

function is2dPanelActive() {
    return getActivePanel() === 'genmix'
}

function is3dPanelActive() {
    return getActivePanel() === 'genmix'
}

function markViewerDirty(reason) {
    viewerSyncDirty = true
}

function resizeCanvasSquare(canvas, onDone) {
    if (!canvas) return
    var width = canvas.clientWidth || canvas.width || 500
    var height = canvas.clientHeight || width
    var side = Math.max(240, Math.floor(Math.min(width, height)))
    if (canvas.width !== side || canvas.height !== side) {
        canvas.width = side
        canvas.height = side
        if (onDone) onDone()
    }
}

function loadDefaultImages() {
    if (mainDefaultSrc) {
        var imgMain = new Image()
        imgMain.onload = () => { setMainImage(imgMain) }
        imgMain.onerror = () => {
            console.warn('主視圖預設圖片載入失敗：', mainDefaultSrc)
        }
        imgMain.src = mainDefaultSrc
    }

    if (sideDefaultSrc) {
        var imgSide = new Image()
        imgSide.onload = () => { setSideImage(imgSide) }
        imgSide.onerror = () => {
            console.warn('側視圖預設圖片載入失敗：', sideDefaultSrc)
        }
        imgSide.src = sideDefaultSrc
    }
}

function resetGenerationCounters() {
    generations = 0
    gensPerSec = 0
    lastGenCt = 0
    lastHtmlUpdate = performance.now()
}

function setMainImage(imgObj) {
    resetGenerationCounters()
    mainImage = imgObj
    proj.setTargetImage(imgObj)
    draw2dNeeded = true
    markViewerDirty('模型已更新')

    var thumb = $('thumbMain')
    if (thumb) thumb.src = imgObj.src
}

function setSideImage(imgObj) {
    sideImage = imgObj
    proj.setTargetImage2(imgObj)
    draw2dNeeded = true
    markViewerDirty('模型已更新')

    var thumb = $('thumbSide')
    if (thumb) thumb.src = imgObj.src
}

function draw2d() {
    proj._drawScratchImage()
}

function applyViewerCameraMode(mode) {
    previewCameraMode = mode || 'front'

    switch (previewCameraMode) {
        case 'side':
            viewerCameraPreset = [Math.PI / 2, 0]
            break
        case 'top':
            viewerCameraPreset = [0, -Math.PI / 2]
            break
        default:
            viewerCameraPreset = [0, 0]
            break
    }

    viewerCameraRot[0] = 0
    viewerCameraRot[1] = 0
    viewerDrawNeeded = true
}

function syncViewerFromMain(force) {
    var now = performance.now()
    if (!force && !viewerSyncDirty) return
    if (!force && now - lastViewerSync < 250) return

    var data = proj.exportData()
    viewerProj.importData(data)
    viewerDrawNeeded = true
    viewerSyncDirty = false
    lastViewerSync = now
}

function updateHTML() {
    $('polys').value = proj.getNumPolys()
    $('gens').value = generations
    $('gps').value = gensPerSec.toFixed(0)

    $('modelPolys').value = proj.getNumPolys()
    $('modelGens').value = generations
    $('modelScore').value = proj.getScore().toFixed(5)
}

function exportCurrentPly(filename) {
    var ply = proj.exportPLY()
    var blob = new Blob([ply], { type: 'application/octet-stream' })
    var url = URL.createObjectURL(blob)
    var link = document.createElement('a')
    link.href = url
    link.download = filename || 'projectron-export.ply'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 0)
}

function setupInput(el, handler) {
    var node = $(el)
    if (!node) return
    node.addEventListener('change', ev => {
        var t = ev.target.type
        if (t === 'checkbox') return handler(ev.target.checked)
        return handler(ev.target.value)
    })
}

function resetViewerCamera() {
    viewerCameraRot[0] = 0
    viewerCameraRot[1] = 0
    viewerDrawNeeded = true
}

function resetProject() {
    paused = true
    var pausedCheckbox = $('paused')
    if (pausedCheckbox) {
        pausedCheckbox.checked = true
        pausedCheckbox.dispatchEvent(new Event('change', { bubbles: true }))
    }

    resetGenerationCounters()
    last2dDraw = 0
    draw2dNeeded = true

    proj = new Projectron(canvas2d, size)
    window.p = proj

    var minAlphaVal = parseFloat($('minAlpha').value) || 0.1
    var maxAlphaVal = parseFloat($('maxAlpha').value) || 0.5
    proj.setAlphaRange(minAlphaVal, maxAlphaVal)
    proj.setAdjustAmount(parseFloat($('adjust').value) || 0.5)
    proj.setFewerPolyTolerance(parseFloat($('preferFewer').value) || 0)

    if (mainImage) proj.setTargetImage(mainImage)
    if (sideImage) proj.setTargetImage2(sideImage)

    resetViewerCamera()
    markViewerDirty('模型已重設')
    syncViewerFromMain(true)
    updateHTML()
}

console.log('GLSL-Projectron ver ' + proj.version)

loadDefaultImages()
applyViewerCameraMode(previewCameraMode)

resizeCanvasSquare(canvas2d, () => { draw2dNeeded = true })
resizeCanvasSquare(canvas3d, () => { viewerDrawNeeded = true })
window.addEventListener('resize', () => {
    resizeCanvasSquare(canvas2d, () => { draw2dNeeded = true })
    resizeCanvasSquare(canvas3d, () => { viewerDrawNeeded = true })
})

/*
 * render loop
 */

function render() {
    if (!paused) {
        for (var i = 0; i < gensPerFrame; i++) proj.runGeneration()
        generations += gensPerFrame
        draw2dNeeded = true
        markViewerDirty('待同步')
    }

    var now = performance.now()
    if (now - lastHtmlUpdate > 500) {
        gensPerSec = (generations - lastGenCt) / (now - lastHtmlUpdate) * 1000
        updateHTML()
        lastGenCt = generations
        lastHtmlUpdate = now
    }

    if (is2dPanelActive() && (now - last2dDraw > 500 || draw2dNeeded)) {
        draw2d()
        draw2dNeeded = false
        last2dDraw = now
    }

    if (is3dPanelActive()) {
        syncViewerFromMain(false)
        if (viewerDrawNeeded) {
            viewerProj.draw(
                viewerCameraPreset[0] - viewerCameraRot[0],
                viewerCameraPreset[1] - viewerCameraRot[1]
            )
            viewerDrawNeeded = false
        }
    }

    requestAnimationFrame(render)
}
render()

/*
 * inputs
 */

setupInput('paused', val => { paused = val })
setupInput('gensPerFrame', val => { gensPerFrame = parseInt(val) || 20 })
setupInput('display2dMode', val => { applyViewerCameraMode(val) })

var minAlpha = 0.1
var maxAlpha = 0.5
var setAlpha = () => proj.setAlphaRange(minAlpha, maxAlpha)

setupInput('minAlpha', val => { minAlpha = parseFloat(val); setAlpha() })
setupInput('maxAlpha', val => { maxAlpha = parseFloat(val); setAlpha() })
setupInput('adjust', val => { proj.setAdjustAmount(parseFloat(val) || 0.5) })
setupInput('preferFewer', val => { proj.setFewerPolyTolerance(parseFloat(val) || 0) })

$('exportModelData').addEventListener('click', () => {
    $('modelData').value = proj.exportData()
})

$('exportModelPly').addEventListener('click', () => {
    exportCurrentPly('projectron-export.ply')
})

$('importModelData').addEventListener('click', () => {
    var dat = $('modelData').value
    var res = proj.importData(dat)
    if (res) {
        resetGenerationCounters()
        draw2dNeeded = true
        markViewerDirty('模型已匯入')
        syncViewerFromMain(true)
    }
})

$('resetBtn').addEventListener('click', resetProject)

document.addEventListener('keydown', ev => {
    var tag = ev.target && ev.target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    if (ev.code === 'Space') {
        ev.preventDefault()
        paused = !paused
        var pausedCheckbox = $('paused')
        pausedCheckbox.checked = paused
        pausedCheckbox.dispatchEvent(new Event('change', { bubbles: true }))
    }
})

/*
 * 3d viewer drag
 */

var rotScale = 1 / 150
var cameraReturn = 0.9
var dragging3d = false
var lastViewerLoc = [0, 0]

function getEventLoc(ev) {
    if (typeof ev.clientX === 'number') return [ev.clientX, ev.clientY]
    if (ev.targetTouches && ev.targetTouches.length) {
        var touch = ev.targetTouches[0]
        return [touch.clientX, touch.clientY]
    }
    return null
}

function startViewerDrag(ev) {
    ev.preventDefault()
    dragging3d = true
    lastViewerLoc = getEventLoc(ev) || lastViewerLoc
}

function dragViewer(ev) {
    if (!dragging3d) return
    var loc = getEventLoc(ev)
    if (!loc) return
    ev.preventDefault()
    viewerCameraRot[0] += (loc[0] - lastViewerLoc[0]) * rotScale
    viewerCameraRot[1] += (loc[1] - lastViewerLoc[1]) * rotScale
    lastViewerLoc = loc
    viewerDrawNeeded = true
}

function stopViewerDrag() {
    dragging3d = false
    returnViewerCamera()
}

function returnViewerCamera() {
    if (dragging3d) return
    viewerCameraRot.forEach((rot, i) => {
        rot *= cameraReturn
        viewerCameraRot[i] = (Math.abs(rot) < 1e-4) ? 0 : rot
        viewerDrawNeeded = true
    })
    if (viewerCameraRot[0] || viewerCameraRot[1]) {
        requestAnimationFrame(returnViewerCamera)
    }
}

canvas3d.addEventListener('mousedown', startViewerDrag)
canvas3d.addEventListener('touchstart', startViewerDrag)
document.body.addEventListener('mouseup', stopViewerDrag)
document.body.addEventListener('touchend', stopViewerDrag)
document.body.addEventListener('mousemove', dragViewer)
document.body.addEventListener('touchmove', dragViewer)

/*
 * file inputs
 */

function loadImageFromFile(file, onLoad) {
    if (!file || !file.type.match(/image.*/)) return
    var img = new Image()
    img.onload = () => onLoad(img)
    var reader = new FileReader()
    reader.onloadend = e => { img.src = e.target.result }
    reader.readAsDataURL(file)
}

function loadTextFromFile(file, onLoad) {
    if (!file) return
    var reader = new FileReader()
    reader.onloadend = e => onLoad(e.target.result || '')
    reader.readAsText(file)
}

window.addEventListener('load', function () {
    var panel2d = document.querySelector('[data-panel="genmix"]')

    var stopPrevent = ev => {
        ev.stopPropagation()
        ev.preventDefault()
    }

    if (panel2d) {
        panel2d.addEventListener('dragenter', stopPrevent)
        panel2d.addEventListener('dragover', stopPrevent)
        panel2d.addEventListener('drop', ev => {
            stopPrevent(ev)
            var url = ev.dataTransfer.getData('text/plain')
            var imgTmp = new Image()
            if (url) {
                imgTmp.onload = () => { setMainImage(imgTmp) }
                imgTmp.src = url
            } else {
                var file = ev.dataTransfer.files[0]
                loadImageFromFile(file, setMainImage)
            }
        })
    }

    var fileInput1 = $('imageInput')
    var uploadBtn1 = $('uploadTrigger')

    if (fileInput1 && uploadBtn1) {
        uploadBtn1.addEventListener('click', () => {
            fileInput1.value = ''
            fileInput1.click()
        })

        fileInput1.addEventListener('change', ev => {
            var file = ev.target.files && ev.target.files[0]
            loadImageFromFile(file, setMainImage)
        })
    }

    var fileInput2 = $('imageInput2')
    var uploadBtn2 = $('uploadTrigger2')

    if (fileInput2 && uploadBtn2) {
        uploadBtn2.addEventListener('click', () => {
            fileInput2.value = ''
            fileInput2.click()
        })

        fileInput2.addEventListener('change', ev => {
            var file = ev.target.files && ev.target.files[0]
            loadImageFromFile(file, setSideImage)
        })
    }

    var modelPlyInput = $('modelPlyInput')
    var importModelPlyBtn = $('importModelPly')

    if (modelPlyInput && importModelPlyBtn) {
        importModelPlyBtn.addEventListener('click', () => {
            modelPlyInput.value = ''
            modelPlyInput.click()
        })

        modelPlyInput.addEventListener('change', ev => {
            var file = ev.target.files && ev.target.files[0]
            loadTextFromFile(file, text => {
                var res = proj.importPLY(text)
                if (res) {
                    resetGenerationCounters()
                    $('modelData').value = ''
                    draw2dNeeded = true
                    markViewerDirty('模型已匯入')
                    syncViewerFromMain(true)
                }
            })
        })
    }

    syncViewerFromMain(true)
    updateHTML()
})

window.addEventListener('projectron-panel-change', ev => {
    var panel = ev.detail && ev.detail.panel
    if (panel === 'genmix') {
        draw2dNeeded = true
        syncViewerFromMain(true)
        viewerDrawNeeded = true
    }
})
