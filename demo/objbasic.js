import ace from 'ace-builds/src-noconflict/ace'
import 'ace-builds/src-noconflict/mode-glsl'
import 'ace-builds/src-noconflict/theme-monokai'
import 'ace-builds/src-noconflict/ext-language_tools'

var runtimeScriptLoads = {}
var objbasicScene = null
var objbasicStats = null
var objbasicCanvas = null
var objbasicShaderEditors = {}
var objbasicDefaultVertexSource = ''
var objbasicDefaultFragmentSource = ''
var objbasicActiveVertexSource = ''
var objbasicActiveFragmentSource = ''
var objbasicDefaultShaderSourcesLoad = null

var objbasicUniforms = {
    u_ior: 3.18,
    u_reflectionStrength: 0.25,
    u_refractionStrength: 0.95,
    u_dispersion: 0.06,
    u_fresnelStrength: 1.35,
    u_ambientStrength: 0.18,
    u_diffuseStrength: 0.87,
    u_specularStrength: 5.2,
    u_shininess: 120.0,
    u_fillLightStrength: 0.75,
    u_backLightStrength: 0.68,
    u_shadowStrength: 3.55,
    u_contactShadowStrength: 0.38,
    u_rimStrength: 0.22,
}

var objbasicMeshPath = 'data/bagel_seal_atlas.obj'
var objbasicTexturePath = 'data/bagel_seal_atlas.png'
var objbasicWorkpath = 'assets/external/objbasic'
var objbasicShaderCombinedUrl = objbasicWorkpath + '/30_ObjBasic.glsl'

function getActivePanelNode() {
    return document.querySelector('[data-panel="objbasic"]')
}

function $(id) {
    var panel = getActivePanelNode()
    if (panel) {
        var scoped = panel.querySelector('#' + id)
        if (scoped) return scoped
    }
    return document.getElementById(id)
}

function getActivePanel() {
    return window.__projectronActivePanel || 'gensolo'
}

function isObjbasicPanelActive() {
    return getActivePanel() === 'objbasic'
}

function setStatus(text) {
    var status = $('objbasicStatus')
    if (status) status.textContent = text
}

function setEditorStatus(text) {
    var status = $('objbasicShaderStatus')
    if (status) status.textContent = text
}

function formatError(error) {
    if (!error) return '未知錯誤'
    if (typeof error === 'string') return error
    if (error.message) return error.message
    try {
        return JSON.stringify(error)
    } catch (jsonError) {
        return String(error)
    }
}

function loadScriptOnce(src, globalName) {
    if (globalName && window[globalName]) {
        return Promise.resolve(window[globalName])
    }

    if (runtimeScriptLoads[src]) {
        return runtimeScriptLoads[src]
    }

    runtimeScriptLoads[src] = new Promise(function (resolve, reject) {
        var existing = document.querySelector('script[data-runtime-src="' + src + '"]')
        if (existing) {
            existing.addEventListener('load', function () {
                resolve(globalName ? window[globalName] : true)
            }, { once: true })
            existing.addEventListener('error', function () {
                delete runtimeScriptLoads[src]
                reject(new Error('Failed to load script: ' + src))
            }, { once: true })
            return
        }

        var script = document.createElement('script')
        script.src = src
        script.async = true
        script.dataset.runtimeSrc = src
        script.onload = function () {
            resolve(globalName ? window[globalName] : true)
        }
        script.onerror = function () {
            delete runtimeScriptLoads[src]
            reject(new Error('Failed to load script: ' + src))
        }
        document.body.appendChild(script)
    })

    return runtimeScriptLoads[src]
}

function ensureLibraries() {
    return Promise.all([
        loadScriptOnce(objbasicWorkpath + '/dist/stats.min.js', 'Stats'),
        loadScriptOnce(objbasicWorkpath + '/dist/glsl-canvas.min.js', 'glsl')
    ])
}

function loadTextFromFile(file, onLoad) {
    if (!file) return
    var reader = new FileReader()
    reader.onloadend = function (event) {
        onLoad(event.target.result || '')
    }
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
    setTimeout(function () {
        URL.revokeObjectURL(url)
    }, 0)
}

