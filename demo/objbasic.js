import ace from 'ace-builds/src-noconflict/ace'
import 'ace-builds/src-noconflict/mode-glsl'
import 'ace-builds/src-noconflict/theme-monokai'
import 'ace-builds/src-noconflict/ext-language_tools'

var runtimeScriptLoads = {}
var objbasicScene = null
var objbasicStats = null
var objbasicCanvas = null
var objbasicShaderEditors = {}
var objbasicModeStates = {}
var objbasicCurrentMode = 'default'
var objbasicModeSwitchToken = 0
var objbasicInitToken = 0
var objbasicSyncingEditors = false
var objbasicHdriOffsetX = 0
var objbasicHdriOffsetY = 0
var objbasicHdriDragActive = false
var objbasicHdriPointerId = null
var objbasicHdriLastX = 0
var objbasicHdriLastY = 0
var objbasicHdriListenersReady = false

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
var objbasicNormalPath = 'data/bagel_seal_atlas_normal.png'
var objbasicRoughnessPath = 'data/bagel_seal_atlas_metallicRoughness.png'
var objbasicEnvMapPath = 'assets/images/seal-world-hdri.png'
var objbasicWorkpath = 'assets/external/objbasic'
var objbasicHdriAspect = 2816 / 1536

var objbasicModes = {
    default: {
        label: '預設',
        description: '標準打光，保留模型原始材質與形體。',
        vertexUrl: 'shaders/objbasic-standard.vert.glsl',
        fragmentUrl: 'shaders/objbasic-standard.frag.glsl'
    },
    fantasy: {
        label: 'Fantasy',
        description: '夢幻的橘藍海豹！！！。',
        vertexUrl: 'shaders/objbasic-fantasy.vert.glsl',
        fragmentUrl: 'shaders/objbasic-fantasy.frag.glsl'
    },
    aluminum: {
        label: 'Aluminum',
        description: '帶有些微材質起伏的鋁金屬反射。',
        vertexUrl: 'shaders/objbasic-mirror.vert.glsl',
        fragmentUrl: 'shaders/objbasic-mirror.frag.glsl'
    },
    mirror: {
        label: 'Mirror',
        description: '完全光滑的全反射鏡面。',
        vertexUrl: 'shaders/objbasic-perfect-mirror.vert.glsl',
        fragmentUrl: 'shaders/objbasic-perfect-mirror.frag.glsl'
    },
    bubble: {
        label: 'Bubble',
        description: '帶有虹彩邊緣與表面起伏的泡泡透明材質。',
        vertexUrl: 'shaders/objbasic-bubble.vert.glsl',
        fragmentUrl: 'shaders/objbasic-bubble.frag.glsl'
    },
    glass: {
        label: 'Glass',
        description: '全光滑的透明玻璃樣式。',
        vertexUrl: 'shaders/objbasic-glass.vert.glsl',
        fragmentUrl: 'shaders/objbasic-glass.frag.glsl'
    },
    fake2d: {
        label: 'Fake 2D',
        description: '只保留亮 / 中 / 暗與高光。',
        vertexUrl: 'shaders/objbasic-fake2d.vert.glsl',
        fragmentUrl: 'shaders/objbasic-fake2d.frag.glsl'
    },
    toon: {
        label: 'Toon Shading',
        description: '卡通樣式，分層較多立體感較強。',
        vertexUrl: 'shaders/objbasic-toon.vert.glsl',
        fragmentUrl: 'shaders/objbasic-toon.frag.glsl'
    },
    gooch: {
        label: 'Gooch Shading',
        description: '單色的技術插畫風格。',
        vertexUrl: 'shaders/objbasic-gooch.vert.glsl',
        fragmentUrl: 'shaders/objbasic-gooch.frag.glsl'
    },
    phong: {
        label: 'Phong Shading',
        description: '經典光照模型。',
        vertexUrl: 'shaders/objbasic-phong.vert.glsl',
        fragmentUrl: 'shaders/objbasic-phong.frag.glsl'
    },
    pbr: {
        label: 'PBR',
        description: '以金屬與粗糙的仿物理式材質表現。',
        vertexUrl: 'shaders/objbasic-pbr.vert.glsl',
        fragmentUrl: 'shaders/objbasic-pbr.frag.glsl'
    },
    clay: {
        label: 'Clay',
        description: '霧面黏土樣式。',
        vertexUrl: 'shaders/objbasic-clay.vert.glsl',
        fragmentUrl: 'shaders/objbasic-clay.frag.glsl'
    },
    xray: {
        label: 'X-Ray',
        description: '帶有透視與冷光掃描的 X 光風格。',
        vertexUrl: 'shaders/objbasic-xray.vert.glsl',
        fragmentUrl: 'shaders/objbasic-xray.frag.glsl'
    }
}

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

