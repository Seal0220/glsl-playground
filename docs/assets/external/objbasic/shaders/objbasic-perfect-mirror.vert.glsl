#extension GL_OES_standard_derivatives : enable

#ifdef GL_ES
precision mediump float;
#endif

// Mode: Perfect Mirror
#include "shaders/includes/objbasic-vertex-shared.glsl"

void main(void) {
    objbasicWriteVertex();
}
