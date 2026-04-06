#define PI 3.141592654
#define TWOPI 6.283185308
vec2 SphereMap( vec3 ray){      //ray mapping to UV
   vec2 st;
   ray=normalize(ray);
   float radius=length(ray);
   st.y = acos(ray.y/radius) / PI;
   if (ray.z >= 0.0) st.x = acos(ray.x/(radius * sin(PI*(st.y)))) / TWOPI;
   else st.x = 1.0 - acos(ray.x/(radius * sin(PI*(st.y)))) / TWOPI;
   return st;
}
vec2 halfSphereMap( vec3 ray){      //ray mapping to UV
   vec2 st;
   ray=normalize(ray);
   float radius=length(ray);
   st.y = acos(ray.y/radius) / PI;
   if (ray.z >= 0.0) st.x = acos(ray.x/(radius * sin(PI*(st.y)))) / TWOPI;
   else st.x = acos(ray.x/(radius * sin(PI*(st.y)))) / TWOPI;
   return st;
}

vec3 pixel(vec3 p, float scale){
    float unit=1.0/scale;
    if (mod(p.x, unit) < 0.5*unit) return floor(p*scale)/scale;
    else return p;
}

// --------------------------------------------------------
// Toon
// --------------------------------------------------------
vec3 ToonShading(float x){
	vec3 toonColor= vec3(1.0, 1.0, 1.0);
	float level=5.0;
	return toonColor*floor(x*level)/level;
}

// --------------------------------------------------------
// iridescent
// --------------------------------------------------------
vec3 pal( in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d ) {
    return a + b*cos( 6.28318*(c*t+d) );
}
vec3 spectrum(float n) {
    return pal( n, vec3(0.5,0.5,0.5),vec3(0.5,0.5,0.5),vec3(1.0,1.0,1.0),vec3(0.0,0.33,0.67) );
}
vec3 iridescentshading(vec3 pos, vec3 nor, vec3 viewDir) {
    vec3 col = vec3(0.0);
    float NdotV =dot(viewDir, nor);
    col= spectrum( NdotV*2.5);
    //col=pixel(col, 4.0);
    return col;
}

// --------------------------------------------------------
// gooch https://users.cs.northwestern.edu/~ago820/SIG98/gooch98.pdf
// --------------------------------------------------------
vec3 goochshading(vec3 pos, vec3 nor, vec3 viewDir, vec3 lightDir) {
    vec3 col = vec3(0.0);    
    //light needs to be perpendicular to gaze direction
    //vec3 lightDir = -vec3(0.2, 0.0, 0.6);     
    vec3 ref = normalize(reflect(lightDir, nor));
    //vec3 surf = vec3(0.5, 0.5, 0.5);  //kd
    //vec3 warm = vec3(0.3, 0.3, 0.0) + 0.25 * surf;
    //vec3 cool = vec3(0.0, 0.0, 0.35) + 0.25 * surf;
    
	float b = 0.4;
    float y = 0.4;
    float alpha = 0.2;
    float beta = 0.6;
        
    vec3 kblue = vec3(0, 0, b);
    vec3 kyellow = vec3(y, y, 0);
    vec3 kd = vec3(0.650,0.130,0.068);
    vec3 kcool = kblue + alpha*kd;
    vec3 kwarm = kyellow + beta*kd;
 
    float dotLN =dot(lightDir, nor);
    float k = (1.0 + dotLN) / 2.0;
    vec3 gc = k * kcool + (1.0 - k) * kwarm;
    float spe = pow(max( dot( viewDir, ref ), 0.0 ),32.0);
    col = spe + (1.0-spe)*gc;
    return col;
}

// --------------------------------------------------------
// voronoi from Lygia
// --------------------------------------------------------
#define TAU 6.28
#ifndef RANDOM_SCALE
#ifdef RANDOM_HIGHER_RANGE
#define RANDOM_SCALE vec4(.1031, .1030, .0973, .1099)
#else
#define RANDOM_SCALE vec4(443.897, 441.423, .0973, .1099)
#endif
#endif