function getModeConfig(mode) {
    return objbasicModes[mode] || objbasicModes.default
}

function getModeState(mode) {
    if (!objbasicModeStates[mode]) {
        objbasicModeStates[mode] = {
            defaultVertexSource: '',
            defaultFragmentSource: '',
            activeVertexSource: '',
            activeFragmentSource: '',
            draftVertexSource: '',
            draftFragmentSource: '',
            loadPromise: null
        }
    }

    return objbasicModeStates[mode]
}

function getCurrentModeConfig() {
    return getModeConfig(objbasicCurrentMode)
}

function getCurrentModeState() {
    return getModeState(objbasicCurrentMode)
}

function modeHasPendingChanges(state) {
    return !!state && (
        state.draftVertexSource !== state.activeVertexSource ||
        state.draftFragmentSource !== state.activeFragmentSource
    )
}

function modeIsDefault(state) {
    return !!state && (
        state.activeVertexSource === state.defaultVertexSource &&
        state.activeFragmentSource === state.defaultFragmentSource
    )
}

function buildShaderSaveFilename(mode, kind) {
    return 'objbasic-' + mode + '.' + (kind === 'vertex' ? 'vert' : 'frag') + '.glsl'
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

function updateModeUI() {
    var config = getCurrentModeConfig()
    var description = $('objbasicModeDescription')
    var heading = $('objbasicModeHeading')

    if (description) description.textContent = config.description
    if (heading) heading.textContent = config.label
}

function syncEditorStatus() {
    var config = getCurrentModeConfig()
    var state = getCurrentModeState()

    if (!state.defaultVertexSource || !state.defaultFragmentSource) {
        setEditorStatus(config.label + ' GLSL 載入中...')
        return
    }

    if (modeHasPendingChanges(state)) {
        setEditorStatus(config.label + ' 模式有未套用的 GLSL 修改。')
        return
    }

    if (modeIsDefault(state)) {
        setEditorStatus('目前使用 ' + config.label + ' 的預設 GLSL。')
        return
    }

    setEditorStatus(config.label + ' 模式已套用自訂 GLSL。')
}

function fetchText(url, errorLabel) {
    return fetch(url)
        .then(function (response) {
            if (!response.ok) {
                throw new Error(errorLabel)
            }
            return response.text()
        })
}

function ensureModeSources(mode) {
    var config = getModeConfig(mode)
    var state = getModeState(mode)

    if (state.loadPromise) {
        return state.loadPromise
    }

    state.loadPromise = Promise.all([
        fetchText(objbasicWorkpath + '/' + config.vertexUrl, 'Failed to load ' + config.label + ' vertex shader'),
        fetchText(objbasicWorkpath + '/' + config.fragmentUrl, 'Failed to load ' + config.label + ' fragment shader')
    ])
        .then(function (sources) {
            state.defaultVertexSource = sources[0]
            state.defaultFragmentSource = sources[1]

            if (!state.activeVertexSource) state.activeVertexSource = sources[0]
            if (!state.activeFragmentSource) state.activeFragmentSource = sources[1]
            if (!state.draftVertexSource) state.draftVertexSource = state.activeVertexSource
            if (!state.draftFragmentSource) state.draftFragmentSource = state.activeFragmentSource

            return state
        })
        .catch(function (error) {
            state.loadPromise = null
            throw error
        })

    return state.loadPromise
}

function ensureCurrentModeSources() {
    return ensureModeSources(objbasicCurrentMode)
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

function syncEditorsForCurrentMode() {
    var state = getCurrentModeState()

    objbasicSyncingEditors = true
    setEditorValue('objbasicVertexShader', state.draftVertexSource || state.activeVertexSource || state.defaultVertexSource)
    setEditorValue('objbasicFragmentShader', state.draftFragmentSource || state.activeFragmentSource || state.defaultFragmentSource)
    objbasicSyncingEditors = false
    syncEditorStatus()
}

function bindShaderEditor(id, kind) {
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
    editor.session.on('change', function () {
        if (objbasicSyncingEditors) return

        var state = getCurrentModeState()
        if (!state) return

        if (kind === 'vertex') state.draftVertexSource = editor.getValue()
        else state.draftFragmentSource = editor.getValue()

        syncEditorStatus()
    })

    objbasicShaderEditors[id] = editor
    editor.resize(true)
}

function bindShaderFileTools(kind, editorId) {
    var titleKind = kind === 'vertex' ? 'Vertex' : 'Fragment'
    var importButton = $('importObjbasic' + titleKind + 'Shader')
    var saveButton = $('saveObjbasic' + titleKind + 'Shader')
    var fileInput = $('objbasic' + titleKind + 'ShaderFile')

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
                var state = getCurrentModeState()
                if (!state) return
                if (kind === 'vertex') state.draftVertexSource = text
                else state.draftFragmentSource = text
                setEditorStatus(getCurrentModeConfig().label + ' 模式的 ' + titleKind + ' Shader 已匯入。')
            })
        })
    }

    if (saveButton && saveButton.dataset.fileToolReady !== 'true') {
        saveButton.dataset.fileToolReady = 'true'
        saveButton.addEventListener('click', function () {
            saveTextFile(buildShaderSaveFilename(objbasicCurrentMode, kind), getEditorValue(editorId))
        })
    }
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

