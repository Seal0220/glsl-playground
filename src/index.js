/*!
 * glsl-projectron: experimental GPGPU thingy
 * @url      github.com/fenomas/glsl-projectron
 * @author   Andy Hall <andy@fenomas.com>
 * @license  MIT
 */

import { PolyData } from './polydata'

var createTexture = require('gl-texture2d')
var createBuffer = require('gl-buffer')
var createShader = require('gl-shader')
var createFBO = require('gl-fbo')
var createVAO = require('gl-vao')
var glslify = require('glslify')
var mat4 = require('gl-mat4')

/*
 * 
 *      Projectron (2-view, A2: 幾何平均嚴格一致模式)
 * 
 *      params: 
 *       - canvas: 用來建立 WebGL context 與輸出畫面的 <canvas>
 *       - size  : 內部比較用貼圖大小
 * 
 */

export function Projectron(canvas, size) {
	if (!canvas || !canvas.getContext) throw 'Error: pass in a canvas element!'
	size = parseInt(size) || 256
	var powerOfTwoSize = Math.pow(2, Math.round(Math.log2(size)))

	var gl = canvas.getContext('webgl', { alpha: false })
	if (!gl) throw 'Error: webgl not supported?'

	// 全域設定
	var perspective = 0.2
	var fewerPolysTolerance = 0.001
	var fboSize = Math.max(32, powerOfTwoSize)

	// 目標貼圖：view1 = 正面, view2 = 右側 +90°
	var tgtTexture1 = null
	var tgtTexture2 = null

	// 分數：A2 模式 → score = geometricMean(score1, score2)
	var currentScore = -100
	var lastScore1 = 0
	var lastScore2 = 0

	/*
	 * 
	 *      公開 API
	 * 
	 */

	// 正面
	this.setTargetImage = setTargetImage1
	// 側面（右 +90°）
	this.setTargetImage2 = setTargetImage2

	this.setAlphaRange = (a, b) => polys.setAlphaRange(+a, +b)
	this.setAdjustAmount = (n) => polys.setAdjust(+n)
	this.setFewerPolyTolerance = (n) => { fewerPolysTolerance = n || 0 }

	this.getScore = () => currentScore
	this.getNumPolys = () => polys.getNumPolys()

	// draw(xRot, yRot) 是給 UI 用的自由視角顯示，不影響演化時的 canonical camera
	this.draw = (x, y) => { paint(x, y) }

	// 顯示參考圖：預設 view1，若傳 2 則顯示 view2
	this.drawTargetImage = (viewIndex) => {
		if (viewIndex === 2) paintReference2()
		else paintReference1()
	}

	// 暫存緩衝顯示：以 view1 scratch 為主
	this._drawScratchImage = () => { paintScratchBuffer1() }

	this.version = require('../package.json').version

	/*
	 * 
	 *      GL 初始化
	 * 
	 */

	gl.disable(gl.DEPTH_TEST)
	gl.enable(gl.BLEND)
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

	// 載入 shader
	var comp = {}
	var shaderReq = require.context('./shaders', false, /glsl$/)
	shaderReq.keys().forEach(str => {
		var name = /([\w-]+)/.exec(str)[1]
		var src = shaderReq(str).default
		comp[name] = glslify(src)
	})
	var camShader = createShader(gl, comp['camera-vert'], comp['camera-frag'])
	var flatShader = createShader(gl, comp['flatTexture-vert'], comp['flatTexture-frag'])
	var diffShader = createShader(gl, comp['flatTexture-vert'], comp['diffReduce4-frag'])
	var avgShader = createShader(gl, comp['flatTexture-vert'], comp['avgReduce4-frag'])

	// FBO：view1 / view2 各一組 reference + scratch
	var referenceFB1 = createFBO(gl, [fboSize, fboSize], { color: 1 })
	referenceFB1.drawn = false
	var scratchFB1 = createFBO(gl, [fboSize, fboSize], { color: 1 })

	var referenceFB2 = createFBO(gl, [fboSize, fboSize], { color: 1 })
	referenceFB2.drawn = false
	var scratchFB2 = createFBO(gl, [fboSize, fboSize], { color: 1 })

	// 比較時用的多層縮小 FBO（兩視角共用）
	var reducedFBs = []
	var reducedSize = fboSize / 4
	while (reducedSize >= 16) {
		var buff = createFBO(gl, [reducedSize, reducedSize], { color: 1 })
		reducedFBs.push(buff)
		reducedSize /= 4
	}
	if (reducedFBs.length === 0) {
		throw new Error('Comparison framebuffer is too small - increase "fboSize"')
	}

	// polygon data 與 buffer
	var polys = new PolyData()
	var vertBuffer = createBuffer(gl, polys.getVertArray())
	var colBuffer = createBuffer(gl, polys.getColorArray())
	var polyBuffersOutdated = false

	var dataVao = createVAO(gl, [
		{ "buffer": vertBuffer, "type": gl.FLOAT, "size": 3 },
		{ "buffer": colBuffer, "type": gl.FLOAT, "size": 4 }
	])
	var squareBuffer = createBuffer(
		gl, [-1, -1, -1, 1, 1, -1, 1, 1, -1, 1, 1, -1])
	var flatVao = createVAO(gl, [
		{ "buffer": squareBuffer, "type": gl.FLOAT, "size": 2 }
	])

	var camMatrix = mat4.create()
	var rand = () => Math.random()

	/*
	 * 
	 *      一次演化（含兩視角評分）
	 * 
	 */

	this.runGeneration = function () {
		// 至少要有第一張目標圖
		if (!tgtTexture1) return

		polys.cacheDataNow()
		var vertCount = polys.getNumVerts()

		mutateSomething()

		// 排序、更新 buffer
		polys.sortPolygonsByZ()
		vertBuffer.update(polys.getVertArray())
		colBuffer.update(polys.getColorArray())
		polyBuffersOutdated = false

		// 兩視角一起評分
		var score = computeTotalScore()

		var keep = (score > currentScore)

		// 若頂點變少，在容忍度內仍偏好 keep
		if (!keep && polys.getNumVerts() < vertCount) {
			if (score > currentScore - fewerPolysTolerance) keep = true
		}

		if (keep) {
			currentScore = score
		} else {
			polys.restoreCachedData()
			polyBuffersOutdated = true
			// buffer 內容先不更新，等下一次需要時再補
		}
	}

	function mutateSomething() {
		var r = rand()
		if (r < 0.25) {
			polys.mutateValue()
		} else if (r < 0.5) {
			polys.mutateVertex()
		} else if (r < 0.8) {
			polys.addPoly()
		} else {
			polys.removePoly()
		}
	}

	/*
	 * 
	 *      設定目標影像（view1 / view2）
	 * 
	 */

	function setTargetImage1(image) {
		prerender()
		tgtTexture1 = createTexture(gl, image)
		drawFlat(tgtTexture1, referenceFB1, true)   // 畫到 view1 reference FBO
		currentScore = computeTotalScore()
	}

	function setTargetImage2(image) {
		prerender()
		tgtTexture2 = createTexture(gl, image)
		drawFlat(tgtTexture2, referenceFB2, true)   // 畫到 view2 reference FBO
		currentScore = computeTotalScore()
	}

	function prerender() {
		gl.bindFramebuffer(gl.FRAMEBUFFER, null)
		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
		gl.clearStencil(0)
		gl.clearColor(0, 0, 0, 1)
		gl.clearDepth(1)
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT)
	}

	/*
	 * 
	 *      顯示用繪圖（單一 canvas，任意視角）
	 * 
	 */

	function paint(xRot, yRot) {
		if (polyBuffersOutdated) {
			vertBuffer.update(polys.getVertArray())
			colBuffer.update(polys.getColorArray())
			polyBuffersOutdated = false
		}
		// UI 用自由旋轉：這個矩陣「只影響畫面」，不影響演化時的 canonical camera
		camMatrix = mat4.create()
		mat4.rotateY(camMatrix, camMatrix, xRot || 0)
		mat4.rotateX(camMatrix, camMatrix, yRot || 0)

		drawData(null, perspective, camMatrix)
	}

	// 顯示正面參考影像（view1）
	function paintReference1() {
		if (!tgtTexture1) return
		drawFlat(referenceFB1.color[0], null, false)
	}

	// 顯示側面參考影像（view2）
	function paintReference2() {
		if (!tgtTexture2) return
		drawFlat(referenceFB2.color[0], null, false)
	}

	// 顯示 view1 的 scratch buffer
	function paintScratchBuffer1() {
		if (!tgtTexture1) return
		drawFlat(scratchFB1.color[0], null, false)
	}

	/*
	 * 
	 *      一般繪製 helper
	 * 
	 */

	function drawFlat(source, target, flipY) {
		var multY = (flipY) ? -1 : 1
		drawGeneral(
			target, flatShader, flatVao, 6,
			["multY", "buffer"],
			[multY, source]
		)
	}

	function drawData(target, perspectiveVal, camMat4) {
		camMatrix = camMat4 || mat4.create()
		drawGeneral(
			target, camShader, dataVao, polys.getNumVerts(),
			["perspective", "camera"],
			[perspectiveVal, camMatrix]
		)
	}

	function drawGeneral(target, shader, vao, numVs, uniNames, uniVals) {
		if (target) {
			// target 是 FBO：先清成透明，再畫不寫 alpha
			target.bind()
			gl.colorMask(true, true, true, true)
			gl.clear(gl.COLOR_BUFFER_BIT)
			gl.colorMask(true, true, true, false)
		} else {
			prerender()
		}

		shader.bind()
		var textureNum = 0
		for (var i = 0; i < uniNames.length; i++) {
			var n = uniNames[i]
			var u = uniVals[i]
			if (typeof (u && u.bind) === "function") {
				shader.uniforms[n] = u.bind(textureNum++)
			} else {
				shader.uniforms[n] = u
			}
		}
		vao.bind()
		vao.draw(gl.TRIANGLES, numVs)
		vao.unbind()
	}

	/*
	 * 
	 *      分數計算（兩視角，幾何平均）
	 * 
	 */

	function computeTotalScore() {
		// 沒主視圖就維持現況
		if (!tgtTexture1) return currentScore

		// view1：正面（canonical camera = identity）
		var camFront = mat4.create()
		drawData(scratchFB1, perspective, camFront)
		lastScore1 = compareFBOs(referenceFB1, scratchFB1)

		// 若沒有第二張圖，就只用 view1 分數
		if (!tgtTexture2) {
			lastScore2 = 0
			return lastScore1
		}

		// view2：右側 90°（A 模式固定 +90°）
		var camSide = mat4.create()
		mat4.rotateY(camSide, camSide, Math.PI / 2) // 右轉 90°
		drawData(scratchFB2, perspective, camSide)
		lastScore2 = compareFBOs(referenceFB2, scratchFB2)

		// 幾何平均，防止其中一個 <= 0 導致 NaN
		if (lastScore1 <= 0 || lastScore2 <= 0) {
			return Math.min(lastScore1, lastScore2)
		}
		return Math.sqrt(lastScore1 * lastScore2)
	}

	function compareFBOs(a, b) {
		return compareFBOsOnGPU(a, b)
	}

	function compareFBOsOnGPU(a, b) {
		var uNames, uVals, i

		// 第一步：diff shader，把 a / b 的差值寫進 reducedFBs[0]，尺寸縮小 4 倍
		uNames = ["multY", "inputDim", "bufferA", "bufferB"]
		uVals = [1, a.shape[0], a.color[0], b.color[0]]
		drawGeneral(reducedFBs[0], diffShader, flatVao, 6, uNames, uVals)

		// 後續用 avg shader 繼續縮小
		for (i = 1; i < reducedFBs.length; i++) {
			uNames = ["multY", "inputDim", "buffer"]
			uVals = [1, reducedFBs[i - 1].shape[0], reducedFBs[i - 1].color[0]]
			drawGeneral(reducedFBs[i], avgShader, flatVao, 6, uNames, uVals)
		}

		// 最後一層寬高 <= 16
		var buff = reducedFBs[reducedFBs.length - 1]
		var w = buff.shape[0]
		var uarr = new Uint8Array(w * w * 4)
		buff.bind()
		gl.readPixels(0, 0, w, w, gl.RGBA, gl.UNSIGNED_BYTE, uarr)

		var sum = 0
		var mag = 255
		for (i = 0; i < uarr.length; i += 4) {
			sum += uarr[i] + (uarr[i + 1] + uarr[i + 2] / mag) / mag
		}
		var avg = 3 * sum / w / w
		return 100 * (1 - avg / 128)
	}

	/*
	 * 
	 *      資料匯入 / 匯出
	 * 
	 */

	this.exportData = function () {
		var s = 'vert-xyz,'
		s += polys.getVertArray().map(n => n.toFixed(8)).join()
		s += ',\ncol-rgba,'
		s += polys.getColorArray().map(n => n.toFixed(5)).join()
		return s
	}

	this.exportPLY = function () {
		var verts = polys.getVertArray()
		var cols = polys.getColorArray()
		var numVerts = polys.getNumVerts()
		var numFaces = polys.getNumPolys()
		var toByte = function (n) {
			return Math.max(0, Math.min(255, Math.round(n * 255)))
		}
		var lines = [
			'ply',
			'format ascii 1.0',
			'comment Exported from glsl-projectron',
			'element vertex ' + numVerts,
			'property float x',
			'property float y',
			'property float z',
			'property uchar red',
			'property uchar green',
			'property uchar blue',
			'property uchar alpha',
			'property uchar opacity',
			'element face ' + numFaces,
			'property list uchar int vertex_indices',
			'property uchar red',
			'property uchar green',
			'property uchar blue',
			'property uchar alpha',
			'property uchar opacity',
			'end_header'
		]

		for (var i = 0; i < numVerts; i++) {
			var vi = i * 3
			var ci = i * 4
			var x = verts[vi].toFixed(8)
			var y = verts[vi + 1].toFixed(8)
			var z = verts[vi + 2].toFixed(8)
			var r = toByte(cols[ci])
			var g = toByte(cols[ci + 1])
			var b = toByte(cols[ci + 2])
			var a = toByte(cols[ci + 3])
			lines.push([x, y, z, r, g, b, a, a].join(' '))
		}

		for (var faceIndex = 0; faceIndex < numFaces; faceIndex++) {
			var base = faceIndex * 3
			var faceColorIndex = base * 4
			var faceColorIndex2 = (base + 1) * 4
			var faceColorIndex3 = (base + 2) * 4
			var fr = toByte((cols[faceColorIndex] + cols[faceColorIndex2] + cols[faceColorIndex3]) / 3)
			var fg = toByte((cols[faceColorIndex + 1] + cols[faceColorIndex2 + 1] + cols[faceColorIndex3 + 1]) / 3)
			var fb = toByte((cols[faceColorIndex + 2] + cols[faceColorIndex2 + 2] + cols[faceColorIndex3 + 2]) / 3)
			var fa = toByte((cols[faceColorIndex + 3] + cols[faceColorIndex2 + 3] + cols[faceColorIndex3 + 3]) / 3)
			lines.push([
				'3',
				base,
				base + 1,
				base + 2,
				fr,
				fg,
				fb,
				fa,
				fa
			].join(' '))
		}

		return lines.join('\n') + '\n'
	}

	function applyImportedArrays(v, c, sortPolys) {
		polys.setArrays(v, c)
		if (sortPolys) {
			polys.sortPolygonsByZ()
		}
		vertBuffer.update(polys.getVertArray())
		colBuffer.update(polys.getColorArray())
		polyBuffersOutdated = false
		if (tgtTexture1) {
			currentScore = computeTotalScore()
		}
		return true
	}

	this.importPLY = function (s) {
		if (!s || s.length < 8) return

		var lines = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
		if (!lines.length || lines[0].trim() !== 'ply') {
			console.warn('PLY import failed: missing "ply" header')
			return
		}

		var format = null
		var headerEnd = -1
		var currentElement = null
		var elements = {}
		for (var i = 1; i < lines.length; i++) {
			var line = lines[i].trim()
			if (!line || line.indexOf('comment ') === 0 || line.indexOf('obj_info ') === 0) continue
			if (line === 'end_header') {
				headerEnd = i
				break
			}

			var parts = line.split(/\s+/)
			if (parts[0] === 'format') {
				format = parts[1]
			} else if (parts[0] === 'element') {
				currentElement = {
					name: parts[1],
					count: parseInt(parts[2]),
					properties: []
				}
				elements[currentElement.name] = currentElement
			} else if (parts[0] === 'property' && currentElement) {
				if (parts[1] === 'list') {
					currentElement.properties.push({
						kind: 'list',
						countType: parts[2],
						itemType: parts[3],
						name: parts[4]
					})
				} else {
					currentElement.properties.push({
						kind: 'scalar',
						type: parts[1],
						name: parts[2]
					})
				}
			}
		}

		if (format !== 'ascii') {
			console.warn('PLY import failed: only ASCII PLY is supported')
			return
		}
		if (headerEnd < 0) {
			console.warn('PLY import failed: missing end_header')
			return
		}

		var vertexElement = elements.vertex
		if (!vertexElement || !vertexElement.count) {
			console.warn('PLY import failed: missing vertex element')
			return
		}

		var integerTypes = {
			char: true, uchar: true, short: true, ushort: true,
			int: true, uint: true, int8: true, uint8: true,
			int16: true, uint16: true, int32: true, uint32: true
		}
		var clamp01 = function (n) {
			return Math.max(0, Math.min(1, n))
		}
		var normalizeColor = function (value, type, fallback) {
			if (value === undefined || value === null || isNaN(value)) return fallback
			if (integerTypes[type]) return clamp01(value / 255)
			if (value > 1 || value < 0) return clamp01(value / 255)
			return clamp01(value)
		}
		var getScalarType = function (element, name) {
			if (!element) return null
			for (var ei = 0; ei < element.properties.length; ei++) {
				var prop = element.properties[ei]
				if (prop.kind === 'scalar' && prop.name === name) return prop.type
			}
			return null
		}
		var pickDefined = function () {
			for (var ai = 0; ai < arguments.length; ai++) {
				if (arguments[ai] !== undefined) return arguments[ai]
			}
		}
		var nextDataTokens = function (state) {
			while (state.index < lines.length) {
				var raw = lines[state.index++].trim()
				if (!raw || raw.indexOf('comment ') === 0 || raw.indexOf('obj_info ') === 0) continue
				return raw.split(/\s+/)
			}
			return null
		}
		var parseElementRow = function (tokens, props) {
			var cursor = 0
			var row = {}
			for (var pi = 0; pi < props.length; pi++) {
				var prop = props[pi]
				if (prop.kind === 'list') {
					var listCount = parseInt(tokens[cursor++])
					var list = []
					for (var li = 0; li < listCount; li++) {
						list.push(parseFloat(tokens[cursor++]))
					}
					row[prop.name] = list
				} else {
					row[prop.name] = parseFloat(tokens[cursor++])
				}
			}
			return row
		}

		var state = { index: headerEnd + 1 }
		var vertexTypes = {
			red: getScalarType(vertexElement, 'red') || getScalarType(vertexElement, 'r'),
			green: getScalarType(vertexElement, 'green') || getScalarType(vertexElement, 'g'),
			blue: getScalarType(vertexElement, 'blue') || getScalarType(vertexElement, 'b'),
			alpha: getScalarType(vertexElement, 'alpha') || getScalarType(vertexElement, 'opacity') || getScalarType(vertexElement, 'a')
		}
		var vertices = []
		for (i = 0; i < vertexElement.count; i++) {
			var vertexTokens = nextDataTokens(state)
			if (!vertexTokens) {
				console.warn('PLY import failed: vertex data ended early')
				return
			}
			var vertexRow = parseElementRow(vertexTokens, vertexElement.properties)
			if (isNaN(vertexRow.x) || isNaN(vertexRow.y) || isNaN(vertexRow.z)) {
				console.warn('PLY import failed: vertex is missing x/y/z')
				return
			}
			var vertexRedRaw = pickDefined(vertexRow.red, vertexRow.r)
			var vertexGreenRaw = pickDefined(vertexRow.green, vertexRow.g)
			var vertexBlueRaw = pickDefined(vertexRow.blue, vertexRow.b)
			var vertexAlphaRaw = pickDefined(vertexRow.alpha, vertexRow.opacity, vertexRow.a)
			vertices.push({
				x: vertexRow.x,
				y: vertexRow.y,
				z: vertexRow.z,
				r: normalizeColor(vertexRedRaw, vertexTypes.red, 1),
				g: normalizeColor(vertexGreenRaw, vertexTypes.green, 1),
				b: normalizeColor(vertexBlueRaw, vertexTypes.blue, 1),
				a: normalizeColor(vertexAlphaRaw, vertexTypes.alpha, 1),
				hasR: vertexRedRaw !== undefined,
				hasG: vertexGreenRaw !== undefined,
				hasB: vertexBlueRaw !== undefined,
				hasA: vertexAlphaRaw !== undefined
			})
		}

		var faces = []
		var faceElement = elements.face
		var faceTypes = {
			red: getScalarType(faceElement, 'red') || getScalarType(faceElement, 'r'),
			green: getScalarType(faceElement, 'green') || getScalarType(faceElement, 'g'),
			blue: getScalarType(faceElement, 'blue') || getScalarType(faceElement, 'b'),
			alpha: getScalarType(faceElement, 'alpha') || getScalarType(faceElement, 'opacity') || getScalarType(faceElement, 'a')
		}
		if (faceElement && faceElement.count) {
			for (i = 0; i < faceElement.count; i++) {
				var faceTokens = nextDataTokens(state)
				if (!faceTokens) {
					console.warn('PLY import failed: face data ended early')
					return
				}
				var faceRow = parseElementRow(faceTokens, faceElement.properties)
				var indices = faceRow.vertex_indices || faceRow.vertex_index
				if (!indices || indices.length < 3) continue
				var faceRedRaw = pickDefined(faceRow.red, faceRow.r)
				var faceGreenRaw = pickDefined(faceRow.green, faceRow.g)
				var faceBlueRaw = pickDefined(faceRow.blue, faceRow.b)
				var faceAlphaRaw = pickDefined(faceRow.alpha, faceRow.opacity, faceRow.a)
				faces.push({
					indices: indices,
					r: normalizeColor(faceRedRaw, faceTypes.red, null),
					g: normalizeColor(faceGreenRaw, faceTypes.green, null),
					b: normalizeColor(faceBlueRaw, faceTypes.blue, null),
					a: normalizeColor(faceAlphaRaw, faceTypes.alpha, null),
					hasR: faceRedRaw !== undefined,
					hasG: faceGreenRaw !== undefined,
					hasB: faceBlueRaw !== undefined,
					hasA: faceAlphaRaw !== undefined
				})
			}
		} else {
			for (i = 0; i + 2 < vertices.length; i += 3) {
				faces.push({
					indices: [i, i + 1, i + 2],
					r: null,
					g: null,
					b: null,
					a: null,
					hasR: false,
					hasG: false,
					hasB: false,
					hasA: false
				})
			}
		}

		if (!faces.length) {
			console.warn('PLY import failed: no triangular geometry found')
			return
		}

		var vertArr = []
		var colArr = []
		var appendTri = function (aIndex, bIndex, cIndex, face) {
			var tri = [aIndex, bIndex, cIndex]
			for (var ti = 0; ti < 3; ti++) {
				var vIndex = tri[ti]
				var vertex = vertices[vIndex]
				if (!vertex) {
					console.warn('PLY import failed: face references missing vertex ' + vIndex)
					return false
				}
				vertArr.push(vertex.x, vertex.y, vertex.z)
				colArr.push(
					vertex.hasR ? vertex.r : face.hasR ? face.r : 1,
					vertex.hasG ? vertex.g : face.hasG ? face.g : 1,
					vertex.hasB ? vertex.b : face.hasB ? face.b : 1,
					vertex.hasA ? vertex.a : face.hasA ? face.a : 1
				)
			}
			return true
		}

		for (i = 0; i < faces.length; i++) {
			var face = faces[i]
			for (var fi = 1; fi + 1 < face.indices.length; fi++) {
				if (!appendTri(face.indices[0], face.indices[fi], face.indices[fi + 1], face)) {
					return
				}
			}
		}

		if (!vertArr.length || vertArr.length / 3 !== colArr.length / 4) {
			console.warn('PLY import failed: parsed data is unbalanced')
			return
		}

		return applyImportedArrays(vertArr, colArr, true)
	}

	this.importData = function (s) {
		var curr, v = [], c = []
		var arr = s.split(',')
		if (s.length < 5) return
		arr.forEach(function (s2) {
			var n = parseFloat(s2)
			if (s2.indexOf('vert-xyz') > -1) { curr = v }
			else if (s2.indexOf('col-rgba') > -1) { curr = c }
			else if (curr && !isNaN(n)) { curr.push(n) }
			else { console.warn('Import: ignoring value ' + s2) }
		})
		if (v.length / 3 === c.length / 4) {
			return applyImportedArrays(v, c, false)
		} else {
			console.warn('Import failed: unbalanced counts, verts=' +
				`${v.length / 3}  cols=${c.length / 4}`
			)
		}
	}
}
