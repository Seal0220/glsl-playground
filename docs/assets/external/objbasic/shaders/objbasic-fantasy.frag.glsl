#extension GL_OES_standard_derivatives : enable

#ifdef GL_ES
precision mediump float;
#endif

// Mode: Fantasy
#include "shaders/includes/objbasic-fragment-shared.glsl"

void main(void) {
    vec2 uv = v_texcoord;
    vec3 position = v_position.xyz;
    vec3 viewDir = normalize(-position);
    vec3 rayDir = -viewDir;
    vec3 baseNormal = normalize(v_normal.xyz);
    vec3 normal = sampleSurfaceNormal(uv, position, baseNormal);
    vec3 albedo = sampleSurfaceAlbedo(uv);
    vec3 tint = sampleSurfaceTint(uv);
    float roughness = sampleSurfaceRoughness(uv);
    float metallic = sampleSurfaceMetallic(uv);
    vec3 specularTint = sampleSurfaceSpecularTint(tint, metallic);
    float shininess = computeLocalShininess(roughness);
    float specularStrength = computeLocalSpecularStrength(roughness);
    float reflectionStrength = computeLocalReflectionStrength(roughness);
    float refractionStrength = computeLocalRefractionStrength(roughness);
    float fresnel = computeGlassFresnel(normal, viewDir);
    float shadow = computeStudioShadow(normal, position);

    vec3 reflection = sampleGlassReflection(rayDir, normal, tint);
    vec3 refraction = sampleGlassRefraction(rayDir, normal, tint);
    vec3 ambient = tint * u_ambientStrength;
    vec3 keyLight = phongLight(
        normal, viewDir, position,
        KEY_LIGHT_POS,
        KEY_LIGHT_COLOR * tint,
        specularTint * vec3(0.0, 1.0, 0.45),
        u_diffuseStrength,
        specularStrength,
        shininess
    );
    vec3 fillLight = phongLight(
        normal, viewDir, position,
        FILL_LIGHT_POS,
        FILL_LIGHT_COLOR * tint,
        specularTint * vec3(0.11, 0.33, 0.28),
        u_diffuseStrength * u_fillLightStrength,
        specularStrength * 0.65,
        shininess * 0.8
    );
    vec3 backLight = phongLight(
        normal, viewDir, position,
        BACK_LIGHT_POS,
        BACK_LIGHT_COLOR,
        specularTint * vec3(1.0, 0.45, 0.85),
        u_diffuseStrength * u_backLightStrength,
        specularStrength * 0.85,
        shininess * 1.2
    );
    vec3 rim = computeStudioRim(normal, viewDir, vec3(0.55, 0.75, 1.0), u_rimStrength);
    vec3 studio = ambient + (keyLight + fillLight + backLight) * shadow + rim;
    vec3 glass = mix(
        refraction * refractionStrength,
        reflection * reflectionStrength,
        fresnel
    );

    vec3 color = glass + studio + albedo * 0.03;
    gl_FragColor = vec4(color, 1.0);
}
