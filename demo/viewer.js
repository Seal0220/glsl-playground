import { Projectron } from '../src'
import ace from 'ace-builds/src-noconflict/ace'
import 'ace-builds/src-noconflict/mode-glsl'
import 'ace-builds/src-noconflict/theme-monokai'
import 'ace-builds/src-noconflict/ext-language_tools'

var $ = s => document.getElementById(s)
var shaderEditors = {}

var size = 256
var qSize = parseInt(new URLSearchParams(location.search).get('size'))
if (qSize > 8) size = qSize

var canvas = $('view')
var sourceCanvas = document.createElement('canvas')
sourceCanvas.width = 512
sourceCanvas.height = 512
var proj = canvas ? new Projectron(sourceCanvas, size) : null
window.p = proj

var gl = canvas ? canvas.getContext('webgl', { alpha: false, antialias: true }) : null
var quadBuffer = null
var screenTexture = null
var shaderProgram = null

var cameraRot = [0, 0]
var drawNeeded = true
var dragging = false
var lastLoc = [0, 0]
var rotScale = 1 / 150
var cameraReturn = 0.9

var defaultVertexShader = [
    'attribute vec2 aPosition;',
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = 0.5 * (aPosition + 1.0);',
    '  gl_Position = vec4(aPosition, 0.0, 1.0);',
    '}'
].join('\n')

var defaultFragmentShader = [
    'precision mediump float;',
    'uniform sampler2D uScene;',
    'varying vec2 vUv;',
    '',
    'void main() {',
    '  gl_FragColor = texture2D(uScene, vUv);',
    '}'
].join('\n')

function getActivePanel() {
    return window.__projectronActivePanel || 'gensolo'
}

function isViewerPanelActive() {
    return getActivePanel() === 'genviewer'
}

function resizeCanvasSquare() {
    if (!canvas) return
    var w = canvas.clientWidth || 512
    var h = canvas.clientHeight || w
    var side = Math.max(240, Math.floor(Math.min(w, h)))
    if (canvas.width !== side || canvas.height !== side) {
        canvas.width = side
        canvas.height = side
        sourceCanvas.width = side
        sourceCanvas.height = side
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

function resetCameraPose() {
    cameraRot[0] = 0
    cameraRot[1] = 0
    drawNeeded = true
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

function saveTextFile(filename, content) {
    var blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    var url = URL.createObjectURL(blob)
    var link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 0)
}

function setShaderStatus(text) {
    var status = $('viewerShaderStatus')
    if (status) status.textContent = text
}

function getEditorValue(id) {
    var editor = shaderEditors[id]
    return editor ? editor.getValue() : ''
}

function setEditorValue(id, value) {
    var editor = shaderEditors[id]
    if (editor) editor.setValue(value, -1)
}

function refreshEditors() {
    Object.keys(shaderEditors).forEach(id => {
        var editor = shaderEditors[id]
        if (!editor) return
        editor.resize(true)
        editor.renderer.updateFull()
    })
}

function bindEditor(id) {
    var node = $(id)
    if (!node || shaderEditors[id]) return

    var editor = ace.edit(node)
    editor.session.setMode('ace/mode/glsl')
    editor.setTheme('ace/theme/monokai')
    editor.setOptions({
        useWorker: false,
        showPrintMargin: false,
        showGutter: true,
        showLineNumbers: true,
        highlightGutterLine: true,
        fixedWidthGutter: true,
        tabSize: 2,
        useSoftTabs: true,
        enableBasicAutocompletion: true,
        enableLiveAutocompletion: true,
        enableSnippets: true,
        fontSize: '13px',
        wrap: false,
        highlightActiveLine: true,
        displayIndentGuides: true,
        scrollPastEnd: 0.15
    })
    editor.renderer.setShowGutter(true)
    editor.renderer.setPadding(16)
    editor.renderer.setScrollMargin(12, 12, 0, 0)

    editor.commands.addCommand({
        name: 'applyShader',
        bindKey: { win: 'Ctrl-Enter', mac: 'Command-Enter' },
        exec: applyShaderFromEditor
    })

    shaderEditors[id] = editor
    editor.resize(true)
}

function bindShaderFileTools(kind, editorId, defaultFilename) {
    var importButton = $('importViewer' + kind + 'Shader')
    var saveButton = $('saveViewer' + kind + 'Shader')
    var fileInput = $('viewer' + kind + 'ShaderFile')

    if (importButton && fileInput && importButton.dataset.fileToolReady !== 'true') {
        importButton.dataset.fileToolReady = 'true'
        importButton.addEventListener('click', () => {
            fileInput.value = ''
            fileInput.click()
        })

        fileInput.addEventListener('change', ev => {
            var file = ev.target.files && ev.target.files[0]
            loadTextFromFile(file, text => {
                setEditorValue(editorId, text)
                setShaderStatus(kind + ' Shader 已匯入，尚未套用。')
            })
        })
    }

    if (saveButton && saveButton.dataset.fileToolReady !== 'true') {
        saveButton.dataset.fileToolReady = 'true'
        saveButton.addEventListener('click', () => {
            saveTextFile(defaultFilename, getEditorValue(editorId))
        })
    }
}

function createShader(type, source) {
    var shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        var message = gl.getShaderInfoLog(shader) || 'shader compile failed'
        gl.deleteShader(shader)
        throw new Error(message)
    }
    return shader
}

function buildShaderProgram(vertexSource, fragmentSource) {
    var vertexShader = createShader(gl.VERTEX_SHADER, vertexSource)
    var fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentSource)
    var program = gl.createProgram()
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        var message = gl.getProgramInfoLog(program) || 'program link failed'
        gl.deleteProgram(program)
        throw new Error(message)
    }

    return {
        handle: program,
        aPosition: gl.getAttribLocation(program, 'aPosition'),
        uScene: gl.getUniformLocation(program, 'uScene'),
        uResolution: gl.getUniformLocation(program, 'uResolution'),
        uTime: gl.getUniformLocation(program, 'uTime')
    }
}

