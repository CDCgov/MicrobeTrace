const fs = require('fs');
const path = require('path');

// Chrome 138+ exposes every inherited CSS custom property through
// getComputedStyle(). html2canvas 1.4.1 copies every returned property into
// every cloned element, which can turn an export into a multi-second main
// thread task. This is the narrow upstream fix from html2canvas PR #3252.
const html2canvasRoot = path.join(__dirname, '..', 'node_modules', 'html2canvas', 'dist');
const targets = [
  path.join(html2canvasRoot, 'html2canvas.js'),
  path.join(html2canvasRoot, 'html2canvas.esm.js'),
  path.join(html2canvasRoot, 'lib', 'dom', 'document-cloner.js'),
];
const original = 'if (ignoredStyleProperties.indexOf(property) === -1) {';
const patched = "if (ignoredStyleProperties.indexOf(property) === -1 && !property.startsWith('--')) {";

for (const target of targets) {
  if (!fs.existsSync(target)) {
    throw new Error(`Expected html2canvas runtime was not installed: ${target}`);
  }

  const source = fs.readFileSync(target, 'utf8');
  if (source.includes(patched)) {
    continue;
  }
  if (!source.includes(original)) {
    throw new Error(`Unable to apply the html2canvas Chrome performance patch to ${target}`);
  }

  fs.writeFileSync(target, source.replace(original, patched), 'utf8');
}

console.log('Applied html2canvas Chrome custom-property performance patch.');