function getObjbasicFrameWrap() {
    var canvas = $('objbasicView')
    return canvas ? canvas.parentElement : null
}

function syncHdriBackdrop() {
    var wrap = getObjbasicFrameWrap()
    if (!wrap) return

    wrap.style.setProperty('--objbasic-hdri-x', objbasicHdriOffsetX + 'px')
    wrap.style.setProperty('--objbasic-hdri-y', objbasicHdriOffsetY + 'px')
}

function getHdriUniformOffset() {
    var wrap = getObjbasicFrameWrap()
    if (!wrap) return [0, 0]

    var bgHeight = wrap.clientHeight * 1.36
    var bgWidth = bgHeight * objbasicHdriAspect
    var offsetX = bgWidth > 0 ? objbasicHdriOffsetX / bgWidth : 0
    var offsetY = bgHeight > 0 ? objbasicHdriOffsetY / bgHeight : 0

    return [offsetX, offsetY]
}

function syncEnvironmentUniform() {
    if (!objbasicScene) return

    var envOffset = getHdriUniformOffset()
    objbasicScene.setUniform('u_envOffset', envOffset[0], envOffset[1])
}

function getHdriMaxOffsetY() {
    var wrap = getObjbasicFrameWrap()
    if (!wrap) return 72

    return Math.max(32, Math.floor(wrap.clientHeight * 0.15))
}

function beginHdriDrag(event) {
    if (!isObjbasicPanelActive()) return
    if (event.pointerType !== 'touch' && event.button !== 0) return

    objbasicHdriDragActive = true
    objbasicHdriPointerId = event.pointerId
    objbasicHdriLastX = event.clientX
    objbasicHdriLastY = event.clientY
}

