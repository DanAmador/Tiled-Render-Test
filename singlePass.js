import { showResult, initializeRenderer } from './main.js';



let lastSize = 0;
const resolutionSlider = document.getElementById('resolutionSlider');
const blurRadiusSlider = document.getElementById('blurRadiusSlider');
const maskCheckbox = document.getElementById('maskCheckbox');
const resolutionValue = document.getElementById('resolutionValue');
const blurRadiusValue = document.getElementById('blurRadiusValue');
let renderer;
// Update function to call showResult with current values
async function updateResult() {
    const size = parseInt(resolutionSlider.value);
    if (size != lastSize) {
        renderer?.cleanup()
        renderer = await initializeRenderer(parseInt(resolutionSlider.value));
        lastSize = size;
    }
    const blurRadius = parseFloat(blurRadiusSlider.value);
    const withMask = maskCheckbox.checked;

    resolutionValue.textContent = size;
    blurRadiusValue.textContent = blurRadius;

    showResult(blurRadius, withMask);
}

resolutionSlider.addEventListener('input', updateResult);
blurRadiusSlider.addEventListener('input', updateResult);
maskCheckbox.addEventListener('change', updateResult);

updateResult();