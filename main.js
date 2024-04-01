import { ShaderRenderer } from './ShaderRenderer.js';


Image.LoadAsync = src => new Promise((resolve, reject) => {
    const img = new Image;
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
});

async function loadImage(src, newSize) {
    const img = await Image.LoadAsync(src);
    const canvas = document.createElement('canvas');
    canvas.width = newSize[0];
    canvas.height = newSize[1];
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
}

function makeGaussianKernel(radius) {
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

let renderer, texture, whiteMask, mask, program;

export async function initializeRenderer(resolution) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const gl = canvas.getContext('webgl');
    renderer = new ShaderRenderer([resolution, resolution], gl);
    

    // Load textures and compile shader
    texture = await renderer.loadTex(await loadImage(`hans-gauster-puzzle.jpg`, [resolution, resolution]));
    whiteMask = await renderer.loadTex(null, true);
    mask = await renderer.loadTex(await loadImage(`ian-parker-penguin.jpg`, [resolution, resolution]));
    program = renderer.pipeline(await (await fetch(`blur.frag`)).text());
    return renderer;
}
export async function showResult(blurPercentage, withMask = true) {
    if (!renderer || !texture || !whiteMask || !mask || !program) {
        console.error("Renderer and resources must be initialized first.");
        return;
    }

    const resolution = renderer.size[0];
    const paddingRatio = blurPercentage * .10;
    const blurPadding = Math.floor(paddingRatio * resolution);

    // Render blur
    const uniforms = {
        influenceMask: { type: 'tex', value: withMask ? mask : whiteMask },
        uRadius: { type: 'int', value: blurPadding },
        uKernel: { type: 'float[]', value: makeGaussianKernel(blurPercentage) },
    };
    renderer.clear();
    renderer.render(program, {
        ...uniforms,
        tex: { type: 'tex', value: texture },
        uDirection: { type: 'int', value: 0 }
    }, true);
    renderer.render(program, {
        ...uniforms,
        tex: { type: 'tex', value: 'rt' },
        uDirection: { type: 'int', value: 1 }
    }, true);

    // Obtain and display output image
    const output = await renderer.getRTImage();
    output.id = 'outputImage';

    output.style.maxWidth = '100vw';
    output.style.maxHeight = '100vh';
    const existingOutput = document.getElementById('outputImage');
    if (existingOutput) {
        document.body.replaceChild(output, existingOutput);
    } else {
        document.body.append(output);
    }
}