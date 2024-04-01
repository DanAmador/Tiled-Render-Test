import { trim } from "./trim.js";
export class Cropper {
    constructor() {
        this.cropCommands = [];
    }

    enqueueCropCommand(tile, tileSize, blurPadding) {
        this.cropCommands.push({ tile, tileSize, blurPadding });
    }

    getStartCoordinates(tile, tileSize, blurPadding) {
        const startX = tile.x * (tileSize + blurPadding) + blurPadding / 2 ;
        const startY = tile.y * (tileSize + blurPadding) + blurPadding/ 2  ;
        return { startX, startY };
    }
    executeCropCommands(stitchedCanvas, resolution) {
        const croppedCanvas = document.createElement('canvas');
        croppedCanvas.width =   resolution;
        croppedCanvas.height =  resolution;
        const croppedCtx = croppedCanvas.getContext('2d');

        for (const command of this.cropCommands) {
            const { tile, tileSize, blurPadding } = command;


            const { startX, startY } = this.getStartCoordinates(tile, tileSize, blurPadding);
            const sWidth = tileSize;
            const sHeight = tileSize;

            // Destination coordinates on the cropped canvas
            const dX = tile.x * tileSize;
            const dY = tile.y * tileSize;

            // Crop the tile from the stitched canvas and draw it to the cropped canvas
            croppedCtx.drawImage(stitchedCanvas, startX, startY, sWidth, sHeight, dX, dY, sWidth, sHeight);
        }

        return trim(croppedCanvas);
    }

    
    visualizeCropCommand(ctx, tile, tileSize, blurPadding) {
        const { startX, startY } = this.getStartCoordinates(tile, tileSize, blurPadding);

        // Set the style for the rectangle
        ctx.strokeStyle = 'red'; // Solid red for visibility
        ctx.lineWidth = 1;

        // Draw the rectangle inside the bounds of the tile, excluding the padding
        ctx.strokeRect(startX, startY, tileSize, tileSize);
    }
}
