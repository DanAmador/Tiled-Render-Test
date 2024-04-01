import { TiledRenderer } from './TiledRenderer.js'; // Adjust the path as needed

const resolutionSlider = document.getElementById('resolutionSlider');
const blurRadiusSlider = document.getElementById('blurRadiusSlider');
const maskCheckbox = document.getElementById('maskCheckbox');
const resolutionValue = document.getElementById('resolutionValue');
const blurRadiusValue = document.getElementById('blurRadiusValue');
const tileSizeValue = document.getElementById('tileSizeValue');
const cropper = document.getElementById('cropper');
let tiledRenderer;
let lastSize = 0;
let outputCanvas;
async function initializeTiledRenderer(size, blurRadius) {
    const puzzle = 'hans-gauster-puzzle.jpg';
    const penguin = 'ian-parker-penguin.jpg';
    const uvmap = "uv1.png"
    if(tiledRenderer) tiledRenderer.cleanup();

    tiledRenderer = new TiledRenderer(size, blurRadius);
    await tiledRenderer.initialize(uvmap, penguin);
}

async function updateResult() {
    const size = parseInt(resolutionSlider.value);
    const blurRadius = parseFloat(blurRadiusSlider.value);
    const withMask = maskCheckbox.checked;

    resolutionValue.textContent = size;
    blurRadiusValue.textContent = blurRadius;

    
        await initializeTiledRenderer(size, blurRadius);

    outputCanvas = await tiledRenderer.renderAll(blurRadius, withMask);
    tiledRenderer.updateCanvasInDOM(outputCanvas);
}


cropper.addEventListener('click', () => {
    console.log(tiledRenderer, outputCanvas)
    if (tiledRenderer && outputCanvas) {
      const croppedCanvas = tiledRenderer.cropAndStitch(outputCanvas);
      tiledRenderer.updateCanvasInDOM(croppedCanvas);
    }
  });
resolutionSlider.addEventListener('change', updateResult);
blurRadiusSlider.addEventListener('input', updateResult);
maskCheckbox.addEventListener('change', updateResult);

initializeTiledRenderer(parseInt(resolutionSlider.value));
updateResult();