#extension GL_OES_standard_derivatives : enable

#ifdef GL_ES
precision mediump float;
#endif

// Mode: Gooch Shading
#include "shaders/includes/objbasic-fragment-shared.glsl"

void main(void) {
    vec2 uv = v_texcoord;
    vec3 position = v_position.xyz;
    vec3 viewDir = normalize(-position);
    vec3 baseNormal = normalize(v_normal.xyz);
    vec3 normal = sampleSurfaceNormal(uv, position, baseNormal);
    vec3 tint = sampleSurfaceTint(uv);
    float roughness = sampleSurfaceRoughness(uv);

    vec3 lightDir = normalize(KEY_LIGHT_POS - position);
    float k = (dot(normal, lightDir) + 1.0) * 0.5;
    vec3 cool = vec3(0.06, 0.20, 0.48) + tint * 0.24;
    vec3 warm = vec3(0.92, 0.71, 0.16) + tint * 0.38;
    vec3 gooch = mix(cool, warm, k);
    vec3 fill = mix(vec3(0.05, 0.10, 0.18), tint * 0.18, max(dot(normal, normalize(FILL_LIGHT_POS - position)), 0.0));
    float specular = pow(max(dot(viewDir, reflect(-lightDir, normal)), 0.0), mix(44.0, 10.0, roughness));
    vec3 color = gooch + fill;
    color = mix(color, vec3(1.0), specular * 0.28);
    color += computeStudioRim(normal, viewDir, vec3(0.32, 0.60, 0.95), 0.16);

    gl_FragColor = vec4(color, 1.0);
}
