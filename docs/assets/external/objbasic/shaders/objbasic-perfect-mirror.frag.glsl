#extension GL_OES_standard_derivatives : enable

#ifdef GL_ES
precision mediump float;
#endif

// Mode: Perfect Mirror
#include "shaders/includes/objbasic-fragment-shared.glsl"

void main(void) {
    vec3 position = v_position.xyz;
    vec3 viewDir = normalize(-position);
    vec3 rayDir = -viewDir;
    vec3 normal = normalize(v_normal.xyz);
    vec3 reflected = sampleEnvironment(reflect(rayDir, normal));
    float fresnel = clamp(
        fresnelSchlickScalar(saturate(dot(normal, viewDir)), 0.97) * 1.22,
        0.0,
        1.0
    );
    float shininess = 960.0;

    vec3 keySpec = phongLight(
        normal, viewDir, position,
        KEY_LIGHT_POS,
        vec3(1.0),
        vec3(1.0),
        0.0,
        5.4,
        shininess
    );
    vec3 fillSpec = phongLight(
        normal, viewDir, position,
        FILL_LIGHT_POS,
        vec3(0.92, 0.96, 1.0),
        vec3(1.0),
        0.0,
        3.1,
        shininess * 0.98
    );
    vec3 backSpec = phongLight(
        normal, viewDir, position,
        BACK_LIGHT_POS,
        vec3(1.0, 0.8, 0.95),
        vec3(1.0),
        0.0,
        4.4,
        shininess * 1.04
    );
    vec3 rim = computeStudioRim(normal, viewDir, vec3(1.0), 0.015);

    vec3 color = reflected * 2.05;
    color += keySpec + fillSpec + backSpec + rim;
    color = mix(color, color * 1.24, fresnel);

    gl_FragColor = vec4(color, 1.0);
}
