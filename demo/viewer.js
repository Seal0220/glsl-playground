import { Projectron } from '../src'

var $ = s => document.getElementById(s)

var size = 256
var qSize = parseInt(new URLSearchParams(location.search).get('size'))
if (qSize > 8) size = qSize

var canvas = $('view')
var proj = canvas ? new Projectron(canvas, size) : null
window.p = proj

var cameraRot = [0, 0]
var drawNeeded = true
var dragging = false
var lastLoc = [0, 0]
var rotScale = 1 / 150
var cameraReturn = 0.9

function getActivePanel() {
    return window.__projectronActivePanel || 'gensolo'
}

function isViewerPanelActive() {
    return getActivePanel() === 'plyviewer'
}

function resizeCanvasSquare() {
    if (!canvas) return
    var w = canvas.clientWidth || 512
    var h = canvas.clientHeight || w
    var side = Math.max(240, Math.floor(Math.min(w, h)))
    if (canvas.width !== side || canvas.height !== side) {
        canvas.width = side
        canvas.height = side
        drawNeeded = true
    }
}

function getEventLoc(ev) {
    if (typeof ev.clientX === 'number') return [ev.clientX, ev.clientY]
    if (ev.targetTouches && ev.targetTouches.length) {
        var touch = ev.targetTouches[0]
        return [touch.clientX, touch.clientY]
    }
    return null
}

function startDrag(ev) {
    if (!isViewerPanelActive()) return
    ev.preventDefault()
    dragging = true
    lastLoc = getEventLoc(ev) || lastLoc
}

function drag(ev) {
    if (!dragging || !isViewerPanelActive()) return
    var loc = getEventLoc(ev)
    if (!loc) return
    ev.preventDefault()
    cameraRot[0] += (loc[0] - lastLoc[0]) * rotScale
    cameraRot[1] += (loc[1] - lastLoc[1]) * rotScale
    lastLoc = loc
    drawNeeded = true
}

function stopDrag() {
    dragging = false
    returnCamera()
}

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

function loadTextFromFile(file, onLoad) {
    if (!file) return
    var reader = new FileReader()
    reader.onloadend = e => onLoad(e.target.result || '')
    reader.readAsText(file)
}

function bindCanvas() {
    var nextCanvas = $('view')
    if (!nextCanvas || nextCanvas === canvas) return

    canvas = nextCanvas
    proj = new Projectron(canvas, size)
    window.p = proj
    resizeCanvasSquare()

    if (canvas.dataset.viewerReady !== 'true') {
        canvas.dataset.viewerReady = 'true'
        canvas.addEventListener('mousedown', startDrag)
        canvas.addEventListener('touchstart', startDrag)
    }
}

function bindPanel() {
    var panel = document.querySelector('[data-panel="plyviewer"]')
    if (!panel || panel.dataset.viewerPanelReady === 'true') return
    panel.dataset.viewerPanelReady = 'true'

    var input = $('viewModelPlyInput')
    var button = $('loadPlyBtn')

    if (button && input) {
        button.addEventListener('click', () => {
            input.value = ''
            input.click()
        })

        input.addEventListener('change', ev => {
            var file = ev.target.files && ev.target.files[0]
            loadTextFromFile(file, text => {
                if (proj && proj.importPLY(text)) {
                    drawNeeded = true
                }
            })
        })
    }
}

function initializeViewerPanel() {
    if (!isViewerPanelActive()) return
    bindCanvas()
    bindPanel()
    resizeCanvasSquare()
    drawNeeded = true
}

function render() {
    if (isViewerPanelActive() && proj && drawNeeded) {
        proj.draw(-cameraRot[0], -cameraRot[1])
        drawNeeded = false
    }
    requestAnimationFrame(render)
}

if (canvas) {
    canvas.dataset.viewerReady = 'true'
    canvas.addEventListener('mousedown', startDrag)
    canvas.addEventListener('touchstart', startDrag)
}

document.body.addEventListener('mouseup', stopDrag)
document.body.addEventListener('touchend', stopDrag)
document.body.addEventListener('mousemove', drag)
document.body.addEventListener('touchmove', drag)
window.addEventListener('resize', resizeCanvasSquare)
window.addEventListener('projectron-panel-change', initializeViewerPanel)

initializeViewerPanel()
requestAnimationFrame(render)
