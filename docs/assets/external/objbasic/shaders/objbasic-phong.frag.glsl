#extension GL_OES_standard_derivatives : enable

#ifdef GL_ES
precision mediump float;
#endif

// Mode: Phong Shading
#include "shaders/includes/objbasic-fragment-shared.glsl"

void main(void) {
    vec2 uv = v_texcoord;
    vec3 position = v_position.xyz;
    vec3 viewDir = normalize(-position);
    vec3 baseNormal = normalize(v_normal.xyz);
    vec3 normal = sampleSurfaceNormal(uv, position, baseNormal);
    vec3 albedo = sampleSurfaceAlbedo(uv);
    float roughness = sampleSurfaceRoughness(uv);
    float metallic = sampleSurfaceMetallic(uv);
    vec3 specularTint = sampleSurfaceSpecularTint(albedo, metallic);
    float shininess = mix(104.0, 12.0, roughness);
    float specularStrength = mix(1.8, 0.28, roughness);
    float shadow = computeStudioShadow(normal, position);

    vec3 ambient = albedo * 0.14;
    vec3 keyLight = phongLight(
        normal, viewDir, position,
        KEY_LIGHT_POS,
        KEY_LIGHT_COLOR * albedo,
        specularTint,
        1.0,
        specularStrength,
        shininess
    );
    vec3 fillLight = phongLight(
        normal, viewDir, position,
        FILL_LIGHT_POS,
        FILL_LIGHT_COLOR * albedo,
        specularTint * 0.75,
        0.65,
        specularStrength * 0.72,
        shininess * 0.82
    );
    vec3 backLight = phongLight(
        normal, viewDir, position,
        BACK_LIGHT_POS,
        BACK_LIGHT_COLOR * vec3(0.92, 0.68, 0.88),
        vec3(1.0),
        0.45,
        specularStrength * 0.95,
        shininess * 1.08
    );
    vec3 color = ambient + (keyLight + fillLight + backLight) * shadow;
    color += computeStudioRim(normal, viewDir, vec3(0.85, 0.95, 1.0), 0.12);

    gl_FragColor = vec4(color, 1.0);
}
