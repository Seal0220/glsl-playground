import { Projectron } from '../src'

var $ = s => document.getElementById(s)

var panelConfigs = {
    gensolo: {
        defaultMainSrc: './img/1.png',
        defaultSideSrc: null
    },
    genmix: {
        defaultMainSrc: './img/1.png',
        defaultSideSrc: './img/TS.jpg'
    }
}

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

var activeTool = null
var mainImage = null
var sideImage = null

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
    return window.__projectronActivePanel || 'gensolo'
}

function getToolConfig(panelName) {
    return panelConfigs[panelName] || null
}

function isRuntimePanelActive() {
    return !!getToolConfig(getActivePanel())
}

function getCurrentPanelNode() {
    return document.querySelector('[data-panel="' + getActivePanel() + '"]')
}

function setFieldValue(id, value) {
    var field = $(id)
    if (field) field.value = value
}

function markViewerDirty() {
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

function bindViewerCanvas() {
    var nextCanvas = $('view3d')
    if (!nextCanvas || nextCanvas === canvas3d) return

    canvas3d = nextCanvas
    viewerProj = new Projectron(canvas3d, size)
    resizeCanvasSquare(canvas3d, () => { viewerDrawNeeded = true })

    if (canvas3d.dataset.viewerDragBound !== 'true') {
        canvas3d.dataset.viewerDragBound = 'true'
        canvas3d.addEventListener('mousedown', startViewerDrag)
        canvas3d.addEventListener('touchstart', startViewerDrag)
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
    markViewerDirty()

    var thumb = $('thumbMain')
    if (thumb) thumb.src = imgObj.src
}

function clearSidePreview() {
    var thumb = $('thumbSide')
    if (thumb) thumb.removeAttribute('src')
}

function setSideImage(imgObj) {
    sideImage = imgObj
    proj.setTargetImage2(imgObj)
    draw2dNeeded = true
    markViewerDirty()

    var thumb = $('thumbSide')
    if (thumb) thumb.src = imgObj.src
}

function loadDefaultImages(config) {
    if (config.defaultMainSrc) {
        var imgMain = new Image()
        imgMain.onload = () => { setMainImage(imgMain) }
        imgMain.onerror = () => {
            console.warn('主視圖預設圖片載入失敗：', config.defaultMainSrc)
        }
        imgMain.src = config.defaultMainSrc
    }

    if (config.defaultSideSrc) {
        var imgSide = new Image()
        imgSide.onload = () => { setSideImage(imgSide) }
        imgSide.onerror = () => {
            console.warn('側視圖預設圖片載入失敗：', config.defaultSideSrc)
        }
        imgSide.src = config.defaultSideSrc
    } else {
        sideImage = null
        clearSidePreview()
    }
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
    setFieldValue('polys', proj.getNumPolys())
    setFieldValue('gens', generations)
    setFieldValue('gps', gensPerSec.toFixed(0))
    setFieldValue('modelPolys', proj.getNumPolys())
    setFieldValue('modelGens', generations)
    setFieldValue('modelScore', proj.getScore().toFixed(5))
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
    if (!node || node.dataset.runtimeInputReady === 'true') return
    node.dataset.runtimeInputReady = 'true'
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

function applyCurrentControls() {
    var minAlphaField = $('minAlpha')
    var maxAlphaField = $('maxAlpha')
    var adjustField = $('adjust')
    var preferFewerField = $('preferFewer')
    var gensPerFrameField = $('gensPerFrame')
    var displayModeField = $('display2dMode')

    proj.setAlphaRange(
        parseFloat(minAlphaField && minAlphaField.value) || 0.1,
        parseFloat(maxAlphaField && maxAlphaField.value) || 0.5
    )
    proj.setAdjustAmount(parseFloat(adjustField && adjustField.value) || 0.5)
    proj.setFewerPolyTolerance(parseFloat(preferFewerField && preferFewerField.value) || 0)
    gensPerFrame = parseInt(gensPerFrameField && gensPerFrameField.value) || 20
    applyViewerCameraMode(displayModeField && displayModeField.value)
}

function rebuildProject() {
    proj = new Projectron(canvas2d, size)
    window.p = proj

    applyCurrentControls()

    if (mainImage) proj.setTargetImage(mainImage)
    if (sideImage) proj.setTargetImage2(sideImage)

    draw2dNeeded = true
    markViewerDirty()
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
    rebuildProject()
    resetViewerCamera()
    syncViewerFromMain(true)
    updateHTML()
}

function configureTool(panelName, forceReset) {
    var config = getToolConfig(panelName)
    if (!config) return
    if (!forceReset && activeTool === panelName) return

    activeTool = panelName
    mainImage = null
    sideImage = null
    clearSidePreview()
    resetProject()
    loadDefaultImages(config)
}

function bindToolInputs() {
    setupInput('paused', val => { paused = val })
    setupInput('gensPerFrame', val => { gensPerFrame = parseInt(val) || 20 })
    setupInput('display2dMode', val => { applyViewerCameraMode(val) })

    var minAlpha = parseFloat($('minAlpha') && $('minAlpha').value) || 0.1
    var maxAlpha = parseFloat($('maxAlpha') && $('maxAlpha').value) || 0.5
    var setAlpha = () => proj.setAlphaRange(minAlpha, maxAlpha)

    setupInput('minAlpha', val => {
        minAlpha = parseFloat(val)
        setAlpha()
    })
    setupInput('maxAlpha', val => {
        maxAlpha = parseFloat(val)
        setAlpha()
    })
    setupInput('adjust', val => { proj.setAdjustAmount(parseFloat(val) || 0.5) })
    setupInput('preferFewer', val => { proj.setFewerPolyTolerance(parseFloat(val) || 0) })
}

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

function bindPanelRuntime(panel) {
    if (!panel || panel.dataset.runtimeBound === 'true') return
    panel.dataset.runtimeBound = 'true'

    bindToolInputs()

    var stopPrevent = ev => {
        ev.stopPropagation()
        ev.preventDefault()
    }

    panel.addEventListener('dragenter', stopPrevent)
    panel.addEventListener('dragover', stopPrevent)
    panel.addEventListener('drop', ev => {
        stopPrevent(ev)
        var url = ev.dataTransfer.getData('text/plain')
        var imgTmp = new Image()
        if (url) {
            imgTmp.onload = () => { setMainImage(imgTmp) }
            imgTmp.src = url
        } else {
            loadImageFromFile(ev.dataTransfer.files[0], setMainImage)
        }
    })

    var exportModelData = $('exportModelData')
    if (exportModelData && exportModelData.dataset.runtimeBound !== 'true') {
        exportModelData.dataset.runtimeBound = 'true'
        exportModelData.addEventListener('click', () => {
            var modelData = $('modelData')
            if (modelData) modelData.value = proj.exportData()
        })
    }

    var exportModelPly = $('exportModelPly')
    if (exportModelPly && exportModelPly.dataset.runtimeBound !== 'true') {
        exportModelPly.dataset.runtimeBound = 'true'
        exportModelPly.addEventListener('click', () => {
            exportCurrentPly('projectron-export.ply')
        })
    }

    var importModelData = $('importModelData')
    if (importModelData && importModelData.dataset.runtimeBound !== 'true') {
        importModelData.dataset.runtimeBound = 'true'
        importModelData.addEventListener('click', () => {
            var modelData = $('modelData')
            var dat = modelData ? modelData.value : ''
            var res = proj.importData(dat)
            if (res) {
                resetGenerationCounters()
                draw2dNeeded = true
                markViewerDirty()
                syncViewerFromMain(true)
            }
        })
    }

    var resetButton = $('resetBtn')
    if (resetButton && resetButton.dataset.runtimeBound !== 'true') {
        resetButton.dataset.runtimeBound = 'true'
        resetButton.addEventListener('click', resetProject)
    }

    var fileInput1 = $('imageInput')
    var uploadBtn1 = $('uploadTrigger')
    if (fileInput1 && uploadBtn1 && uploadBtn1.dataset.runtimeBound !== 'true') {
        uploadBtn1.dataset.runtimeBound = 'true'
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
    if (fileInput2 && uploadBtn2 && uploadBtn2.dataset.runtimeBound !== 'true') {
        uploadBtn2.dataset.runtimeBound = 'true'
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
    if (modelPlyInput && importModelPlyBtn && importModelPlyBtn.dataset.runtimeBound !== 'true') {
        importModelPlyBtn.dataset.runtimeBound = 'true'
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
                    var modelData = $('modelData')
                    if (modelData) modelData.value = ''
                    draw2dNeeded = true
                    markViewerDirty()
                    syncViewerFromMain(true)
                }
            })
        })
    }
}