function splitCombinedShaderSource(source) {
    var vertexMarker = '#if defined(VERTEX)'
    var fragmentMarker = '#else // fragment shader'
    var endMarker = '#endif'

    var vertexMarkerIndex = source.indexOf(vertexMarker)
    var fragmentMarkerIndex = source.indexOf(fragmentMarker)
    var endMarkerIndex = source.lastIndexOf(endMarker)

    if (vertexMarkerIndex === -1 || fragmentMarkerIndex === -1 || endMarkerIndex === -1) {
        throw new Error('ObjBasic GLSL 結構無法拆分成 vertex / fragment')
    }

    var sharedPreamble = source.slice(0, vertexMarkerIndex).trim()
    var vertexBody = source.slice(vertexMarkerIndex + vertexMarker.length, fragmentMarkerIndex).trim()
    var fragmentBody = source.slice(fragmentMarkerIndex + fragmentMarker.length, endMarkerIndex).trim()

    return {
        vertex: [sharedPreamble, vertexBody].filter(Boolean).join('\n\n'),
        fragment: [sharedPreamble, fragmentBody].filter(Boolean).join('\n\n')
    }
}

function ensureDefaultShaderSources() {
    if (objbasicDefaultShaderSourcesLoad) {
        return objbasicDefaultShaderSourcesLoad
    }

    objbasicDefaultShaderSourcesLoad = fetch(objbasicShaderCombinedUrl)
        .then(function (response) {
            if (!response.ok) {
                throw new Error('Failed to load ObjBasic GLSL source')
            }
            return response.text()
        })
        .then(function (source) {
            var split = splitCombinedShaderSource(source)
            objbasicDefaultVertexSource = split.vertex
            objbasicDefaultFragmentSource = split.fragment

            if (!objbasicActiveVertexSource) {
                objbasicActiveVertexSource = split.vertex
            }

            if (!objbasicActiveFragmentSource) {
                objbasicActiveFragmentSource = split.fragment
            }

            return split
        })
        .catch(function (error) {
            setEditorStatus('ObjBasic GLSL 載入失敗：' + formatError(error))
            throw error
        })

    return objbasicDefaultShaderSourcesLoad
}

function getEditorValue(id) {
    var editor = objbasicShaderEditors[id]
    return editor ? editor.getValue() : ''
}

function setEditorValue(id, value) {
    var editor = objbasicShaderEditors[id]
    if (editor) editor.setValue(value, -1)
}

function refreshEditors() {
    Object.keys(objbasicShaderEditors).forEach(function (id) {
        var editor = objbasicShaderEditors[id]
        if (!editor) return
        editor.resize(true)
        editor.renderer.updateFull()
    })
}

function bindShaderEditor(id) {
    var node = $(id)
    if (!node || objbasicShaderEditors[id]) return

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
        name: 'applyObjbasicShader',
        bindKey: { win: 'Ctrl-Enter', mac: 'Command-Enter' },
        exec: function () {
            applyEditorShaders()
        }
    })

    objbasicShaderEditors[id] = editor
    editor.resize(true)
}

function syncEditorsWithActiveSources() {
    if (objbasicActiveVertexSource && !getEditorValue('objbasicVertexShader')) {
        setEditorValue('objbasicVertexShader', objbasicActiveVertexSource)
    }

    if (objbasicActiveFragmentSource && !getEditorValue('objbasicFragmentShader')) {
        setEditorValue('objbasicFragmentShader', objbasicActiveFragmentSource)
    }
}

function bindShaderFileTools(kind, editorId, defaultFilename) {
    var importButton = $('importObjbasic' + kind + 'Shader')
    var saveButton = $('saveObjbasic' + kind + 'Shader')
    var fileInput = $('objbasic' + kind + 'ShaderFile')

    if (importButton && fileInput && importButton.dataset.fileToolReady !== 'true') {
        importButton.dataset.fileToolReady = 'true'
        importButton.addEventListener('click', function () {
            fileInput.value = ''
            fileInput.click()
        })

        fileInput.addEventListener('change', function (event) {
            var file = event.target.files && event.target.files[0]
            loadTextFromFile(file, function (text) {
                setEditorValue(editorId, text)
                setEditorStatus(kind + ' Shader 已匯入，按下「套用 GLSL」即可重新編譯。')
            })
        })
    }

    if (saveButton && saveButton.dataset.fileToolReady !== 'true') {
        saveButton.dataset.fileToolReady = 'true'
        saveButton.addEventListener('click', function () {
            saveTextFile(defaultFilename, getEditorValue(editorId))
        })
    }
}

