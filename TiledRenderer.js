import { ShaderRenderer } from './ShaderRenderer.js';
import {Cropper} from './Cropper.js';
function delay(duration) {
    return new Promise(resolve => setTimeout(resolve, duration));
}

const MAX_BLUR_RADIUS = 320;
export class TiledRenderer {
    constructor(resolution, blurPercentage, maxTileSize = 2048) {
        this.resolution = resolution;
        this.blurPercentage = blurPercentage;
        this.maxTileSize = maxTileSize;
        this.blurPadding = Math.min(Math.floor(this.blurPercentage * this.resolution * 0.10), maxTileSize * this.blurPercentage);
        this.blurPadding = Math.min(this.blurPadding, MAX_BLUR_RADIUS)
        
        // this.tileSize = minTileSize
        this.tileSize = this.calculateOptimalTileSize();
        this.totalTileSize = this.tileSize + this.blurPadding;
        this.canvas = document.createElement('canvas');
        this.gl = this.canvas.getContext('webgl');
        this.renderer = new ShaderRenderer([this.totalTileSize, this.totalTileSize], this.gl);
        this.tiles = [];
        this.texture = null;
        this.whiteMask = null;
        this.mask = null;
        this.program = null;
        this.active = true;

        this.cropper = new Cropper();

    }

    cleanup() {
        this.active = false;
        this.renderer.cleanup();
        const element = document.getElementById('outputImage');
        if (element) {
            element.remove();
        }
    }
    calculateNumberOfTiles(newResolution) {
        this.resolution = newResolution;
        this.tileSize = this.calculateOptimalTileSize();
        this.totalTileSize = this.tileSize + this.blurPadding;

        const tilesHorizontal = Math.ceil(this.resolution / this.totalTileSize);
        const tilesVertical = Math.ceil(this.resolution / this.totalTileSize);

        return tilesHorizontal * tilesVertical;
    }
    
    // this could for instance be done smarter by checking the memory limits, but right now a hardcoded max size should suffice 
    calculateOptimalTileSize() {
        let currentSize = this.maxTileSize;
        for (let tileSize = 2; tileSize < this.maxTileSize && tileSize < this.resolution; tileSize++) {
            if ((this.resolution % (this.blurPadding + tileSize)) === 0) {
                currentSize = tileSize
            }
        }

        // If no suitable tileSize is found, fall back to the minimum tile size
        return currentSize;
    }
    async initialize(srcTexture, srcMask) {
        this.whiteMask = await this.renderer.loadTex(null, true);
        this.texture = await this.loadTexture(srcTexture, [this.resolution, this.resolution]);
        this.mask = await this.loadTexture(srcMask, [this.resolution, this.resolution]);
        this.program = this.renderer.pipeline(await (await fetch('blur.frag')).text());
        this.calculateTiles();
    }

    async loadTexture(src, size) {
        const img = await TiledRenderer.loadImageAsync(src);
        const canvas = document.createElement('canvas');
        canvas.width = size[0];
        canvas.height = size[1];
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return this.renderer.loadTex(canvas);
    }

    static loadImageAsync(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }

    static makeGaussianKernel(radius) {
        const sigma = radius * 0.4;
        const size = Math.max(3, Math.floor(radius * 2 + 1));
        const center = (size - 1) / 2;
        const kernel = Array(size).fill(0);
        if (sigma == 0) {
            kernel[center] = 1;
        } else {
            for (let i = 0; i <= center; ++i) {
                kernel[center + i] = kernel[center - i] =
                    Math.exp(-i * i / (2 * sigma * sigma));
            }
        }
        return kernel;
    }

    calculateTiles() {
        this.tiles = [];
        const tileAmount = Math.sqrt(this.calculateNumberOfTiles(this.resolution))
        for (let y = tileAmount - 1; y >= 0; y--) {
            for (let x = 0; x < tileAmount; x++) {
                this.tiles.push({ x, y });
            }
        }
    }

    async renderTile(tile, blurPercentage, withMask) {
        if (!this.texture || !this.whiteMask || !this.mask || !this.program) {
            console.error("Renderer and resources must be initialized first.");
            return;
        }
        const normTileSize = 1.0 / Math.sqrt(this.tiles.length);
        const normOffsetX = tile.x * normTileSize;
        const normOffsetY = tile.y * normTileSize;
        const offset = [normOffsetX, normOffsetY];

        let bledPadding = Math.min(normTileSize + normTileSize * (this.blurPadding / this.totalTileSize), 1.0);
        // const normTileSize = Math.sqrt(this.totalTileSize / this.resolution) ;
        // console.log(offset, normTileSize, bledPadding, this.totalTileSize, this.tileSize, this.resolution);
        const uniforms = {
            influenceMask: { type: 'tex', value: withMask ? this.mask : this.whiteMask },
            uRadius: { type: 'int', value: this.blurPadding },
            uKernel: { type: 'float[]', value: TiledRenderer.makeGaussianKernel(this.blurPadding) },
            uTileOffset: { type: 'vec2', value: offset },
            uTileSize: { type: 'float', value: bledPadding },

        };

        this.renderer.clear();
        this.renderer.render(this.program, {
            ...uniforms,
            tex: { type: 'tex', value: this.texture },
            uDirection: { type: 'int', value: 0 }
        }, true);



        this.renderer.render(this.program, {
            ...uniforms,
            tex: { type: 'tex', value: 'rt' },
            uDirection: { type: 'int', value: 1 }
        }, true);

        return await this.renderer.getRTImage();
    }

    async renderAll(blurPercentage, withMask = true, markSeams = true) {
        const stitchedCanvas = document.createElement('canvas');
        stitchedCanvas.width = stitchedCanvas.height = this.resolution;
        const ctx = stitchedCanvas.getContext('2d');

        for (const tile of this.tiles) {
            if (!this.active) return
            const tileImage = await this.renderTile(tile, blurPercentage, withMask);
            ctx.drawImage(tileImage, tile.x * this.totalTileSize,
                tile.y * this.totalTileSize, this.totalTileSize, this.totalTileSize,);

            this.updateCanvasInDOM(stitchedCanvas);

  
            this.markCropPoints(tile, ctx);
            if (markSeams) {
                this.markSeam(tile, ctx);
            }
            await delay(50);
        }

        return stitchedCanvas;

    }

    async updateCanvasInDOM(canvas) {
        if (!canvas) return;
        canvas.id = 'outputImage';

        const existingOutput = document.getElementById('outputImage');
        if (existingOutput) {
            document.body.replaceChild(canvas, existingOutput);
        } else {
            document.body.appendChild(canvas);
        }
    }
    cropAndStitch(stitchedCanvas) {
        return this.cropper.executeCropCommands(stitchedCanvas, this.resolution);
    }
    markCropPoints(tile, ctx) {
        this.cropper.enqueueCropCommand(tile, this.tileSize, this.blurPadding);
        this.cropper.visualizeCropCommand(ctx, tile, this.tileSize, this.blurPadding);
    }

    markSeam(tile, ctx) {
        ctx.strokeStyle = 'rgba(0, 255, 255, 1.0)';
        ctx.lineWidth = 2;
        ctx.strokeRect(tile.x * this.totalTileSize, tile.y * this.totalTileSize, this.totalTileSize, this.totalTileSize);

    }
}
