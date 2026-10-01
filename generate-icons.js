import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const svgBuffer = fs.readFileSync(path.join(__dirname, 'public/icon.svg'));

async function generate() {
  await sharp(svgBuffer).resize(192, 192).png().toFile(path.join(__dirname, 'public/pwa-192x192.png'));
  console.log('Generated pwa-192x192.png');

  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(__dirname, 'public/pwa-512x512.png'));
  console.log('Generated pwa-512x512.png');

  await sharp(svgBuffer).resize(180, 180).png().toFile(path.join(__dirname, 'public/apple-touch-icon.png'));
  console.log('Generated apple-touch-icon.png');

  // Maskable icon with 15% safe padding
  await sharp(svgBuffer)
    .resize(410, 410)
    .extend({
      top: 51,
      bottom: 51,
      left: 51,
      right: 51,
      background: '#0f766e',
    })
    .png()
    .toFile(path.join(__dirname, 'public/pwa-maskable-512x512.png'));
  console.log('Generated pwa-maskable-512x512.png');
}

generate().catch(console.error);