#ifndef FNC_RANDOM
#define FNC_RANDOM
float random(in float x) {
#ifdef RANDOM_SINLESS
    x = fract(x * RANDOM_SCALE.x);
    x *= x + 33.33;
    x *= x + x;
    return fract(x);
#else
    return fract(sin(x) * 43758.5453);
#endif
}

float random(in vec2 st) {
#ifdef RANDOM_SINLESS
    vec3 p3  = fract(vec3(st.xyx) * RANDOM_SCALE.xyz);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
#else
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453);
#endif
}

float random(in vec3 pos) {
#ifdef RANDOM_SINLESS
    pos  = fract(pos * RANDOM_SCALE.xyz);
    pos += dot(pos, pos.zyx + 31.32);
    return fract((pos.x + pos.y) * pos.z);
#else
    return fract(sin(dot(pos.xyz, vec3(70.9898, 78.233, 32.4355))) * 43758.5453123);
#endif
}

float random(in vec4 pos) {
#ifdef RANDOM_SINLESS
    pos = fract(pos * RANDOM_SCALE);
    pos += dot(pos, pos.wzxy + 33.33);
    return fract((pos.x + pos.y) * (pos.z + pos.w));
#else
    float dot_product = dot(pos, vec4(12.9898,78.233,45.164,94.673));
    return fract(sin(dot_product) * 43758.5453);
#endif
}

vec2 random2(float p) {
    vec3 p3 = fract(vec3(p) * RANDOM_SCALE.xyz);
    p3 += dot(p3, p3.yzx + 19.19);
    return fract((p3.xx + p3.yz) * p3.zy);
}

vec2 random2(vec2 p) {
    vec3 p3 = fract(p.xyx * RANDOM_SCALE.xyz);
    p3 += dot(p3, p3.yzx + 19.19);
    return fract((p3.xx + p3.yz) * p3.zy);
}

vec2 random2(vec3 p3) {
    p3 = fract(p3 * RANDOM_SCALE.xyz);
    p3 += dot(p3, p3.yzx + 19.19);
    return fract((p3.xx + p3.yz) * p3.zy);
}

vec3 random3(float p) {
    vec3 p3 = fract(vec3(p) * RANDOM_SCALE.xyz);
    p3 += dot(p3, p3.yzx + 19.19);
    return fract((p3.xxy + p3.yzz) * p3.zyx); 
}

vec3 random3(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * RANDOM_SCALE.xyz);
    p3 += dot(p3, p3.yxz + 19.19);
    return fract((p3.xxy + p3.yzz) * p3.zyx);
}

vec3 random3(vec3 p) {
    p = fract(p * RANDOM_SCALE.xyz);
    p += dot(p, p.yxz + 19.19);
    return fract((p.xxy + p.yzz) * p.zyx);
}

vec4 random4(float p) {
    vec4 p4 = fract(p * RANDOM_SCALE);
    p4 += dot(p4, p4.wzxy + 19.19);
    return fract((p4.xxyz + p4.yzzw) * p4.zywx);   
}

vec4 random4(vec2 p) {
    vec4 p4 = fract(p.xyxy * RANDOM_SCALE);
    p4 += dot(p4, p4.wzxy + 19.19);
    return fract((p4.xxyz + p4.yzzw) * p4.zywx);
}

vec4 random4(vec3 p) {
    vec4 p4 = fract(p.xyzx * RANDOM_SCALE);
    p4 += dot(p4, p4.wzxy + 19.19);
    return fract((p4.xxyz + p4.yzzw) * p4.zywx);
}

vec4 random4(vec4 p4) {
    p4 = fract(p4  * RANDOM_SCALE);
    p4 += dot(p4, p4.wzxy + 19.19);
    return fract((p4.xxyz + p4.yzzw) * p4.zywx);
}
#endif

#ifndef VORONOI_RANDOM_FNC 
#define VORONOI_RANDOM_FNC(UV) ( 0.5 + 0.5 * sin(time + TAU * random2(UV) ) ); 
#endif

