#extension GL_OES_standard_derivatives : enable

#ifdef GL_ES
precision mediump float;
#endif

// Mode: Toon Shading
#include "shaders/includes/objbasic-fragment-shared.glsl"

void main(void) {
    vec2 uv = v_texcoord;
    vec3 position = v_position.xyz;
    vec3 viewDir = normalize(-position);
    vec3 baseNormal = normalize(v_normal.xyz);
    vec3 normal = sampleSurfaceNormal(uv, position, baseNormal);
    vec3 albedo = sampleSurfaceAlbedo(uv);
    float roughness = sampleSurfaceRoughness(uv);

    vec3 keyDir = normalize(KEY_LIGHT_POS - position);
    vec3 fillDir = normalize(FILL_LIGHT_POS - position);
    float keyDiffuse = max(dot(normal, keyDir), 0.0);
    float fillDiffuse = max(dot(normal, fillDir), 0.0);
    float bands = ToonShading(keyDiffuse).r;
    float fillBand = floor(fillDiffuse * 3.0) / 4.0;
    float specular = pow(max(dot(viewDir, reflect(-keyDir, normal)), 0.0), mix(56.0, 12.0, roughness));
    float specularMask = step(0.55, specular);
    float rim = step(0.42, pow(1.0 - saturate(dot(normal, viewDir)), 1.45));
    float silhouette = step(0.35, 1.0 - saturate(dot(baseNormal, viewDir)));

    vec3 base = mix(albedo * 0.18, albedo * 1.08, bands);
    base += albedo * fillBand * 0.12;
    base = mix(base, base * 0.78, silhouette * 0.35);

    vec3 color = base;
    color += vec3(1.0) * specularMask * 0.22;
    color += vec3(0.28, 0.52, 1.0) * rim * 0.12;

    gl_FragColor = vec4(color, 1.0);
}