function syncCanvasShaderSources() {
    var canvas = $('objbasicView')
    if (!canvas) return

    if (objbasicActiveVertexSource && objbasicActiveFragmentSource) {
        canvas.setAttribute('data-vertex', objbasicActiveVertexSource)
        canvas.setAttribute('data-fragment', objbasicActiveFragmentSource)
        canvas.removeAttribute('data-vertex-url')
        canvas.removeAttribute('data-fragment-url')
        return
    }

    canvas.removeAttribute('data-vertex')
    canvas.removeAttribute('data-fragment')
    canvas.removeAttribute('data-vertex-url')
    canvas.setAttribute('data-fragment-url', '30_ObjBasic.glsl')
}

function ensureStats() {
    var dock = $('objbasicStatsDock')
    if (!dock || !window.Stats) return

    if (!objbasicStats) {
        objbasicStats = new window.Stats()
        objbasicStats.showPanel(0)
    }

    var dom = objbasicStats.dom || objbasicStats.domElement
    if (!dom) return

    dom.style.position = 'absolute'
    dom.style.top = '12px'
    dom.style.left = '12px'
    dom.style.zIndex = '5'
    dock.replaceChildren(dom)
}

function destroyScene() {
    if (objbasicScene && typeof objbasicScene.destroy === 'function') {
        objbasicScene.destroy()
    }
    objbasicScene = null
    objbasicCanvas = null
}

function preventPageScrollOnCanvas(event) {
    if (!isObjbasicPanelActive()) return
    event.preventDefault()
    event.stopPropagation()
}

function bindCanvasInteractions() {
    var canvas = $('objbasicView')
    if (!canvas || canvas.dataset.objbasicInteractionReady === 'true') return

    canvas.dataset.objbasicInteractionReady = 'true'
    canvas.addEventListener('wheel', preventPageScrollOnCanvas, { passive: false })
}

function resizeCanvas() {
    var canvas = $('objbasicView')
    if (!canvas) return

    var width = canvas.clientWidth || 800
    var height = canvas.clientHeight || 720
    var dpr = window.devicePixelRatio || 1

    var pixelWidth = Math.max(1, Math.floor(width * dpr))
    var pixelHeight = Math.max(1, Math.floor(height * dpr))

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth
        canvas.height = pixelHeight
    }
}

function applySceneUniforms() {
    if (!objbasicScene) return

    objbasicScene.setUniforms(objbasicUniforms)
    objbasicScene.setTexture('u_tex0', objbasicTexturePath)
}

function syncEditorStatusAfterLoad() {
    if (!objbasicDefaultVertexSource || !objbasicDefaultFragmentSource) {
        setEditorStatus('ObjBasic GLSL 已載入。')
        return
    }

    var usingDefaultVertex = objbasicActiveVertexSource === objbasicDefaultVertexSource
    var usingDefaultFragment = objbasicActiveFragmentSource === objbasicDefaultFragmentSource

    if (usingDefaultVertex && usingDefaultFragment) {
        setEditorStatus('目前使用預設 ObjBasic vertex / fragment GLSL。')
        return
    }

    setEditorStatus('ObjBasic vertex / fragment GLSL 已套用。')
}

function createScene(forceRecreate) {
    var canvas = $('objbasicView')
    if (!canvas || !window.glsl || !window.glsl.Canvas) return

    if (objbasicScene && objbasicCanvas === canvas && !forceRecreate) {
        if (typeof objbasicScene.play === 'function') objbasicScene.play()
        setStatus('ObjBasic 已載入。')
        return
    }

    destroyScene()
    resizeCanvas()
    ensureStats()
    syncCanvasShaderSources()

    objbasicCanvas = canvas
    setStatus('ObjBasic 載入中...')

    objbasicScene = new window.glsl.Canvas(canvas, {
        workpath: objbasicWorkpath,
        backgroundColor: 'rgba(0.0, 0.0, 0.0, 1.0)',
        alpha: true,
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
        mode: 'mesh',
        mesh: objbasicMeshPath,
        extensions: ['OES_standard_derivatives'],
        doubleSided: true,
    })

    window.objbasicScene = objbasicScene

    if (objbasicStats && typeof objbasicStats.begin === 'function') {
        objbasicStats.begin()
    }

    objbasicScene.on('load', function () {
        applySceneUniforms()
        setStatus('ObjBasic 已載入。')
        syncEditorStatusAfterLoad()
    })

    objbasicScene.on('render', function () {
        if (!objbasicStats) return
        objbasicStats.end()
        objbasicStats.begin()
    })

    objbasicScene.on('error', function (error) {
        var message = formatError(error)
        setStatus('ObjBasic Shader / WebGL 錯誤：' + message)
        setEditorStatus('ObjBasic vertex / fragment GLSL 編譯失敗：' + message)
    })

    objbasicScene.on('textureError', function (info) {
        var detail = info && info.message ? info.message : formatError(info)
        setStatus('ObjBasic 貼圖載入失敗：' + detail)
    })
}