#ifndef FNC_VORONOI
#define FNC_VORONOI
vec3 voronoi(vec2 uv, float time) {
    vec2 i_uv = floor(uv);
    vec2 f_uv = fract(uv);
    vec3 rta = vec3(0.0, 0.0, 10.0);
    for (int j=-1; j<=1; j++ ) {
        for (int i=-1; i<=1; i++ ) {
            vec2 neighbor = vec2(float(i),float(j));
            vec2 point = VORONOI_RANDOM_FNC(i_uv + neighbor);
            point = 0.5 + 0.5 * sin(time + TAU * point);
            vec2 diff = neighbor + point - f_uv;
            float dist = length(diff);
            if ( dist < rta.z ) {
                rta.xy = point;
                rta.z = dist;
            }
        }
    }
    return rta;
}

vec3 voronoi(vec2 p)  { return voronoi(p, 0.0); }
vec3 voronoi(vec3 p)  { return voronoi(p.xy, p.z); }
#endif




// --------------------------------------------------------
// curl noise
// --------------------------------------------------------
//
// Description : Array and textureless GLSL 2D/3D/4D simplex 
//               noise functions.
//      Author : Ian McEwan, Ashima Arts.
//  Maintainer : stegu
//     Lastmod : 20201014 (stegu)
//     License : Copyright (C) 2011 Ashima Arts. All rights reserved.
//               Distributed under the MIT License. See LICENSE file.
//               https://github.com/ashima/webgl-noise
//               https://github.com/stegu/webgl-noise
// 

vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289(vec4 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
     return mod289(((x*34.0)+10.0)*x);
}

vec4 taylorInvSqrt(vec4 r)
{
  return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v)
{ 
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

// First corner
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 =   v - i + dot(i, C.xxx) ;

// Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  //   x0 = x0 - 0.0 + 0.0 * C.xxx;
  //   x1 = x0 - i1  + 1.0 * C.xxx;
  //   x2 = x0 - i2  + 2.0 * C.xxx;
  //   x3 = x0 - 1.0 + 3.0 * C.xxx;
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
  vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y

// Permutations
  i = mod289(i); 
  vec4 p = permute( permute( permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

// Gradients: 7x7 points over a square, mapped onto an octahedron.
// The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)
  float n_ = 0.142857142857; // 1.0/7.0
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  //vec4 s0 = vec4(lessThan(b0,0.0))*2.0 - 1.0;
  //vec4 s1 = vec4(lessThan(b1,0.0))*2.0 - 1.0;
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

//Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

// Mix final noise value
  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 105.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                dot(p2,x2), dot(p3,x3) ) );
}


//==========================================
vec3 snoiseVec3( vec3 x ){
 float s  = snoise(vec3( x ));
 float s1 = snoise(vec3( x.y - 19.1 , x.z + 33.4 , x.x + 47.2 ));
 float s2 = snoise(vec3( x.z + 74.2 , x.x - 124.5 , x.y + 99.4 ));
 vec3 c = vec3( s , s1 , s2 );
 return c;}

vec3 curlNoise( vec3 p ){ 
 const float e = .1;
 vec3 dx = vec3( e   , 0.0 , 0.0 );
 vec3 dy = vec3( 0.0 , e   , 0.0 );
 vec3 dz = vec3( 0.0 , 0.0 , e   );
 vec3 p_x0 = snoiseVec3( p - dx );
 vec3 p_x1 = snoiseVec3( p + dx );
 vec3 p_y0 = snoiseVec3( p - dy );
 vec3 p_y1 = snoiseVec3( p + dy );
 vec3 p_z0 = snoiseVec3( p - dz );
 vec3 p_z1 = snoiseVec3( p + dz );
 float x = p_y1.z - p_y0.z - p_z1.y + p_z0.y;
 float y = p_z1.x - p_z0.x - p_x1.z + p_x0.z;
 float z = p_x1.y - p_x0.y - p_y1.x + p_y0.x;
 const float divisor = 1.0 / ( 2.0 * e );
 return normalize( vec3( x , y , z ) * divisor );
}



