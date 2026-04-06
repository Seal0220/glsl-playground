#extension GL_OES_standard_derivatives : enable

#ifdef GL_ES
precision mediump float;
#endif

// Mode: Mirror
#include "shaders/includes/objbasic-fragment-shared.glsl"

void main(void) {
    vec2 uv = v_texcoord;
    vec3 position = v_position.xyz;
    vec3 viewDir = normalize(-position);
    vec3 rayDir = -viewDir;
    vec3 baseNormal = normalize(v_normal.xyz);
    vec3 normal = sampleSurfaceNormal(uv, position, baseNormal);
    float roughness = sampleSurfaceRoughness(uv);
    float metallic = sampleSurfaceMetallic(uv);
    float mirrorRoughness = mix(0.008, 0.045, roughness);
    float fresnel = clamp(
        fresnelSchlickScalar(saturate(dot(normal, viewDir)), 0.94) * 1.12,
        0.0,
        1.0
    );
    vec3 envReflection = sampleEnvironment(reflect(rayDir, normal));
    vec3 specularTint = mix(vec3(1.0), vec3(0.94, 0.97, 1.0), metallic * 0.25);
    float shininess = mix(520.0, 220.0, mirrorRoughness);

    vec3 keySpec = phongLight(
        normal, viewDir, position,
        KEY_LIGHT_POS,
        vec3(1.0),
        specularTint,
        0.0,
        3.4,
        shininess
    );
    vec3 fillSpec = phongLight(
        normal, viewDir, position,
        FILL_LIGHT_POS,
        vec3(0.88, 0.92, 1.0),
        specularTint,
        0.0,
        2.1,
        shininess * 0.96
    );
    vec3 backSpec = phongLight(
        normal, viewDir, position,
        BACK_LIGHT_POS,
        vec3(1.0, 0.74, 0.92),
        vec3(1.0),
        0.0,
        2.7,
        shininess * 1.05
    );
    vec3 rim = computeStudioRim(normal, viewDir, vec3(1.0), 0.03);
    vec3 color = envReflection * mix(1.85, 1.45, mirrorRoughness);
    color += (keySpec + fillSpec + backSpec) * mix(1.25, 1.0, mirrorRoughness);
    color += rim;
    color = mix(color, color * 1.16, fresnel);

    gl_FragColor = vec4(color, 1.0);
}
