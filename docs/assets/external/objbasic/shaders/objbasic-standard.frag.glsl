#extension GL_OES_standard_derivatives : enable

#ifdef GL_ES
precision mediump float;
#endif

// Mode: Standard
#include "shaders/includes/objbasic-fragment-shared.glsl"

void main(void) {
    vec2 uv = v_texcoord;
    vec3 position = v_position.xyz;
    vec3 viewDir = normalize(-position);
    vec3 baseNormal = normalize(v_normal.xyz);
    vec3 normal = normalize(mix(baseNormal, sampleSurfaceNormal(uv, position, baseNormal), 0.58));
    vec3 albedo = sampleSurfaceAlbedo(uv);
    float roughness = sampleSurfaceRoughness(uv);
    float metallic = sampleSurfaceMetallic(uv);
    float keyFacing = max(dot(normal, normalize(KEY_LIGHT_POS - position)), 0.0);
    float softShadow = mix(0.82, 1.0, keyFacing);

    vec3 specularTint = mix(vec3(0.035), vec3(1.0), metallic * 0.22);
    float shininess = mix(84.0, 14.0, roughness);
    float specularStrength = mix(0.42, 0.05, roughness) * mix(0.96, 1.08, metallic);

    vec3 ambient = albedo * 0.32;
    vec3 bounce = albedo * vec3(1.0, 0.975, 0.95) * (0.08 + 0.12 * saturate(normal.y * 0.5 + 0.5));
    vec3 keyLight = phongLight(
        normal, viewDir, position,
        KEY_LIGHT_POS,
        albedo * vec3(1.0, 0.99, 0.96) * 1.7,
        specularTint,
        1.0,
        specularStrength,
        shininess
    );
    vec3 fillLight = phongLight(
        normal, viewDir, position,
        FILL_LIGHT_POS,
        albedo * vec3(0.98, 0.99, 1.0) * 0.68,
        specularTint * 0.62,
        0.58,
        specularStrength * 0.56,
        shininess * 0.82
    );
    vec3 backLight = phongLight(
        normal, viewDir, position,
        BACK_LIGHT_POS,
        albedo * vec3(1.0, 1.0, 1.0) * 0.24,
        vec3(1.0),
        0.2,
        specularStrength * 0.28,
        shininess * 0.72
    );
    vec3 rim = computeStudioRim(normal, viewDir, vec3(1.0), 0.008);

    vec3 color = ambient + bounce + (keyLight + fillLight + backLight) * softShadow;
    color += rim;
    color = mix(albedo * 0.7, color, 0.82);
    color *= 1.12;
    gl_FragColor = vec4(color, 1.0);
}
