varying vec4 v_position;
varying vec4 v_normal;
varying vec2 v_texcoord;
varying vec4 v_color;

uniform mat4 u_projectionMatrix;
uniform mat4 u_modelViewMatrix;
uniform mat4 u_normalMatrix;
uniform vec2 u_resolution;
uniform float u_time;

attribute vec4 a_position;
attribute vec4 a_normal;
attribute vec2 a_texcoord;
attribute vec4 a_color;

void objbasicWriteVertex(void) {
    vec4 viewPosition = u_modelViewMatrix * a_position;
    v_position = viewPosition;
    v_normal = normalize(u_normalMatrix * vec4(a_normal.xyz, 0.0));
    v_texcoord = a_texcoord;
    v_color = a_color;
    gl_Position = u_projectionMatrix * viewPosition;
}
