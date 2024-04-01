precision highp float;

varying vec2 vUv;

#define MAX_BLUR_RADIUS 320

uniform sampler2D tex; // input texture
uniform sampler2D influenceMask;
uniform int uDirection; // 0 - horizontal pass; 1 - vertical pass
uniform int uRadius; // blur radius in pixels
uniform float uKernel[MAX_BLUR_RADIUS * 2 + 1]; // gaussian kernel generated on the cpu
uniform vec2 _size;

uniform vec2 uTileOffset; // Normalized offset of the tile
uniform float uTileSize;  // Normalized size of the tile

vec4 gaussianBlur(vec2 delta, vec2 uv) {
    vec4 col = vec4(0.0);

    float totalWeight = 0.0;
    for(int offset = 0; offset <= MAX_BLUR_RADIUS * 2; ++offset) {
        if(offset > uRadius * 2)
            break;
        vec2 muv = uv + delta * float(offset - uRadius);
        float weight = uKernel[offset];
        vec4 smple = texture2D(tex, muv);
        col += smple * weight;
        totalWeight += weight;
    }
    if(col.a > 0.0) {
        col.rgb /= col.a;
        col.a /= totalWeight;
    }

    return col;
}

void main() {

    vec2 tileUv = (vUv * uTileSize) + uTileOffset;
    // tileUv.y = 1.0-tileUv.y;
    // tileUv.x = 0.0;
    // gl_FragColor = vec4(tileUv, 0,1);
    // gl_FragColor = texture2D(influenceMask, tileUv);

    // delta is dx/dy for individual samples and is modulated by mask input
    vec2 delta = 1.0 / _size * uTileSize;
    vec4 maskSample = texture2D(influenceMask, tileUv);
    if(uDirection == 0) {
        delta.y = 0.0;
    } else {
        delta.x = 0.0;
        tileUv = vUv;
    };

    float influence = (maskSample.r + maskSample.g + maskSample.b) / 3.0 * maskSample.a;
    delta *= influence;

    // gl_FragColor = texture2D(tex, tileUv);
    // gl_FragColor = maskSample;
    gl_FragColor = gaussianBlur(delta, tileUv);
}
