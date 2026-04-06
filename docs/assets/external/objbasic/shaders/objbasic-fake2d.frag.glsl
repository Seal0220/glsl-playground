#extension GL_OES_standard_derivatives : enable

#ifdef GL_ES
precision mediump float;
#endif

// Mode: Fake 2D
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
    float keyLight = max(dot(normal, keyDir), 0.0);
    float fillLight = max(dot(normal, fillDir), 0.0);
    float lit = clamp(keyLight * 0.86 + fillLight * 0.18, 0.0, 1.0);
    float midBand = step(0.24, lit);
    float brightBand = step(0.62, lit);
    float specular = pow(max(dot(viewDir, reflect(-keyDir, normal)), 0.0), mix(72.0, 18.0, roughness));
    float highlight = step(0.58, specular);
    float ndotV = saturate(dot(baseNormal, viewDir));
    float silhouetteWidth = max(fwidth(ndotV) * 2.8, 0.035);
    float outerContour = 1.0 - smoothstep(0.18, 0.18 + silhouetteWidth, ndotV);

    vec3 darkColor = albedo * 0.24 + vec3(0.02, 0.02, 0.03);
    vec3 midColor = albedo * 0.62 + vec3(0.04, 0.03, 0.03);
    vec3 brightColor = albedo * 1.02 + vec3(0.10, 0.08, 0.06);
    vec3 color = darkColor;
    color = mix(color, midColor, midBand);
    color = mix(color, brightColor, brightBand);
    color += vec3(1.0, 0.98, 0.94) * highlight * 0.18;
    color = mix(color, vec3(0.01, 0.01, 0.015), outerContour);

    gl_FragColor = vec4(color, 1.0);
}
