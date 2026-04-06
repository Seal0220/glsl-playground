#extension GL_OES_standard_derivatives : enable

#ifdef GL_ES
precision mediump float;
#endif

// Mode: Glass
#include "shaders/includes/objbasic-fragment-shared.glsl"

void main(void) {
    vec2 uv = v_texcoord;
    vec3 position = v_position.xyz;
    vec3 viewDir = normalize(-position);
    vec3 rayDir = -viewDir;
    vec3 baseNormal = normalize(v_normal.xyz);
    vec3 normal = sampleSurfaceNormal(uv, position, baseNormal);
    vec3 albedo = sampleSurfaceAlbedo(uv);
    vec3 tint = mix(vec3(0.96, 0.99, 1.0), sampleSurfaceTint(uv), 0.38);
    float roughness = sampleSurfaceRoughness(uv);
    float metallic = sampleSurfaceMetallic(uv);
    vec3 iridescence = iridescentshading(position, normal, viewDir);
    float fresnel = clamp(
        computeGlassFresnel(normal, viewDir) * 1.18 +
        pow(1.0 - saturate(dot(normal, viewDir)), 4.0) * 0.18,
        0.0,
        1.0
    );
    float iridescenceMask = pow(1.0 - saturate(dot(normal, viewDir)), 1.65) * mix(0.45, 0.82, 1.0 - roughness);
    vec3 thinFilmTint = mix(vec3(1.0), iridescence, iridescenceMask);
    vec3 specularTint = sampleSurfaceSpecularTint(tint, metallic * 0.25);
    vec3 reflection = sampleGlassReflection(rayDir, normal, tint * thinFilmTint) * mix(1.4, 0.92, roughness);
    vec3 refraction = sampleGlassRefraction(rayDir, normal, mix(tint, tint * thinFilmTint, 0.42)) * mix(1.55, 1.08, roughness);
    float shininess = mix(180.0, 42.0, roughness);

    vec3 keySpec = phongLight(
        normal, viewDir, position,
        KEY_LIGHT_POS,
        vec3(0.44, 0.98, 1.0),
        specularTint,
        0.34,
        2.0,
        shininess
    );
    vec3 backSpec = phongLight(
        normal, viewDir, position,
        BACK_LIGHT_POS,
        vec3(1.0, 0.52, 0.88),
        vec3(1.0),
        0.16,
        1.7,
        shininess * 1.22
    );
    vec3 edgeGlow = computeStudioRim(normal, viewDir, vec3(0.78, 0.90, 1.0), 0.26);
    vec3 caustic = vec3(0.88, 0.96, 1.0) *
        pow(max(dot(normalize(KEY_LIGHT_POS - position), reflect(-viewDir, normal)), 0.0), 14.0) * 0.18;
    vec3 glass = mix(refraction * 1.05, reflection, fresnel);
    vec3 iridescentEdge = iridescence * iridescenceMask * (0.18 + fresnel * 0.26);
    vec3 color = glass + keySpec + backSpec + edgeGlow + caustic + iridescentEdge + albedo * 0.02;
    float specularPeak = max(
        max(max(keySpec.r, keySpec.g), keySpec.b),
        max(max(backSpec.r, backSpec.g), backSpec.b)
    );
    float coreAlpha = mix(0.12, 0.22, 1.0 - roughness);
    float edgeAlpha = mix(coreAlpha, 0.72, fresnel);
    float alpha = clamp(edgeAlpha + specularPeak * 0.08 + edgeGlow.b * 0.05 + iridescenceMask * 0.04, 0.10, 0.82);

    gl_FragColor = vec4(color, alpha);
}
