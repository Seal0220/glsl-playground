var navs = Array.prototype.slice.call(document.querySelectorAll('.nav-btn'))
var main = document.querySelector('.content')
var current = 'gensolo'
var resumeOnReturn = false
var activationToken = 0
var runtimePanels = {
    gensolo: true,
    genmix: true,
    genviewer: true,
    glsleditor: true
}
var runtimeBundles = {
    gensolo: 'assets/bundles/maker-bundle.js',
    genmix: 'assets/bundles/maker-bundle.js',
    genviewer: 'assets/bundles/viewer-bundle.js',
    glsleditor: 'assets/bundles/editor-bundle.js',
    objbasic: 'assets/bundles/objbasic-bundle.js'
}
var pageCache = {}
var pageLoads = {}
var runtimeLoads = {}

function validPanel(name) {
    return navs.some(function (nav) { return nav.dataset.panel === name }) ? name : 'gensolo'
}

function panelFromHash() {
    return validPanel((window.location.hash || '').replace(/^#/, ''))
}

function panelPath(name) {
    return './pages/' + name + '.html'
}

function getPanelPausedCheckbox(panel) {
    return panel ? panel.querySelector('#paused') : null
}

function getPanelPauseButtons(panel) {
    if (!panel) return []
    return Array.prototype.slice.call(panel.querySelectorAll('[data-action="toggle-run"]'))
}

function syncPauseLabel(panel) {
    var paused = getPanelPausedCheckbox(panel)
    getPanelPauseButtons(panel).forEach(function (button) {
        button.textContent = paused && paused.checked ? '運行' : '暫停'
        button.classList.toggle('button-run', paused && paused.checked)
        button.classList.toggle('button-pause', paused && !paused.checked)
    })
}

function setPaused(panel, nextPaused) {
    var paused = getPanelPausedCheckbox(panel)
    if (!paused) return
    if (paused.checked === nextPaused) return syncPauseLabel(panel)
    paused.checked = nextPaused
    paused.dispatchEvent(new Event('change', { bubbles: true }))
    syncPauseLabel(panel)
}

function initPauseButtons(panel) {
    if (!panel || panel.dataset.pauseButtonsReady === 'true') return
    panel.dataset.pauseButtonsReady = 'true'

    getPanelPauseButtons(panel).forEach(function (button) {
        button.addEventListener('click', function () {
            var paused = getPanelPausedCheckbox(panel)
            if (!paused) return
            setPaused(panel, !paused.checked)
        })
    })

    var paused = getPanelPausedCheckbox(panel)
    if (paused) paused.addEventListener('change', function () { syncPauseLabel(panel) })
    syncPauseLabel(panel)
}

function initCustomSelect(select) {
    if (!select || select.dataset.customized === 'true') return

    select.dataset.customized = 'true'
    select.classList.add('select-native')

    var wrapper = document.createElement('div')
    wrapper.className = 'custom-select'

    var button = document.createElement('button')
    button.type = 'button'
    button.className = 'custom-select-button'

    var menu = document.createElement('div')
    menu.className = 'custom-select-menu'
    menu.hidden = true

    function syncLabel() {
        var selected = select.options[select.selectedIndex]
        button.textContent = selected ? selected.textContent : ''
        Array.prototype.slice.call(menu.children).forEach(function (item) {
            item.classList.toggle('is-selected', item.dataset.value === select.value)
        })
    }

    Array.prototype.slice.call(select.options).forEach(function (option) {
        var item = document.createElement('button')
        item.type = 'button'
        item.className = 'custom-select-option'
        item.textContent = option.textContent
        item.dataset.value = option.value
        item.addEventListener('click', function () {
            select.value = option.value
            select.dispatchEvent(new Event('change', { bubbles: true }))
            wrapper.classList.remove('is-open')
            menu.hidden = true
            syncLabel()
        })
        menu.appendChild(item)
    })

    button.addEventListener('click', function () {
        var nextOpen = !wrapper.classList.contains('is-open')
        document.querySelectorAll('.custom-select.is-open').forEach(function (openSelect) {
            openSelect.classList.remove('is-open')
            var openMenu = openSelect.querySelector('.custom-select-menu')
            if (openMenu) openMenu.hidden = true
        })
        wrapper.classList.toggle('is-open', nextOpen)
        menu.hidden = !nextOpen
    })

    select.addEventListener('change', syncLabel)

    select.parentNode.insertBefore(wrapper, select)
    wrapper.appendChild(button)
    wrapper.appendChild(menu)
    wrapper.appendChild(select)
    syncLabel()
}

function initCustomSelects(panel) {
    if (!panel) return
    panel.querySelectorAll('select').forEach(initCustomSelect)
}

function initNumberSteppers(panel) {
    if (!panel) return

    panel.querySelectorAll('input[type="number"]').forEach(function (input) {
        if (!input || input.dataset.stepperReady === 'true') return

        input.dataset.stepperReady = 'true'

        var wrapper = document.createElement('div')
        wrapper.className = 'number-field'

        var stepper = document.createElement('div')
        stepper.className = 'number-stepper'

        var up = document.createElement('button')
        up.type = 'button'
        up.className = 'step-up'
        up.setAttribute('aria-label', '增加數值')

        var down = document.createElement('button')
        down.type = 'button'
        down.className = 'step-down'
        down.setAttribute('aria-label', '減少數值')

        function step(direction) {
            if (direction > 0) input.stepUp()
            else input.stepDown()
            input.dispatchEvent(new Event('input', { bubbles: true }))
            input.dispatchEvent(new Event('change', { bubbles: true }))
        }

        up.addEventListener('click', function () { step(1) })
        down.addEventListener('click', function () { step(-1) })

        input.parentNode.insertBefore(wrapper, input)
        wrapper.appendChild(input)
        stepper.appendChild(up)
        stepper.appendChild(down)
        wrapper.appendChild(stepper)
    })
}

function clampNumberField(field, fallback) {
    if (!field) return fallback

    var value = parseFloat(field.value)
    if (!Number.isFinite(value)) value = fallback

    var min = field.min !== '' ? parseFloat(field.min) : null
    var max = field.max !== '' ? parseFloat(field.max) : null

    if (Number.isFinite(min)) value = Math.max(min, value)
    if (Number.isFinite(max)) value = Math.min(max, value)

    field.value = String(value)
    return value
}

function initParameterValidation(panel) {
    if (!panel || panel.dataset.parameterValidationReady === 'true') return
    panel.dataset.parameterValidationReady = 'true'

    var preferFewer = panel.querySelector('#preferFewer')
    var minAlpha = panel.querySelector('#minAlpha')
    var maxAlpha = panel.querySelector('#maxAlpha')
    var adjust = panel.querySelector('#adjust')

    function syncAlphaRange(changedField) {
        var minValue = clampNumberField(minAlpha, 0.1)
        var maxValue = clampNumberField(maxAlpha, 0.5)

        if (minValue > maxValue) {
            if (changedField === minAlpha) {
                maxValue = minValue
                maxAlpha.value = String(maxValue)
            } else {
                minValue = maxValue
                minAlpha.value = String(minValue)
            }
        }
    }

    [
        [preferFewer, 0.001],
        [adjust, 0.5]
    ].forEach(function (entry) {
        var field = entry[0]
        var fallback = entry[1]
        if (!field) return
        ;['input', 'change', 'blur'].forEach(function (eventName) {
            field.addEventListener(eventName, function () {
                clampNumberField(field, fallback)
            })
        })
        clampNumberField(field, fallback)
    })

    ;[minAlpha, maxAlpha].forEach(function (field) {
        if (!field) return
        ;['input', 'change', 'blur'].forEach(function (eventName) {
            field.addEventListener(eventName, function () {
                syncAlphaRange(field)
            })
        })
    })

    syncAlphaRange(maxAlpha)
}

function initEmbeddedPanels(panel) {
    if (!panel) return

    panel.querySelectorAll('iframe[data-src]').forEach(function (frame) {
        var target = frame.dataset.src
        if (!target) return
        frame.src = target
    })
}

function initPanelEnhancements(panel) {
    initPauseButtons(panel)
    initCustomSelects(panel)
    initNumberSteppers(panel)
    initParameterValidation(panel)
    initEmbeddedPanels(panel)
}

function createPanelFromHTML(html) {
    var template = document.createElement('template')
    template.innerHTML = html.trim()
    return template.content.firstElementChild
}

function loadPanel(name) {
    if (pageCache[name]) return Promise.resolve(pageCache[name])
    if (pageLoads[name]) return pageLoads[name]

    pageLoads[name] = fetch(panelPath(name))
        .then(function (response) {
            if (!response.ok) throw new Error('Failed to load panel: ' + name)
            return response.text()
        })
        .then(function (html) {
            var panel = createPanelFromHTML(html)
            if (!panel) throw new Error('Empty panel markup: ' + name)
            pageCache[name] = panel
            return panel
        })

    return pageLoads[name]
}

function ensureRuntime(name) {
    var bundle = runtimeBundles[name]
    if (!bundle) return Promise.resolve()
    if (runtimeLoads[bundle]) return runtimeLoads[bundle]

    runtimeLoads[bundle] = new Promise(function (resolve, reject) {
        var script = document.createElement('script')
        script.src = bundle
        script.dataset.runtimeBundle = bundle
        script.onload = function () {
            script.dataset.runtimeLoaded = 'true'
            resolve()
        }
        script.onerror = function () {
            delete runtimeLoads[bundle]
            reject(new Error('Failed to load runtime bundle: ' + name))
        }
        document.body.appendChild(script)
    })

    return runtimeLoads[bundle]
}

function syncRuntimeBeforeLeave(nextPanel) {
    if (!runtimePanels[current] || runtimePanels[nextPanel]) return

    var currentPanel = pageCache[current]
    var paused = getPanelPausedCheckbox(currentPanel)
    resumeOnReturn = paused && !paused.checked
    setPaused(currentPanel, true)
}

function syncRuntimeAfterEnter(nextPanel) {
    if (!runtimePanels[nextPanel]) return

    var nextPanelNode = pageCache[nextPanel]
    if (resumeOnReturn) setPaused(nextPanelNode, false)
    resumeOnReturn = false
    syncPauseLabel(nextPanelNode)
}

function notifyPanelChange(name) {
    window.__projectronActivePanel = name
    window.dispatchEvent(new CustomEvent('projectron-panel-change', { detail: { panel: name } }))
}

function mountPanel(panel) {
    main.replaceChildren(panel)
    panel.classList.add('active')
    initPanelEnhancements(panel)
}

function activate(name, updateHash) {
    var next = validPanel(name)

    if (updateHash) {
        var currentHash = (window.location.hash || '').replace(/^#/, '')
        if (currentHash !== next) {
            window.location.hash = next
            return Promise.resolve()
        }
    }

    var mountedPanel = main && main.firstElementChild
    if (current === next && mountedPanel && mountedPanel.dataset.panel === next) {
        return Promise.resolve()
    }

    var token = ++activationToken
    syncRuntimeBeforeLeave(next)

    return loadPanel(next)
        .then(function (panel) {
            if (token !== activationToken) return
            mountPanel(panel)
            navs.forEach(function (nav) { nav.classList.toggle('active', nav.dataset.panel === next) })
            current = next
            return ensureRuntime(next)
        })
        .then(function () {
            if (token !== activationToken) return
            syncRuntimeAfterEnter(next)
            notifyPanelChange(next)
        })
        .catch(function (error) {
            console.error(error)
        })
}

navs.forEach(function (nav) {
    nav.addEventListener('click', function () {
        activate(nav.dataset.panel, true)
    })
})

window.addEventListener('hashchange', function () {
    activate(panelFromHash(), false)
})

document.addEventListener('click', function (event) {
    if (event.target.closest('.custom-select')) return
    document.querySelectorAll('.custom-select.is-open').forEach(function (openSelect) {
        openSelect.classList.remove('is-open')
        var openMenu = openSelect.querySelector('.custom-select-menu')
        if (openMenu) openMenu.hidden = true
    })
})

activate(panelFromHash(), false)