function updateHdriDrag(event) {
    if (!objbasicHdriDragActive) return
    if (objbasicHdriPointerId !== null && event.pointerId !== objbasicHdriPointerId) return

    var dx = event.clientX - objbasicHdriLastX
    var dy = event.clientY - objbasicHdriLastY

    objbasicHdriLastX = event.clientX
    objbasicHdriLastY = event.clientY

    objbasicHdriOffsetX -= dx * 1.35
    objbasicHdriOffsetY = Math.max(
        -getHdriMaxOffsetY(),
        Math.min(getHdriMaxOffsetY(), objbasicHdriOffsetY - dy * 0.65)
    )
    syncHdriBackdrop()
    syncEnvironmentUniform()
}

function endHdriDrag(event) {
    if (!objbasicHdriDragActive) return
    if (event && objbasicHdriPointerId !== null && event.pointerId !== objbasicHdriPointerId) return

    objbasicHdriDragActive = false
    objbasicHdriPointerId = null
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
    canvas.addEventListener('pointerdown', beginHdriDrag)

    if (!objbasicHdriListenersReady) {
        objbasicHdriListenersReady = true
        window.addEventListener('pointermove', updateHdriDrag)
        window.addEventListener('pointerup', endHdriDrag)
        window.addEventListener('pointercancel', endHdriDrag)
    }

    syncHdriBackdrop()
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

function syncCanvasShaderSources() {
    var canvas = $('objbasicView')
    var state = getCurrentModeState()
    if (!canvas || !state) return

    canvas.setAttribute('data-vertex', state.activeVertexSource)
    canvas.setAttribute('data-fragment', state.activeFragmentSource)
    canvas.removeAttribute('data-vertex-url')
    canvas.removeAttribute('data-fragment-url')
}

function applySceneTextures() {
    if (!objbasicScene) return

    objbasicScene.setTexture('u_tex0', objbasicTexturePath)
    objbasicScene.setTexture('u_texNormal', objbasicNormalPath)
    objbasicScene.setTexture('u_texRoughness', objbasicRoughnessPath)
    objbasicScene.setTexture('u_envMap', objbasicEnvMapPath)
}

function applySceneUniforms() {
    if (!objbasicScene) return
    objbasicScene.setUniforms(objbasicUniforms)
    applySceneTextures()
    syncEnvironmentUniform()
}

function createScene(forceRecreate) {
    var canvas = $('objbasicView')
    if (!canvas || !window.glsl || !window.glsl.Canvas) return

    if (objbasicScene && objbasicCanvas === canvas && !forceRecreate) {
        if (typeof objbasicScene.play === 'function') objbasicScene.play()
        setStatus(getCurrentModeConfig().label + ' 模式已載入。')
        return
    }

    destroyScene()
    resizeCanvas()
    ensureStats()
    syncCanvasShaderSources()

    objbasicCanvas = canvas
    setStatus(getCurrentModeConfig().label + ' 模式載入中...')

    objbasicScene = new window.glsl.Canvas(canvas, {
        workpath: objbasicWorkpath,
        backgroundColor: 'rgba(0.0, 0.0, 0.0, 0.0)',
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
        setStatus(getCurrentModeConfig().label + ' 模式已載入。')
        syncEditorStatus()
    })

    objbasicScene.on('render', function () {
        if (!objbasicStats) return
        objbasicStats.end()
        objbasicStats.begin()
    })

    objbasicScene.on('error', function (error) {
        var message = formatError(error)
        setStatus(getCurrentModeConfig().label + ' Shader / WebGL 錯誤：' + message)
        setEditorStatus(getCurrentModeConfig().label + ' 模式編譯失敗：' + message)
    })

    objbasicScene.on('textureError', function (info) {
        var detail = info && info.message ? info.message : formatError(info)
        setStatus(getCurrentModeConfig().label + ' 貼圖載入失敗：' + detail)
    })
}

function applyEditorShaders() {
    var state = getCurrentModeState()
    if (!state) return

    state.activeVertexSource = state.draftVertexSource || getEditorValue('objbasicVertexShader')
    state.activeFragmentSource = state.draftFragmentSource || getEditorValue('objbasicFragmentShader')
    setEditorStatus(getCurrentModeConfig().label + ' 模式 GLSL 套用中...')
    initializeObjbasicPanel(true)
}

function resetEditorShaders() {
    ensureCurrentModeSources()
        .then(function () {
            var state = getCurrentModeState()
            state.activeVertexSource = state.defaultVertexSource
            state.activeFragmentSource = state.defaultFragmentSource
            state.draftVertexSource = state.defaultVertexSource
            state.draftFragmentSource = state.defaultFragmentSource
            syncEditorsForCurrentMode()
            setEditorStatus(getCurrentModeConfig().label + ' 模式 GLSL 已重設，重新編譯中...')
            initializeObjbasicPanel(true)
        })
        .catch(function (error) {
            setEditorStatus('重設失敗：' + formatError(error))
        })
}

function handleModeChange(nextMode) {
    if (!objbasicModes[nextMode] || nextMode === objbasicCurrentMode) return

    var token = ++objbasicModeSwitchToken
    setStatus(getModeConfig(nextMode).label + ' 模式切換中...')
    setEditorStatus(getModeConfig(nextMode).label + ' GLSL 載入中...')

    ensureModeSources(nextMode)
        .then(function () {
            if (token !== objbasicModeSwitchToken) return

            objbasicCurrentMode = nextMode
            updateModeUI()
            syncEditorsForCurrentMode()
            refreshEditors()

            if (isObjbasicPanelActive()) {
                initializeObjbasicPanel(true)
            }
        })
        .catch(function (error) {
            if (token !== objbasicModeSwitchToken) return
            setStatus('模式切換失敗：' + formatError(error))
            setEditorStatus('模式切換失敗：' + formatError(error))
        })
}

function bindModeSelector() {
    var select = $('objbasicModeSelect')
    if (!select || select.dataset.modeReady === 'true') return

    select.dataset.modeReady = 'true'
    select.value = objbasicCurrentMode
    select.addEventListener('change', function (event) {
        handleModeChange(event.target.value)
    })
}

function bindPanel() {
    var panel = getActivePanelNode()
    if (!panel || panel.dataset.objbasicPanelReady === 'true') return
    panel.dataset.objbasicPanelReady = 'true'

    bindCanvasInteractions()
    bindModeSelector()
    bindShaderEditor('objbasicVertexShader', 'vertex')
    bindShaderEditor('objbasicFragmentShader', 'fragment')
    bindShaderFileTools('vertex', 'objbasicVertexShader')
    bindShaderFileTools('fragment', 'objbasicFragmentShader')

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

    updateModeUI()
    ensureCurrentModeSources()
        .then(function () {
            syncEditorsForCurrentMode()
            refreshEditors()
        })
        .catch(function (error) {
            setEditorStatus('ObjBasic GLSL 載入失敗：' + formatError(error))
        })
}

function initializeObjbasicPanel(forceRecreate) {
    var token = ++objbasicInitToken

    if (!isObjbasicPanelActive()) {
        destroyScene()
        return
    }

    bindPanel()
    resizeCanvas()
    refreshEditors()
    updateModeUI()
    setStatus(getCurrentModeConfig().label + ' runtime 載入中...')

    Promise.all([
        ensureLibraries(),
        ensureCurrentModeSources()
    ])
        .then(function () {
            if (token !== objbasicInitToken || !isObjbasicPanelActive()) return
            syncEditorsForCurrentMode()
            createScene(!!forceRecreate)
        })
        .catch(function (error) {
            if (token !== objbasicInitToken) return
            setStatus('ObjBasic runtime 載入失敗：' + formatError(error))
            setEditorStatus('ObjBasic GLSL 載入失敗：' + formatError(error))
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
