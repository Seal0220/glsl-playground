import ace from 'ace-builds/src-noconflict/ace'
import 'ace-builds/src-noconflict/mode-glsl'
import 'ace-builds/src-noconflict/theme-monokai'
import 'ace-builds/src-noconflict/ext-language_tools'

var $ = s => document.getElementById(s)
var shaderEditors = {}

var canvas = $('shaderView')
var gl = canvas ? canvas.getContext('webgl', { alpha: false, antialias: true }) : null
var quadBuffer = null
var shaderProgram = null
var fallbackTexture = null

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
    'uniform vec2 uResolution;',
    'uniform float uTime;',
    'varying vec2 vUv;',
    '',
    'void main() {',
    '    vec2 st = gl_FragCoord.xy/uResolution.xy;',
    '    st.x *= uResolution.x/uResolution.y;',
    '    vec3 color = vec3(0.);',
    '    color = vec3(st.x,st.y,abs(sin(uTime)));',
    '    gl_FragColor = vec4(color,1.0);',
    '}'
].join('\n')

function getActivePanel() {
    return window.__projectronActivePanel || 'gensolo'
}

function isEditorPanelActive() {
    return getActivePanel() === 'glsleditor'
}

function resizeCanvasSquare() {
    if (!canvas) return
    var width = canvas.clientWidth || 512
    var side = Math.max(240, Math.floor(width))
    if (canvas.width !== side || canvas.height !== side) {
        canvas.width = side
        canvas.height = side
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
    var status = $('shaderEditorShaderStatus')
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
    var importButton = $('importShaderEditor' + kind + 'Shader')
    var saveButton = $('saveShaderEditor' + kind + 'Shader')
    var fileInput = $('shaderEditor' + kind + 'ShaderFile')

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

function ensureRenderer() {
    if (!gl || quadBuffer) return

    quadBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
        -1, 1,
        1, -1,
        1, 1
    ]), gl.STATIC_DRAW)

    fallbackTexture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, fallbackTexture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 0, 255])
    )
}

function applyShaderSources(vertexSource, fragmentSource) {
    if (!gl) return
    ensureRenderer()
    var nextProgram = buildShaderProgram(vertexSource, fragmentSource)
    if (shaderProgram && shaderProgram.handle) {
        gl.deleteProgram(shaderProgram.handle)
    }
    shaderProgram = nextProgram
    setShaderStatus('GLSL 編譯成功。')
}

function loadDefaultShaderSources() {
    setEditorValue('shaderEditorVertexShader', defaultVertexShader)
    setEditorValue('shaderEditorFragmentShader', defaultFragmentShader)
    applyShaderSources(defaultVertexShader, defaultFragmentShader)
}

function applyShaderFromEditor() {
    var vertexSource = getEditorValue('shaderEditorVertexShader')
    var fragmentSource = getEditorValue('shaderEditorFragmentShader')
    if (!vertexSource || !fragmentSource) return

    try {
        applyShaderSources(vertexSource, fragmentSource)
    } catch (error) {
        setShaderStatus(String(error && error.message ? error.message : error))
    }
}

function draw(now) {
    if (!gl || !shaderProgram || !quadBuffer) return

    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    gl.useProgram(shaderProgram.handle)
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
    gl.enableVertexAttribArray(shaderProgram.aPosition)
    gl.vertexAttribPointer(shaderProgram.aPosition, 2, gl.FLOAT, false, 0, 0)

    if (shaderProgram.uScene) {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, fallbackTexture)
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
    var nextCanvas = $('shaderView')
    if (!nextCanvas || nextCanvas === canvas) return
    canvas = nextCanvas
    gl = canvas.getContext('webgl', { alpha: false, antialias: true })
    quadBuffer = null
    shaderProgram = null
    fallbackTexture = null
    resizeCanvasSquare()
    ensureRenderer()
    loadDefaultShaderSources()
}

function bindPanel() {
    var panel = document.querySelector('[data-panel="glsleditor"]')
    if (!panel || panel.dataset.shaderEditorPanelReady === 'true') return
    panel.dataset.shaderEditorPanelReady = 'true'

    var applyButton = $('applyShaderEditorShader')
    var resetButton = $('resetShaderEditorShader')

    bindEditor('shaderEditorVertexShader')
    bindEditor('shaderEditorFragmentShader')
    bindShaderFileTools('Vertex', 'shaderEditorVertexShader', 'shader-editor-vertex.glsl')
    bindShaderFileTools('Fragment', 'shaderEditorFragmentShader', 'shader-editor-fragment.glsl')

    if (applyButton) {
        applyButton.addEventListener('click', applyShaderFromEditor)
    }

    if (resetButton) {
        resetButton.addEventListener('click', loadDefaultShaderSources)
    }
}

function initializeEditorPanel() {
    if (!isEditorPanelActive()) return
    bindCanvas()
    bindPanel()
    resizeCanvasSquare()
    refreshEditors()
    ensureRenderer()
    if (!shaderProgram) {
        loadDefaultShaderSources()
    }
}

function render() {
    if (isEditorPanelActive() && gl) {
        draw(performance.now())
    }
    requestAnimationFrame(render)
}

window.addEventListener('resize', resizeCanvasSquare)
window.addEventListener('resize', refreshEditors)
window.addEventListener('projectron-panel-change', initializeEditorPanel)

initializeEditorPanel()
requestAnimationFrame(render)
