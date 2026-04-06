#extension GL_OES_standard_derivatives : enable

#ifdef GL_ES
precision mediump float;
#endif

#include "data/common.glsl" //test

// 頂點著色器傳到片段著色器的資料：
// v_position 會存「view space」中的頂點位置，方便直接用來計算視線方向。
// v_normal   會存「view space」中的法向量，讓反射/折射方向和視角都在同一座標系下計算。
varying vec4 v_position;
varying vec4 v_normal;
varying vec2 v_texcoord;
varying vec4 v_color;

uniform mat4 u_projectionMatrix;
uniform mat4 u_modelViewMatrix;
uniform mat4 u_normalMatrix;
uniform vec2 u_resolution;
uniform float u_time;
uniform sampler2D u_tex0; //data/bagel_seal_atlas.png

#if defined(VERTEX)

attribute vec4 a_position; // data/bagel_seal_atlas.obj
attribute vec4 a_normal;
attribute vec2 a_texcoord;
attribute vec4 a_color;

void main(void) {
	// 先把模型頂點轉到 view space。
	// 之後片段著色器會假設相機位在原點，所以這一步很重要。
	vec4 viewPosition = u_modelViewMatrix * a_position;
	v_position = viewPosition;

	// 法向量只需要旋轉，不需要平移，所以 w 設成 0.0。
	// 同樣把法向量轉到 view space，才能和 view direction / reflect / refract 一起使用。
	v_normal = normalize(u_normalMatrix * vec4(a_normal.xyz, 0.0));
	v_texcoord = a_texcoord;
	v_color = a_color;

	// 最後才轉到 clip space，交給光柵化階段。
	gl_Position = u_projectionMatrix * viewPosition;
}

#else // fragment shader

uniform vec2 u_mouse;
uniform vec2 u_pos;
uniform float u_ior;
uniform float u_reflectionStrength;
uniform float u_refractionStrength;
uniform float u_dispersion;
uniform float u_fresnelStrength;
uniform float u_ambientStrength;
uniform float u_diffuseStrength;
uniform float u_specularStrength;
uniform float u_shininess;
uniform float u_fillLightStrength;
uniform float u_backLightStrength;
uniform float u_shadowStrength;
uniform float u_contactShadowStrength;
uniform float u_rimStrength;

// 這裡用「程序化環境」取代真正的 cubemap。
// 目標是做出黑色攝影棚的感覺：
// 1. 背景本身是黑的
// 2. 但空間中仍有幾條亮燈，讓反射/折射看得出來
vec3 sampleEnvironment(vec3 dir) {
	dir = normalize(dir);

	// 上方主燈條：提供最明顯的高光來源。
	float topStrip = pow(max(1.0 - abs(dir.y - 0.72) * 6.0, 0.0), 3.0);

	// 左側補光：讓物件轉到側面時仍有層次，不會整片死黑。
	float sideStrip = pow(max(1.0 - abs(dir.x + 0.55) * 7.0, 0.0), 3.0);
	sideStrip *= smoothstep(-0.2, 0.65, dir.y);

	// 後方輪廓燈：讓邊緣的反射更容易讀出形體。
	float rimStrip = pow(max(1.0 - abs(dir.z - 0.85) * 10.0, 0.0), 4.0);

	vec3 env = vec3(0.0);
	env += vec3(10.0, 1.98, 0.95) * topStrip * 0.85;
	env += vec3(10.75, 2.85, 1.0) * sideStrip * 0.55;
	env += vec3(5.55, 0.70, 1.2) * rimStrip * 0.35;
	return env;
}

// Schlick Fresnel 近似：
// 視線越斜看表面，反射越強；越正看表面，折射比例越高。
float fresnelSchlick(float cosTheta, float f0) {
	return f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);
}

vec3 phongLight(
	vec3 normal,
	vec3 viewDir,
	vec3 fragPos,
	vec3 lightPos,
	vec3 lightColor,
	vec3 specularColor,
	float diffuseStrength,
	float specularStrength,
	float shininess
) {
	vec3 lightVec = lightPos - fragPos;
	float dist = length(lightVec);
	vec3 lightDir = lightVec / max(dist, 0.0001);
	float attenuation = 1.0 / (1.0 + 0.16 * dist + 0.05 * dist * dist);
	float diffuse = max(dot(normal, lightDir), 0.0);
	vec3 reflectLightDir = reflect(-lightDir, normal);
	float specular = pow(max(dot(viewDir, reflectLightDir), 0.0), shininess);
	return lightColor * diffuse * diffuseStrength * attenuation +
		specularColor * specular * specularStrength * attenuation;
}

