#extension GL_OES_standard_derivatives : enable

#ifdef GL_ES
precision mediump float;
#endif

// Mode: PBR
#include "shaders/includes/objbasic-fragment-shared.glsl"

float distributionGGX(vec3 normal, vec3 halfDir, float roughness) {
    float a = roughness * roughness;
    float a2 = a * a;
    float nDotH = max(dot(normal, halfDir), 0.0);
    float nDotH2 = nDotH * nDotH;
    float denom = nDotH2 * (a2 - 1.0) + 1.0;
    return a2 / max(PI * denom * denom, 0.0001);
}

float geometrySchlickGGX(float nDotV, float roughness) {
    float r = roughness + 1.0;
    float k = (r * r) / 8.0;
    return nDotV / max(nDotV * (1.0 - k) + k, 0.0001);
}

float geometrySmith(vec3 normal, vec3 viewDir, vec3 lightDir, float roughness) {
    float ggx1 = geometrySchlickGGX(max(dot(normal, viewDir), 0.0), roughness);
    float ggx2 = geometrySchlickGGX(max(dot(normal, lightDir), 0.0), roughness);
    return ggx1 * ggx2;
}

void main(void) {
    vec2 uv = v_texcoord;
    vec3 position = v_position.xyz;
    vec3 viewDir = normalize(-position);
    vec3 baseNormal = normalize(v_normal.xyz);
    vec3 normal = sampleSurfaceNormal(uv, position, baseNormal);
    vec3 albedo = sampleSurfaceAlbedo(uv);
    float roughness = sampleSurfaceRoughness(uv);
    float metallic = sampleSurfaceMetallic(uv);
    vec3 f0 = mix(vec3(0.04), albedo, metallic);
    vec3 radianceAccum = vec3(0.0);

    vec3 lightPositions[3];
    lightPositions[0] = KEY_LIGHT_POS;
    lightPositions[1] = FILL_LIGHT_POS;
    lightPositions[2] = BACK_LIGHT_POS;

    vec3 lightColors[3];
    lightColors[0] = vec3(7.5, 4.4, 3.8);
    lightColors[1] = vec3(3.1, 3.6, 4.2);
    lightColors[2] = vec3(2.2, 1.5, 2.8);

    for (int i = 0; i < 3; i++) {
        vec3 lightVec = lightPositions[i] - position;
        float distance = length(lightVec);
        vec3 lightDir = lightVec / max(distance, 0.0001);
        vec3 halfDir = normalize(viewDir + lightDir);
        float attenuation = 1.0 / (distance * distance * 0.22 + 1.0);
        vec3 radiance = lightColors[i] * attenuation;

        float ndf = distributionGGX(normal, halfDir, roughness);
        float geometry = geometrySmith(normal, viewDir, lightDir, roughness);
        vec3 fresnel = fresnelSchlickColor(max(dot(halfDir, viewDir), 0.0), f0);
        vec3 numerator = ndf * geometry * fresnel;
        float denominator = max(4.0 * max(dot(normal, viewDir), 0.0) * max(dot(normal, lightDir), 0.0), 0.0001);
        vec3 specular = numerator / denominator;
        vec3 kS = fresnel;
        vec3 kD = (vec3(1.0) - kS) * (1.0 - metallic);
        float nDotL = max(dot(normal, lightDir), 0.0);

        radianceAccum += (kD * albedo / PI + specular) * radiance * nDotL;
    }

    vec3 reflectDir = reflect(-viewDir, normal);
    vec3 environment = sampleEnvironment(reflectDir);
    vec3 ambient = (vec3(0.04) * (1.0 - metallic) + environment * 0.15) * albedo;
    ambient += environment * fresnelSchlickColor(max(dot(normal, viewDir), 0.0), f0) * (1.0 - roughness * 0.55);

    vec3 color = ambient + radianceAccum;
    color += computeStudioRim(normal, viewDir, vec3(0.92, 0.97, 1.0), 0.05);

    gl_FragColor = vec4(color, 1.0);
}
