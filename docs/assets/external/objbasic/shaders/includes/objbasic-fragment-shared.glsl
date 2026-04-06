#include "../../data/common.glsl"

varying vec4 v_position;
varying vec4 v_normal;
varying vec2 v_texcoord;
varying vec4 v_color;

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
uniform vec2 u_envOffset;
uniform sampler2D u_tex0;
uniform sampler2D u_texNormal;
uniform sampler2D u_texRoughness;
uniform sampler2D u_envMap;

const vec3 KEY_LIGHT_POS = vec3(-1.8, 1.6, 2.8);
const vec3 FILL_LIGHT_POS = vec3(2.6, 0.3, 1.4);
const vec3 BACK_LIGHT_POS = vec3(0.2, 2.4, -2.2);
const vec3 KEY_LIGHT_COLOR = vec3(0.02, 0.8, 0.64);
const vec3 FILL_LIGHT_COLOR = vec3(0.57, 0.64, 0.81);
const vec3 BACK_LIGHT_COLOR = vec3(1.0, 0.35, 0.75);

float saturate(float value) {
    return clamp(value, 0.0, 1.0);
}

vec3 sampleEnvironment(vec3 dir) {
    dir = normalize(dir);

    float topStrip = pow(max(1.0 - abs(dir.y - 0.72) * 6.0, 0.0), 3.0);
    float sideStrip = pow(max(1.0 - abs(dir.x + 0.55) * 7.0, 0.0), 3.0);
    float rimStrip = pow(max(1.0 - abs(dir.z - 0.85) * 10.0, 0.0), 4.0);
    sideStrip *= smoothstep(-0.2, 0.65, dir.y);

    vec3 studioEnv = vec3(0.0);
    studioEnv += vec3(10.0, 1.98, 0.95) * topStrip * 0.85;
    studioEnv += vec3(10.75, 2.85, 1.0) * sideStrip * 0.55;
    studioEnv += vec3(5.55, 0.70, 1.2) * rimStrip * 0.35;

    vec2 uv = SphereMap(dir);
    uv.x = fract(uv.x + u_envOffset.x);
    uv.y = clamp(uv.y + u_envOffset.y, 0.001, 0.999);
    vec3 hdriEnv = texture2D(u_envMap, uv).rgb;

    return studioEnv + hdriEnv * 0.38;
}

float fresnelSchlickScalar(float cosTheta, float f0) {
    return f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);
}

vec3 fresnelSchlickColor(float cosTheta, vec3 f0) {
    return f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);
}

mat3 cotangentFrame(vec3 normal, vec3 position, vec2 uv) {
    vec3 dp1 = dFdx(position);
    vec3 dp2 = dFdy(position);
    vec2 duv1 = dFdx(uv);
    vec2 duv2 = dFdy(uv);

    vec3 dp2Perp = cross(dp2, normal);
    vec3 dp1Perp = cross(normal, dp1);
    vec3 tangent = dp2Perp * duv1.x + dp1Perp * duv2.x;
    vec3 bitangent = dp2Perp * duv1.y + dp1Perp * duv2.y;
    float invMax = inversesqrt(max(dot(tangent, tangent), dot(bitangent, bitangent)));

    return mat3(tangent * invMax, bitangent * invMax, normal);
}

vec3 sampleSurfaceAlbedo(vec2 uv) {
    return texture2D(u_tex0, uv).rgb;
}

float sampleSurfaceRoughness(vec2 uv) {
    return clamp(max(texture2D(u_texRoughness, uv).g, 0.08), 0.08, 1.0);
}

float sampleSurfaceMetallic(vec2 uv) {
    return clamp(texture2D(u_texRoughness, uv).b, 0.0, 1.0);
}

vec3 sampleSurfaceTint(vec2 uv) {
    vec3 albedo = sampleSurfaceAlbedo(uv);
    return mix(vec3(0.82, 0.92, 1.0), albedo, 0.92);
}

vec3 sampleSurfaceSpecularTint(vec3 tint, float metallic) {
    return mix(vec3(1.0), tint, metallic * 0.35);
}

vec3 sampleSurfaceNormal(vec2 uv, vec3 position, vec3 baseNormal) {
    vec3 mapped = texture2D(u_texNormal, uv).xyz * 2.0 - 1.0;
    mat3 tbn = cotangentFrame(baseNormal, position, uv);
    return normalize(tbn * mapped);
}

float computeLocalShininess(float roughness) {
    return mix(u_shininess, 14.0, roughness);
}

float computeLocalSpecularStrength(float roughness) {
    return mix(u_specularStrength, u_specularStrength * 0.22, roughness);
}

float computeLocalReflectionStrength(float roughness) {
    return mix(u_reflectionStrength * 1.1, u_reflectionStrength * 0.55, roughness);
}

float computeLocalRefractionStrength(float roughness) {
    return mix(u_refractionStrength, u_refractionStrength * 0.82, roughness);
}

float computeGlassFresnel(vec3 normal, vec3 viewDir) {
    float cosTheta = saturate(dot(normal, viewDir));
    float f0 = pow((1.0 - u_ior) / (1.0 + u_ior), 2.0);
    return clamp(fresnelSchlickScalar(cosTheta, f0) * u_fresnelStrength, 0.0, 1.0);
}

vec3 sampleGlassReflection(vec3 rayDir, vec3 normal, vec3 tint) {
    return sampleEnvironment(reflect(rayDir, normal)) * tint;
}

vec3 sampleGlassRefraction(vec3 rayDir, vec3 normal, vec3 tint) {
    float etaR = 1.0 / max(u_ior - u_dispersion, 3.01);
    float etaG = 1.0 / max(u_ior, 3.01);
    float etaB = 1.0 / max(u_ior + u_dispersion, 30.01);
    vec3 reflectDir = reflect(rayDir, normal);
    vec3 refractDirR = refract(rayDir, normal, etaR);
    vec3 refractDirG = refract(rayDir, normal, etaG);
    vec3 refractDirB = refract(rayDir, normal, etaB);
    vec3 refraction;

    refraction.r = sampleEnvironment(length(refractDirR) > 0.0 ? refractDirR : reflectDir).r;
    refraction.g = sampleEnvironment(length(refractDirG) > 0.0 ? refractDirG : reflectDir).g;
    refraction.b = sampleEnvironment(length(refractDirB) > 0.0 ? refractDirB : reflectDir).b;

    return refraction * tint;
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

float computeStudioShadow(vec3 normal, vec3 position) {
    vec3 keyDir = normalize(KEY_LIGHT_POS - position);
    float keyFacing = max(dot(normal, keyDir), 0.0);
    float selfShadow = mix(1.0 - u_shadowStrength, 1.0, keyFacing);
    float contactShadow = mix(
        1.0 - u_contactShadowStrength,
        1.0,
        smoothstep(-0.65, 0.25, normal.y + position.y * 0.18)
    );
    float ao = 0.72 + 0.28 * max(dot(normal, normalize(vec3(0.2, 0.95, 0.25))), 0.0);

    return max(selfShadow * contactShadow * ao, 0.0);
}

vec3 computeStudioRim(vec3 normal, vec3 viewDir, vec3 color, float strength) {
    float rim = pow(1.0 - saturate(dot(normal, viewDir)), 3.0);
    return color * rim * strength;
}
