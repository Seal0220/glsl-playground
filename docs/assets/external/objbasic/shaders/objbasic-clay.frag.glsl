#extension GL_OES_standard_derivatives : enable

#ifdef GL_ES
precision mediump float;
#endif

// Mode: Clay
#include "shaders/includes/objbasic-fragment-shared.glsl"

void main(void) {
    vec2 uv = v_texcoord;
    vec3 position = v_position.xyz;
    vec3 viewDir = normalize(-position);
    vec3 baseNormal = normalize(v_normal.xyz);
    vec3 normal = sampleSurfaceNormal(uv, position, baseNormal);
    vec3 clayBase = mix(vec3(0.84, 0.78, 0.73), sampleSurfaceAlbedo(uv), 0.16);
    float shadow = computeStudioShadow(normal, position);

    vec3 ambient = clayBase * 0.22;
    vec3 keyLight = phongLight(
        normal, viewDir, position,
        KEY_LIGHT_POS,
        vec3(1.08, 1.02, 0.98) * clayBase,
        vec3(0.36),
        0.92,
        0.20,
        24.0
    );
    vec3 fillLight = phongLight(
        normal, viewDir, position,
        FILL_LIGHT_POS,
        vec3(0.76, 0.79, 0.84) * clayBase,
        vec3(0.20),
        0.58,
        0.10,
        18.0
    );
    vec3 backLight = phongLight(
        normal, viewDir, position,
        BACK_LIGHT_POS,
        vec3(0.85, 0.72, 0.68),
        vec3(0.22),
        0.32,
        0.08,
        14.0
    );
    vec3 rim = computeStudioRim(normal, viewDir, vec3(0.96, 0.92, 0.88), 0.08);
    vec3 color = ambient + (keyLight + fillLight + backLight) * shadow + rim;

    gl_FragColor = vec4(color, 1.0);
}
