#extension GL_OES_standard_derivatives : enable

#ifdef GL_ES
precision mediump float;
#endif

// Mode: X-Ray
#include "shaders/includes/objbasic-fragment-shared.glsl"

void main(void) {
    vec2 uv = v_texcoord;
    vec3 position = v_position.xyz;
    vec3 viewDir = normalize(-position);
    vec3 baseNormal = normalize(v_normal.xyz);
    vec3 normal = sampleSurfaceNormal(uv, position, baseNormal);
    vec3 env = sampleEnvironment(reflect(-viewDir, normal));
    float shell = pow(1.0 - saturate(dot(normal, viewDir)), 2.0);
    float core = pow(saturate(dot(normal, viewDir)), 1.5);
    float stripeA = 0.5 + 0.5 * sin((position.y + position.x * 0.30) * 26.0);
    float stripeB = 0.5 + 0.5 * cos((position.x - position.y * 0.35) * 18.0);
    vec3 tint = mix(vec3(0.06, 0.75, 1.0), vec3(0.65, 1.0, 0.98), stripeA * 0.35);
    vec3 shellColor = tint * shell * 0.95;
    vec3 interior = vec3(0.72, 0.94, 1.0) * core * 0.18;
    vec3 scan = vec3(0.10, 0.88, 1.0) * (stripeA * stripeB) * 0.14;
    vec3 backGlow = vec3(0.85, 0.97, 1.0) *
        max(dot(normal, normalize(BACK_LIGHT_POS - position)), 0.0) * 0.22;
    vec3 color = shellColor + interior + scan + env * 0.08 + backGlow;

    gl_FragColor = vec4(color, 1.0);
}
