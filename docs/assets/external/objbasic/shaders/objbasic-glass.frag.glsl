#extension GL_OES_standard_derivatives : enable

#ifdef GL_ES
precision mediump float;
#endif

// Mode: Glass Smooth
#include "shaders/includes/objbasic-fragment-shared.glsl"

void main(void) {
    vec2 uv = v_texcoord;
    vec3 position = v_position.xyz;
    vec3 viewDir = normalize(-position);
    vec3 rayDir = -viewDir;
    vec3 normal = normalize(v_normal.xyz);
    vec3 albedo = sampleSurfaceAlbedo(uv);
    vec3 tint = mix(vec3(0.985, 0.992, 1.0), sampleSurfaceTint(uv), 0.12);
    float fresnel = clamp(
        computeGlassFresnel(normal, viewDir) * 1.1 +
        pow(1.0 - saturate(dot(normal, viewDir)), 5.2) * 0.24,
        0.0,
        1.0
    );
    vec3 reflection = sampleGlassReflection(rayDir, normal, tint) * 1.22;
    vec3 refraction = sampleGlassRefraction(rayDir, normal, tint) * 1.08;
    float shininess = 360.0;

    vec3 keySpec = phongLight(
        normal, viewDir, position,
        KEY_LIGHT_POS,
        vec3(0.78, 0.94, 1.0),
        vec3(1.0),
        0.08,
        2.8,
        shininess
    );
    vec3 fillSpec = phongLight(
        normal, viewDir, position,
        FILL_LIGHT_POS,
        vec3(0.92, 0.96, 1.0),
        vec3(1.0),
        0.04,
        2.1,
        shininess * 0.95
    );
    vec3 backSpec = phongLight(
        normal, viewDir, position,
        BACK_LIGHT_POS,
        vec3(1.0, 0.76, 0.92),
        vec3(1.0),
        0.06,
        2.4,
        shininess * 1.08
    );
    vec3 edgeGlow = computeStudioRim(normal, viewDir, vec3(0.88, 0.95, 1.0), 0.18);
    vec3 caustic = vec3(0.92, 0.98, 1.0) *
        pow(max(dot(normalize(KEY_LIGHT_POS - position), reflect(-viewDir, normal)), 0.0), 18.0) * 0.12;
    vec3 glass = mix(refraction, reflection, fresnel);
    vec3 color = glass + keySpec + fillSpec + backSpec + edgeGlow + caustic + albedo * 0.012;
    float specularPeak = max(
        max(max(keySpec.r, keySpec.g), keySpec.b),
        max(max(fillSpec.r, fillSpec.g), fillSpec.b)
    );
    specularPeak = max(specularPeak, max(max(backSpec.r, backSpec.g), backSpec.b));
    float coreAlpha = 0.08;
    float edgeAlpha = mix(coreAlpha, 0.62, fresnel);
    float alpha = clamp(edgeAlpha + specularPeak * 0.045 + edgeGlow.b * 0.03, 0.06, 0.72);

    gl_FragColor = vec4(color, alpha);
}