function applyEditorShaders() {
    var vertexSource = getEditorValue('objbasicVertexShader')
    var fragmentSource = getEditorValue('objbasicFragmentShader')
    if (!vertexSource || !fragmentSource) return

    objbasicActiveVertexSource = vertexSource
    objbasicActiveFragmentSource = fragmentSource
    setEditorStatus('ObjBasic GLSL 套用中...')
    initializeObjbasicPanel(true)
}

function resetEditorShaders() {
    ensureDefaultShaderSources()
        .then(function () {
            objbasicActiveVertexSource = objbasicDefaultVertexSource
            objbasicActiveFragmentSource = objbasicDefaultFragmentSource
            setEditorValue('objbasicVertexShader', objbasicDefaultVertexSource)
            setEditorValue('objbasicFragmentShader', objbasicDefaultFragmentSource)
            setEditorStatus('ObjBasic GLSL 已重設，重新編譯中...')
            initializeObjbasicPanel(true)
        })
        .catch(function () {})
}

function bindPanel() {
    var panel = getActivePanelNode()
    if (!panel || panel.dataset.objbasicPanelReady === 'true') return
    panel.dataset.objbasicPanelReady = 'true'

    bindCanvasInteractions()
    bindShaderEditor('objbasicVertexShader')
    bindShaderEditor('objbasicFragmentShader')
    bindShaderFileTools('Vertex', 'objbasicVertexShader', 'objbasic-vertex.glsl')
    bindShaderFileTools('Fragment', 'objbasicFragmentShader', 'objbasic-fragment.glsl')

    var applyButton = $('applyObjbasicShader')
    if (applyButton && applyButton.dataset.objbasicShaderReady !== 'true') {
        applyButton.dataset.objbasicShaderReady = 'true'
        applyButton.addEventListener('click', applyEditorShaders)
    }

    var resetButton = $('resetObjbasicShader')
    if (resetButton && resetButton.dataset.objbasicShaderReady !== 'true') {
        resetButton.dataset.objbasicShaderReady = 'true'
        resetButton.addEventListener('click', resetEditorShaders)
    }

    var reloadButton = $('objbasicReload')
    if (reloadButton && reloadButton.dataset.objbasicShaderReady !== 'true') {
        reloadButton.dataset.objbasicShaderReady = 'true'
        reloadButton.addEventListener('click', function () {
            initializeObjbasicPanel(true)
        })
    }

    ensureDefaultShaderSources()
        .then(function () {
            syncEditorsWithActiveSources()
            refreshEditors()
            syncEditorStatusAfterLoad()
        })
        .catch(function () {})
}

function initializeObjbasicPanel(forceRecreate) {
    if (!isObjbasicPanelActive()) {
        destroyScene()
        return
    }

    bindPanel()
    resizeCanvas()
    refreshEditors()
    setStatus('ObjBasic runtime 載入中...')

    Promise.all([
        ensureLibraries(),
        ensureDefaultShaderSources()
    ])
        .then(function () {
            if (!isObjbasicPanelActive()) return
            syncEditorsWithActiveSources()
            createScene(!!forceRecreate)
        })
        .catch(function (error) {
            setStatus('ObjBasic runtime 載入失敗：' + formatError(error))
        })
}

window.addEventListener('resize', function () {
    if (!isObjbasicPanelActive()) return
    resizeCanvas()
    refreshEditors()
})

window.addEventListener('projectron-panel-change', function () {
    initializeObjbasicPanel(false)
})

initializeObjbasicPanel(false)
