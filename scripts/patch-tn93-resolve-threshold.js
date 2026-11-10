const fs = require('fs');
const path = require('path');

// tn93.js 0.3.5 has two regressions in its integer-encoded RESOLVE path:
// c1/c2 are block-scoped before they are inspected, and onInts does not accept
// the ambiguity-fraction argument that its implementation already uses. Keep
// the installed runtime aligned with the string and SeqRuler implementations.
const target = path.join(__dirname, '..', 'node_modules', 'tn93', 'dist', 'tn93.js');
const brokenScope = `      if (usingIntegerEncoding) {
        let c1 = s1[i];
        let c2 = s2[i];
      } else {
        let c1 = mapChar[s1.charCodeAt(i)];
        let c2 = mapChar[s2.charCodeAt(i)];
      }
      if (resolvable(c1, c2))`;
const fixedScope = `      let c1;
      let c2;
      if (usingIntegerEncoding) {
        c1 = s1[i];
        c2 = s2[i];
      } else {
        c1 = mapChar[s1.charCodeAt(i)];
        c2 = mapChar[s2.charCodeAt(i)];
      }
      if (resolvable(c1, c2))`;
const brokenSignature = 'tn93.onInts = function(s1, s2, matchMode){';
const fixedSignature = 'tn93.onInts = function(s1, s2, matchMode, maxAmbigFraction=1){';

if (!fs.existsSync(target)) {
  throw new Error(`Expected tn93 runtime was not installed: ${target}`);
}

let source = fs.readFileSync(target, 'utf8');

if (!source.includes(fixedScope)) {
  if (!source.includes(brokenScope)) {
    throw new Error(`Unable to repair TN93 ambiguity counting in ${target}`);
  }
  source = source.replace(brokenScope, fixedScope);
}

if (!source.includes(fixedSignature)) {
  if (!source.includes(brokenSignature)) {
    throw new Error(`Unable to repair the TN93 integer API in ${target}`);
  }
  source = source.replace(brokenSignature, fixedSignature);
}

fs.writeFileSync(target, source, 'utf8');
console.log('Applied TN93 Resolve ambiguity-threshold patch.');