function ensurePostFX() {
    if (!gl || quadBuffer) return

    quadBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
        -1, 1,
        1, -1,
        1, 1
    ]), gl.STATIC_DRAW)

    screenTexture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, screenTexture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
}

function applyShaderSources(vertexSource, fragmentSource) {
    if (!gl) return
    ensurePostFX()
    var nextProgram = buildShaderProgram(vertexSource, fragmentSource)
    if (shaderProgram && shaderProgram.handle) {
        gl.deleteProgram(shaderProgram.handle)
    }
    shaderProgram = nextProgram
    setShaderStatus('GLSL 編譯成功。')
    drawNeeded = true
}

function loadDefaultShaderSources() {
    setEditorValue('viewerVertexShader', defaultVertexShader)
    setEditorValue('viewerFragmentShader', defaultFragmentShader)
    applyShaderSources(defaultVertexShader, defaultFragmentShader)
}

function applyShaderFromEditor() {
    var vertexSource = getEditorValue('viewerVertexShader')
    var fragmentSource = getEditorValue('viewerFragmentShader')
    if (!vertexSource || !fragmentSource) return

    try {
        applyShaderSources(vertexSource, fragmentSource)
    } catch (error) {
        setShaderStatus(String(error && error.message ? error.message : error))
    }
}

function drawPostFX(now) {
    if (!gl || !shaderProgram || !screenTexture || !quadBuffer) return

    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    gl.bindTexture(gl.TEXTURE_2D, screenTexture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)

    gl.useProgram(shaderProgram.handle)
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
    gl.enableVertexAttribArray(shaderProgram.aPosition)
    gl.vertexAttribPointer(shaderProgram.aPosition, 2, gl.FLOAT, false, 0, 0)

    if (shaderProgram.uScene) {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, screenTexture)
        gl.uniform1i(shaderProgram.uScene, 0)
    }
    if (shaderProgram.uResolution) {
        gl.uniform2f(shaderProgram.uResolution, canvas.width, canvas.height)
    }
    if (shaderProgram.uTime) {
        gl.uniform1f(shaderProgram.uTime, now * 0.001)
    }

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
}

function bindCanvas() {
    var nextCanvas = $('view')
    if (!nextCanvas || nextCanvas === canvas) return

    canvas = nextCanvas
    gl = canvas.getContext('webgl', { alpha: false, antialias: true })
    proj = new Projectron(sourceCanvas, size)
    window.p = proj
    quadBuffer = null
    screenTexture = null
    shaderProgram = null
    resizeCanvasSquare()
    ensurePostFX()
    loadDefaultShaderSources()

    if (canvas.dataset.viewerReady !== 'true') {
        canvas.dataset.viewerReady = 'true'
        canvas.addEventListener('mousedown', startDrag)
        canvas.addEventListener('touchstart', startDrag)
    }
}

function bindPanel() {
    var panel = document.querySelector('[data-panel="genviewer"]')
    if (!panel || panel.dataset.viewerPanelReady === 'true') return
    panel.dataset.viewerPanelReady = 'true'

    var input = $('viewModelPlyInput')
    var button = $('loadPlyBtn')
    var applyButton = $('applyViewerShader')
    var resetButton = $('resetViewerShader')

    bindEditor('viewerVertexShader')
    bindEditor('viewerFragmentShader')
    bindShaderFileTools('Vertex', 'viewerVertexShader', 'viewer-vertex.glsl')
    bindShaderFileTools('Fragment', 'viewerFragmentShader', 'viewer-fragment.glsl')

    if (button && input) {
        button.addEventListener('click', () => {
            input.value = ''
            input.click()
        })

        input.addEventListener('change', ev => {
            var file = ev.target.files && ev.target.files[0]
            loadTextFromFile(file, text => {
                if (proj && proj.importPLY(text)) {
                    resetCameraPose()
                    drawNeeded = true
                }
            })
        })
    }

    if (applyButton) {
        applyButton.addEventListener('click', applyShaderFromEditor)
    }

    if (resetButton) {
        resetButton.addEventListener('click', () => {
            loadDefaultShaderSources()
        })
    }
}

function initializeViewerPanel() {
    if (!isViewerPanelActive()) return
    bindCanvas()
    bindPanel()
    resizeCanvasSquare()
    resetCameraPose()
    refreshEditors()
    ensurePostFX()
    if (!shaderProgram) {
        loadDefaultShaderSources()
    }
    drawNeeded = true
}

function render() {
    var now = performance.now()
    var needsTimeRefresh = !!(shaderProgram && shaderProgram.uTime)
    if (isViewerPanelActive() && proj && (drawNeeded || needsTimeRefresh)) {
        proj.draw(-cameraRot[0], -cameraRot[1])
        drawPostFX(now)
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
window.addEventListener('resize', refreshEditors)
window.addEventListener('projectron-panel-change', initializeViewerPanel)

initializeViewerPanel()
requestAnimationFrame(render)
