
export class ShaderRenderer {
    
    gl;
    vertexBuffer; // screensized tri
    size = [-1,-1];
    renderTargets = [];
    rtIdx = 0;
    
    cleanup() {
        // Delete textures
        if (this.texture) this.gl.deleteTexture(this.texture);
        if (this.whiteMask) this.gl.deleteTexture(this.whiteMask);
        if (this.mask) this.gl.deleteTexture(this.mask);

        // Delete shader program
        if (this.program) {
            this.gl.deleteProgram(this.program);
        }
    }
    constructor (size, gl) {
        this.gl = gl;
        this.setSize(size);
        
        // Create vertex buffer
        const vertexBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertexBuffer);
        const vertices = new Float32Array([
            -2, -1,
            1,  2,
            1, -1
        ]);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
        this.vertexBuffer = vertexBuffer;
    }
    
    RenderTarget = class {
        tex;
        framebuffer;
        constructor (size, gl) {
            // create render target
            this.tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size[0], size[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            
            // create framebuffer
            this.framebuffer = gl.createFramebuffer();
        }
        bind (gl) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
        }
    }
    
    #updateViewport () {
        this.gl.viewport(0, 0, this.size[0], this.size[1]);
        if (this.gl.canvas.width == this.size[0] && this.gl.canvas.height == this.size[1]) return;
        this.gl.canvas.width = this.size[0];
        this.gl.canvas.height = this.size[1];
    }
    
    setSize (size) {
        if (this.size[0] == size[0] && this.size[1] == size[1]) {
            return;
        }
        this.size = size;
        
        // assumes a browser context
        this.#updateViewport();
        
        this.renderTargets = [
            new this.RenderTarget(size, this.gl),
            new this.RenderTarget(size, this.gl)
        ];
        
        this.clear();
    }
    
    async loadTex (source, defaultToWhite = false) {
        const tex = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
        if (source === null) {
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, 1, 1, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, new Uint8Array((new Array(4)).fill(defaultToWhite ? 255 : 0)));
        } else if (typeof source == 'string') {
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, await Image.LoadAsync(source));
        } else if (source instanceof HTMLImageElement || source instanceof HTMLCanvasElement) {
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, source);
        } else {
            console.error(`Invalid source type in loadTex:`, source, `(should be null, base64 png string or HTMLImageElement)`);
            throw new Error(`Invalid source type in loadTex, see console for details.`);
        }
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        return tex;
    }
    
    #compileShader(glsl, type) {
        const shader = this.gl.createShader(type);
        if (shader === null || shader === undefined) {
            console.warn('WebGL context was lost, cannot create shader object from source!');
            throw new Error('Lost WebGL context.');
        }
    
        // Adding line numbers to the shader source for easier debugging
        const numberedGLSL = glsl.split('\n').map((line, index) => `${index + 1}: ${line}`).join('\n');
    
        this.gl.shaderSource(shader, glsl);
        this.gl.compileShader(shader);
    
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Could not compile shader from source:');
            console.error(this.gl.getShaderInfoLog(shader));
    
            // Display the shader source with line numbers for reference
            console.error('Shader source with line numbers:\n' + numberedGLSL);
    
            throw new Error('Failed to compile shader!');
        }
        return shader;
    }
    
    
    pipeline (frag) {
        const uv = typeof frag == 'object' ? frag.uv : 'vUv';
        const vertShader = this.#compileShader(`
            attribute vec2 aPosition;
            varying vec2 ${uv};
            
            void main() {
                ${uv} = aPosition + 0.5;
                gl_Position = vec4(aPosition * 2.0, 0.0, 1.0);
            }
        `, this.gl.VERTEX_SHADER);
        const fragShader = this.#compileShader(typeof frag == 'object' ? frag.shader : frag, this.gl.FRAGMENT_SHADER);
        const program = this.gl.createProgram();
        this.gl.attachShader(program, vertShader);
        this.gl.attachShader(program, fragShader);
        this.gl.linkProgram(program);
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.error('Could not link pipeline program:', this.gl.getProgramInfoLog(program));
            throw new Error('Failed to link pipeline program!');
        }
        return program;
    }
    
    #setUniform (program, name, type, value, texIdx, rt) {
        const loc = this.gl.getUniformLocation(program, name);
        if (type == 'tex') {
            // Bind texture
            this.gl.activeTexture(this.gl.TEXTURE0 + texIdx.val);
            this.gl.bindTexture(this.gl.TEXTURE_2D, value == 'rt' ? rt : value);
            this.gl.uniform1i(loc, texIdx.val);
            ++texIdx.val;
        } else if (type == 'tv') {
            const size = value.length;
            const indices = [];
            for (let i = 0; i < size; ++i) {
                this.gl.activeTexture(this.gl.TEXTURE0 + texIdx.val);
                this.gl.bindTexture(this.gl.TEXTURE_2D, value[i] == 'rt' ? rt : value);
                indices.push(texIdx.val);
                ++texIdx.val;
            }
            this.gl.uniform1iv(loc, indices);
        } else switch (type) {
            case 'float':
                this.gl.uniform1f(loc, value);
                break;
            case 'float[]':
                this.gl.uniform1fv(loc, value);
                break;
            case 'int':
                this.gl.uniform1i(loc, value);
                break;
            case 'int[]':
                this.gl.uniform1iv(loc, value);
                break;
            case 'vec2':
                this.gl.uniform2f(loc, value[0], value[1]);
                break;
            case 'vec3':
                this.gl.uniform3f(loc, value[0], value[1], value[2]);
                break;
            case 'vec4':
                this.gl.uniform4f(loc, value[0], value[1], value[2], value[3]);
                break;
            case 'vec4[]':
                this.gl.uniform4fv(loc, value);
                break;
            default:
                console.error('Unknown uniform type', type, 'for uniform', name, '!!');
                throw new Error('Undefined uniform type, see console.');
        }
    }
    
    render (program, uniforms, toRT) {
        
        this.#updateViewport();
        
        this.rtIdx = 1 - this.rtIdx; // swap
        if (toRT) {
            this.renderTargets[this.rtIdx].bind(this.gl);
        } else {
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null); // to canvas
        }
        
        // bind program
        this.gl.useProgram(program);
        
        // bind geometry
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        const aPositionAttrib = this.gl.getAttribLocation(program, 'aPosition');
        this.gl.enableVertexAttribArray(aPositionAttrib);
        this.gl.vertexAttribPointer(aPositionAttrib, 2, this.gl.FLOAT, false, 0, 0);
        
        // update uniforms
        let texIdx = { val: 0 };
        this.#setUniform(program, '_size', 'vec2', this.size, texIdx);
        for (const key of Object.keys(uniforms)) {
            this.#setUniform(program, key, uniforms[key].type, uniforms[key].value, texIdx, this.renderTargets[1-this.rtIdx].tex);
        }
        
        // render to framebuffer
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
    }
    
    clear () {
        for (const rt of this.renderTargets) {
            rt.bind(this.gl);
            this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        }
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null); // to canvas
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        this.rtIdx = 0;
    }
    
    async getRTImage () {
        const srcRT = this.renderTargets[this.rtIdx];
        srcRT.bind(this.gl);
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(this.size[0]);
        canvas.height = Math.floor(this.size[1]);
        const data = new Uint8Array(canvas.width * canvas.height * 4);
        this.gl.readPixels(0, 0, canvas.width, canvas.height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, data);
        const ctx = canvas.getContext('2d');
        const imgData = ctx.createImageData(canvas.width, canvas.height);
        imgData.data.set(data);
        ctx.putImageData(imgData, 0, 0);
        return canvas;
    }
    
}