console.log('GLSL-Projectron ver ' + proj.version)

resizeCanvasSquare(canvas2d, () => { draw2dNeeded = true })
resizeCanvasSquare(canvas3d, () => { viewerDrawNeeded = true })
window.addEventListener('resize', () => {
    resizeCanvasSquare(canvas2d, () => { draw2dNeeded = true })
    resizeCanvasSquare(canvas3d, () => { viewerDrawNeeded = true })
})

function render() {
    if (!paused) {
        for (var i = 0; i < gensPerFrame; i++) proj.runGeneration()
        generations += gensPerFrame
        draw2dNeeded = true
        markViewerDirty()
    }

    var now = performance.now()
    if (now - lastHtmlUpdate > 500) {
        gensPerSec = (generations - lastGenCt) / (now - lastHtmlUpdate) * 1000
        updateHTML()
        lastGenCt = generations
        lastHtmlUpdate = now
    }

    if (isRuntimePanelActive() && (now - last2dDraw > 500 || draw2dNeeded)) {
        draw2d()
        draw2dNeeded = false
        last2dDraw = now
    }

    if (isRuntimePanelActive()) {
        syncViewerFromMain(false)
        if (viewerProj && viewerDrawNeeded) {
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

document.addEventListener('keydown', ev => {
    var tag = ev.target && ev.target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    if (ev.code === 'Space' && isRuntimePanelActive()) {
        ev.preventDefault()
        paused = !paused
        var pausedCheckbox = $('paused')
        if (pausedCheckbox) {
            pausedCheckbox.checked = paused
            pausedCheckbox.dispatchEvent(new Event('change', { bubbles: true }))
        }
    }
})

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

if (canvas3d) {
    canvas3d.dataset.viewerDragBound = 'true'
    canvas3d.addEventListener('mousedown', startViewerDrag)
    canvas3d.addEventListener('touchstart', startViewerDrag)
}
document.body.addEventListener('mouseup', stopViewerDrag)
document.body.addEventListener('touchend', stopViewerDrag)
document.body.addEventListener('mousemove', dragViewer)
document.body.addEventListener('touchmove', dragViewer)

function initializeActivePanel(forceReset) {
    var panel = getCurrentPanelNode()
    if (!panel) return
    bindViewerCanvas()
    bindPanelRuntime(panel)
    configureTool(getActivePanel(), forceReset)
    syncViewerFromMain(true)
    updateHTML()
}

initializeActivePanel(true)

window.addEventListener('projectron-panel-change', () => {
    initializeActivePanel(true)
    draw2dNeeded = true
    viewerDrawNeeded = true
})