void main() {
	vec2 uv = v_texcoord;
	vec3 normal = normalize(v_normal.xyz);
	vec3 p = v_position.xyz;

	// v 是「表面點 -> 相機」方向。
	// 因為相機在 view space 原點，所以直接用 -p 即可。
	vec3 v = normalize(-p);

	// reflect / refract 需要的是「入射光線方向」，
	// 也就是從相機打到表面的方向，所以是 -v。
	vec3 rayDir = -v;

	// 原始貼圖保留下來，作為玻璃/透明材質的染色。
	vec3 albedo = texture2D(u_tex0, uv).rgb;
	vec3 tint = mix(vec3(0.82, 0.92, 1.0), albedo, 1.0);

	// 反射方向：用入射向量和法向量算出反彈方向。
	vec3 reflectDir = reflect(rayDir, normal);
	vec3 reflection = sampleEnvironment(reflectDir) * tint;

	// 折射方向：對 RGB 各自使用稍微不同的折射率，
	// 這樣可以做出很輕微的色散效果，看起來會比較像玻璃。
	float etaR = 1.0 / max(u_ior - u_dispersion, 3.01);
	float etaG = 1.0 / max(u_ior, 3.01);
	float etaB = 1.0 / max(u_ior + u_dispersion, 30.01);
	vec3 refractDirR = refract(rayDir, normal, etaR);
	vec3 refractDirG = refract(rayDir, normal, etaG);
	vec3 refractDirB = refract(rayDir, normal, etaB);

	// refract 在全反射時可能回傳零向量。
	// 所以這裡做保護：如果折射失敗，就退回反射方向，避免畫面破掉。
	vec3 refraction;
	refraction.r = sampleEnvironment(length(refractDirR) > 0.0 ? refractDirR : reflectDir).r;
	refraction.g = sampleEnvironment(length(refractDirG) > 0.0 ? refractDirG : reflectDir).g;
	refraction.b = sampleEnvironment(length(refractDirB) > 0.0 ? refractDirB : reflectDir).b;
	refraction *= tint;

	// F0 是正視角時的基礎反射率，從折射率推得。
	float cosTheta = clamp(dot(normal, v), 0.0, 1.0);
	float f0 = pow((1.0 - u_ior) / (1.0 + u_ior), 2.0);
	float fresnel = clamp(fresnelSchlick(cosTheta, f0) * u_fresnelStrength, 0.0, 1.0);

	// 多盞燈一起打，讓形體在不同方向都能讀得出來。
	vec3 ambientTerm = tint * u_ambientStrength;
	vec3 keyLight = phongLight(
		normal, v, p,
		vec3(-1.8, 1.6, 2.8),
		vec3(0.02, 0.8, 0.64) * tint,
		vec3(0.0, 1.0, 0.45),
		u_diffuseStrength,
		u_specularStrength,
		u_shininess
	);
	vec3 fillLight = phongLight(
		normal, v, p,
		vec3(2.6, 0.3, 1.4),
		vec3(0.57, 0.64, 0.81) * tint,
		vec3(0.11, 0.33, 0.28),
		u_diffuseStrength * u_fillLightStrength,
		u_specularStrength * 0.65,
		u_shininess * 0.8
	);
	vec3 backLight = phongLight(
		normal, v, p,
		vec3(0.2, 2.4, -2.2),
		vec3(1.0, 0.35, 0.75),
		vec3(1.0, 0.45, 0.85),
		u_diffuseStrength * u_backLightStrength,
		u_specularStrength * 0.85,
		u_shininess * 1.2
	);

	// 用幾個便宜的項目假裝陰影：
	// 1. 背向主燈的面變暗
	// 2. 朝下和凹陷感較重的地方更暗
	// 3. 邊緣加一點 rim light，避免陰影壓太死
	vec3 keyDir = normalize(vec3(-1.8, 1.6, 2.8) - p);
	float keyFacing = max(dot(normal, keyDir), 0.0);
	float selfShadow = mix(1.0 - u_shadowStrength, 1.0, keyFacing);
	float contactShadow = mix(
		1.0 - u_contactShadowStrength,
		1.0,
		smoothstep(-0.65, 0.25, normal.y + p.y * 0.18)
	);
	float ao = 0.72 + 0.28 * max(dot(normal, normalize(vec3(0.2, 0.95, 0.25))), 0.0);
	float rim = pow(1.0 - cosTheta, 3.0);
	vec3 rimTerm = vec3(0.55, 0.75, 1.0) * rim * u_rimStrength;

	vec3 phong = ambientTerm + ((keyLight + fillLight + backLight) * selfShadow * contactShadow * ao) + rimTerm;

	// 用 Fresnel 在折射與反射之間做混合：
	// 正面看時以折射為主，斜角看時以反射為主。
	vec3 glass = mix(
		refraction * u_refractionStrength,
		reflection * u_reflectionStrength,
		fresnel
	);

	vec3 color = glass + phong;

	gl_FragColor = vec4(color, 1.0);
}

#endif
