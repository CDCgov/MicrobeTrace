;(function(){
  "use strict";

  // Valid matchModes include "RESOLVE", "AVERAGE", "SKIP", "GAPMM"
  function tn93(s1, s2, matchMode){
    if(!matchMode) matchMode = "AVERAGE";
    const L = Math.min(s1.length, s2.length);

    let dist = 0;
    let pairwiseCounts = [
            /* A, C, G, T */
      /* A */ [0, 0, 0, 0],
      /* C */ [0, 0, 0, 0],
      /* G */ [0, 0, 0, 0],
      /* T */ [0, 0, 0, 0]
    ];

    const all_pairwise_counts_array = {}
    if(matchMode == 'SKIP'){
      for (let p = 0; p < L; p++){
        let c1 = mapChar[s1.charCodeAt(p)];
        let c2 = mapChar[s2.charCodeAt(p)];
        if (c1 < 4 && c2 < 4){
          pairwiseCounts[c1][c2] += 1;
        }
        all_pairwise_counts_array[p] = JSON.parse(JSON.stringify(pairwiseCounts));
      }
    } else if(matchMode == 'GAPMM'){
      for (let p = 0; p < L; p++){
        let c1 = mapChar[s1.charCodeAt(p)];
        let c2 = mapChar[s2.charCodeAt(p)];

        if (c1 < 4 && c2 < 4){
          pairwiseCounts[c1][c2] += 1;
        } else { // not both resolved
          if (c1 == 17 || c2 == 17){
            if (c1 == 17 && c2 == 17){
              continue;
            } else {
              if (c1 == 17){
                c1 = 15;
              } else {
                c2 = 15;
              }
            }
          }

          if (c1 < 4){ // c1 resolved and c2 is not
            if (resolutionsCount[c2] > 0){
              for(let j = 0; j < 4; j++){
                if (resolutions[c2][j]){
                  pairwiseCounts[c1][j] += resolutionsCount[c2];
                }
              }
            }
          } else {
            if (c2 < 4){ // c2 resolved an c1 is not
              if (resolutionsCount[c1] > 0){
                for(let j = 0; j < 4; j++){
                  if (resolutions[c1][j]){
                    pairwiseCounts[j][c2] += resolutionsCount[c1];
                  }
                }
              }
            } else {
              // ambig and ambig
              let norm = resolutionsCount[c1] * resolutionsCount[c2];
              if (norm > 0.0){
                for (let j = 0; j < 4; j++){
                  if (resolutions[c1][j]){
                    for (let k = 0; k < 4; k++){
                      if (resolutions[c2][k]){
                        pairwiseCounts[j][k] += norm;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else if(matchMode == 'RESOLVE'){
      for (let p = 0; p < L; p++){
        let c1 = mapChar[s1.charCodeAt(p)];
        let c2 = mapChar[s2.charCodeAt(p)];

        if (c1 < 4 && c2 < 4){
          pairwiseCounts[c1][c2] += 1;
        } else { // not both resolved
          if (c1 == 17 || c2 == 17) continue;
          if (c1 < 4){ // c1 resolved and c2 is not
            if (resolutionsCount[c2] > 0){
              if (resolutions[c2][c1]){
                pairwiseCounts[c1][c1] += 1;
                continue;
              }
              for(let j = 0; j < 4; j++){
                if (resolutions[c2][j]){
                  pairwiseCounts[c1][j] += resolutionsCount[c2];
                }
              }
            }
          } else {
            if (c2 < 4){ // c2 resolved an c1 is not
              if (resolutionsCount[c1] > 0){
                if (resolutions[c1][c2]){
                  pairwiseCounts[c2][c2] += 1;
                  continue;
                }
                for(let j = 0; j < 4; j++){
                  if (resolutions[c1][j]){
                    pairwiseCounts[j][c2] += resolutionsCount[c1];
                  }
                }
              }
            } else {
              // ambig and ambig
              let norm = resolutionsCount[c1] * resolutionsCount[c2];
              if (norm > 0.0){
                let matched_count = 0;
                let positive_match = [false, false, false, false];
                for (let j = 0; j < 4; j++){
                  if (resolutions[c1][j] && resolutions[c2][j]){
                    matched_count++;
                    positive_match[j] = true;
                  }
                }

                if (matched_count > 0){
                  let norm2 = 1/matched_count;
                  for (let j = 0; j < 4; j++){
                    if (positive_match[j]){
                      pairwiseCounts[j][j] += norm2;
                    }
                  }
                  continue;
                }

                for (let j = 0; j < 4; j++){
                  if (resolutions[c1][j]){
                    for (let k = 0; k < 4; k++){
                      if (resolutions[c2][k]){
                        pairwiseCounts[j][k] += norm;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else {
      for (let p = 0; p < L; p++){
        let c1 = mapChar[s1.charCodeAt(p)];
        let c2 = mapChar[s2.charCodeAt(p)];

        if (c1 < 4 && c2 < 4){
          pairwiseCounts[c1][c2] += 1;
        } else { // not both resolved
          if (c1 == 17 || c2 == 17) continue;
          if (c1 < 4){ // c1 resolved and c2 is not
            if (resolutionsCount[c2] > 0){
              for(let j = 0; j < 4; j++){
                if (resolutions[c2][j]){
                  pairwiseCounts[c1][j] += resolutionsCount[c2];
                }
              }
            }
          } else {
            if (c2 < 4){ // c2 resolved an c1 is not
              if (resolutionsCount[c1] > 0){
                for(let j = 0; j < 4; j++){
                  if (resolutions[c1][j]){
                    pairwiseCounts[j][c2] += resolutionsCount[c1];
                  }
                }
              }
            } else {
              // ambig and ambig
              let norm = resolutionsCount[c1] * resolutionsCount[c2];
              if (norm > 0.0){
                for (let j = 0; j < 4; j++){
                  if (resolutions[c1][j]){
                    for (let k = 0; k < 4; k++){
                      if (resolutions[c2][k]){
                        pairwiseCounts[j][k] += norm;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    // const fs = require('fs');
    // fs.writeFileSync("tn93_js_pairwise_counts.json", JSON.stringify(all_pairwise_counts_array));

    // console.log(pairwiseCounts);
    let nucFreq = [0, 0, 0, 0];
    for (let c1 = 0; c1 < 4; c1++){
      for (let c2 = 0; c2 < 4; c2++){
        nucFreq[c1] += pairwiseCounts[c1][c2];
        nucFreq[c2] += pairwiseCounts[c1][c2];
      }
    }

    let totalNonGap	= 2/(nucFreq[0] + nucFreq[1] + nucFreq[2] + nucFreq[3]);
    let AG = (pairwiseCounts[0][2] + pairwiseCounts[2][0]) * totalNonGap;
    let CT = (pairwiseCounts[1][3] + pairwiseCounts[3][1]) * totalNonGap;
    let tv = 1-((pairwiseCounts[0][0] + pairwiseCounts[1][1] + pairwiseCounts[2][2] + pairwiseCounts[3][3]) * totalNonGap + AG + CT);
    // console.log(`AG=${AG} CT=${CT} tv=${tv}`);
    if (nucFreq[0] == 0 || nucFreq[1] == 0 || nucFreq[2] == 0 || nucFreq[3] == 0){
      AG = 1 - 2 * (AG + CT) - tv;
      CT = 1 - 2 * tv;
      if (AG > 0 && CT > 0){
        dist = -0.5 * Math.log(AG) - 0.25 * Math.log(CT);
      } else {
        dist = 1.0;
      }
    } else {
      const auxd = 1/(nucFreq[0] + nucFreq[1] + nucFreq[2] + nucFreq[3]);
      let nucF = [0, 0, 0, 0];
      for (let aux1 = 0; aux1 < 4; aux1++){
        nucF[aux1] = nucFreq[aux1] * auxd;
      }
      const fR = nucF[0] + nucF[2];
      const fY = nucF[1] + nucF[3];
      const K1 = 2 * nucF[0] * nucF[2] / fR;
      const K2 = 2 * nucF[1] * nucF[3] / fY;
      const K3 = 2 * (fR * fY - nucF[0] * nucF[2] * fY / fR - nucF[1] * nucF[3] * fR / fY);
      // console.log(`auxd=${auxd} fR=${fR} fY=${fY} K1=${K1} K2=${K2} K3=${K3}`);
      AG	= 1 - AG / K1 - 0.5 * tv / fR;
      CT	= 1 - CT / K2 - 0.5 * tv / fY;
      tv  = 1 - 0.5 * tv / fY / fR;
      dist = -K1 * Math.log(AG) - K2 * Math.log(CT) - K3 * Math.log(tv);
    }
    // console.log(dist);
    return(dist);
  }

// For an Explanation of these codes, see [this Wikipedia Article on Nucleic Acid Notation](https://en.wikipedia.org/wiki/Nucleic_acid_notation)
const mapChar = Array(256).fill(16);
      mapChar[45]  = 17; // GAP
      mapChar[65]  =  0; // A
      mapChar[66]  = 11; // B
      mapChar[67]  =  1; // C
      mapChar[68]  = 12; // D
      mapChar[71]  =  2; // G
      mapChar[72]  = 13; // H
      mapChar[75]  =  9; // K
      mapChar[77]  = 10; // M
      mapChar[78]  = 15; // N
      mapChar[82]  =  5; // R
      mapChar[83]  =  7; // S
      mapChar[84]  =  3; // T
      mapChar[85]  =  4; // U
      mapChar[86]  = 14; // V
      mapChar[87]  =  8; // W
      mapChar[89]  =  6; // Y
      mapChar[97]  =  0; // a
      mapChar[98]  = 11; // b
      mapChar[99]  =  1; // c
      mapChar[100] = 12; // d
      mapChar[103] =  2; // g
      mapChar[104] = 13; // h
      mapChar[107] =  9; // k
      mapChar[109] = 10; // m
      mapChar[110] = 15; // n
      mapChar[114] =  5; // r
      mapChar[115] =  7; // s
      mapChar[116] =  3; // t
      mapChar[117] =  4; // u
      mapChar[118] = 14; // v
      mapChar[119] =  8; // w
      mapChar[121] =  6; // y
  tn93.mapChar = mapChar;

  const resolutions = [
  /* A,C,G,T */
    [1,0,0,0], // A             -> A (0) (Adenine)
    [0,1,0,0], // C             -> C (1) (Cytosine)
    [0,0,1,0], // G             -> G (2) (Guanine)
    [0,0,0,1], // T             -> T (3) (Thymine)
    [0,0,0,1], // T             -> U (4) (Uracil)
    [1,0,1,0], // A | G         -> R (5) (Either Purine)
    [0,1,0,1], // C | T         -> Y (6) (Either Pyrimidine)
    [0,1,1,0], // C | G         -> S (7)
    [1,0,0,1], // A | T         -> W (8)
    [0,0,1,1], // G | T         -> K (9)
    [1,1,0,0], // A | C         -> M (10)
    [0,1,1,1], // C | G | T     -> B (11) (Not Adenine)
    [1,0,1,1], // A | G | T     -> D (12) (Not Cytosine)
    [1,1,0,1], // A | C | T     -> H (13) (Not Guanine)
    [1,1,1,0], // A | C | G     -> V (14) (Not Thymine)
    [1,1,1,1], // A | C | G | T -> N (15)
    [1,1,1,1], // A | C | G | T -> ? (16)
    [0,0,0,0]  // GAP
  ];
  tn93.resolutions = resolutions;

  const resolutionsCount = [
    1.0,     // A
    1.0,     // C
    1.0,     // G
    1.0,     // T
    1.0,     // U
    1.0/2.0, // R
    1.0/2.0, // Y
    1.0/2.0, // S
    1.0/2.0, // S
    1.0/2.0, // W
    1.0/2.0, // K
    1.0/2.0, // M
    1.0/3.0, // B
    1.0/3.0, // D
    1.0/3.0, // H
    1.0/3.0, // V
    1.0/4.0, // N
    1.0/4.0, // ?
    0.0      // GAP
  ];
  tn93.resolutionsCount = resolutionsCount;

  tn93.toInts = function(sequence){
    const n = sequence.length;
    let output = new Uint8Array(n);
    for(let i = 0; i < n; i++){
      output[i] = mapChar[sequence.charCodeAt(i)];
    }
    return output;
  };

  // Valid matchModes include "RESOLVE", "AVERAGE", "SKIP", "GAPMM"
  tn93.onInts = function(s1, s2, matchMode){
    if(!matchMode) matchMode = "AVERAGE";
    const L = Math.min(s1.length, s2.length);

    let dist = 0;
    let pairwiseCounts = [
            /* A, C, G, T */
      /* A */ [0, 0, 0, 0],
      /* C */ [0, 0, 0, 0],
      /* G */ [0, 0, 0, 0],
      /* T */ [0, 0, 0, 0]
    ];

    if(matchMode == 'SKIP'){
      for (let p = 0; p < L; p++){
        let c1 = s1[p];
        let c2 = s2[p];
        if (c1 < 4 && c2 < 4){
          pairwiseCounts[c1][c2] += 1;
        }
      }
    } else if(matchMode == 'GAPMM'){
      for (let p = 0; p < L; p++){
        let c1 = s1[p];
        let c2 = s2[p];

        if (c1 < 4 && c2 < 4){
          pairwiseCounts[c1][c2] += 1;
        } else { // not both resolved
          if (c1 == 17 || c2 == 17){
            if (c1 == 17 && c2 == 17){
              continue;
            } else {
              if (c1 == 17){
                c1 = 15;
              } else {
                c2 = 15;
              }
            }
          }

          if (c1 < 4){ // c1 resolved and c2 is not
            if (resolutionsCount[c2] > 0){
              for(let j = 0; j < 4; j++){
                if (resolutions[c2][j]){
                  pairwiseCounts[c1][j] += resolutionsCount[c2];
                }
              }
            }
          } else {
            if (c2 < 4){ // c2 resolved an c1 is not
              if (resolutionsCount[c1] > 0){
                for(let j = 0; j < 4; j++){
                  if (resolutions[c1][j]){
                    pairwiseCounts[j][c2] += resolutionsCount[c1];
                  }
                }
              }
            } else {
              // ambig and ambig
              let norm = resolutionsCount[c1] * resolutionsCount[c2];
              if (norm > 0.0){
                for (let j = 0; j < 4; j++){
                  if (resolutions[c1][j]){
                    for (let k = 0; k < 4; k++){
                      if (resolutions[c2][k]){
                        pairwiseCounts[j][k] += norm;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else if(matchMode == 'RESOLVE'){
      for (let p = 0; p < L; p++){
        let c1 = s1[p];
        let c2 = s2[p]

        if (c1 < 4 && c2 < 4){
          pairwiseCounts[c1][c2] += 1;
        } else { // not both resolved
          if (c1 == 17 || c2 == 17) continue;
          if (c1 < 4){ // c1 resolved and c2 is not
            if (resolutionsCount[c2] > 0){
              if (resolutions[c2][c1]){
                pairwiseCounts[c1][c1] += 1;
                continue;
              }
              for(let j = 0; j < 4; j++){
                if (resolutions[c2][j]){
                  pairwiseCounts[c1][j] += resolutionsCount[c2];
                }
              }
            }
          } else {
            if (c2 < 4){ // c2 resolved an c1 is not
              if (resolutionsCount[c1] > 0){
                if (resolutions[c1][c2]){
                  pairwiseCounts[c2][c2] += 1;
                  continue;
                }
                for(let j = 0; j < 4; j++){
                  if (resolutions[c1][j]){
                    pairwiseCounts[j][c2] += resolutionsCount[c1];
                  }
                }
              }
            } else {
              // ambig and ambig
              let norm = resolutionsCount[c1] * resolutionsCount[c2];
              if (norm > 0.0){
                let matched_count = 0;
                let positive_match = [false, false, false, false];
                for (let j = 0; j < 4; j++){
                  if (resolutions[c1][j] && resolutions[c2][j]){
                    matched_count++;
                    positive_match[j] = true;
                  }
                }

                if (matched_count > 0){
                  let norm2 = 1/matched_count;
                  for (let j = 0; j < 4; j++){
                    if (positive_match[j]){
                      pairwiseCounts[j][j] += norm2;
                    }
                  }
                  continue;
                }

                for (let j = 0; j < 4; j++){
                  if (resolutions[c1][j]){
                    for (let k = 0; k < 4; k++){
                      if (resolutions[c2][k]){
                        pairwiseCounts[j][k] += norm;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else {
      for (let p = 0; p < L; p++){
        let c1 = s1[p];
        let c2 = s2[p]

        if (c1 < 4 && c2 < 4){
          pairwiseCounts[c1][c2] += 1;
        } else { // not both resolved
          if (c1 == 17 || c2 == 17) continue;
          if (c1 < 4){ // c1 resolved and c2 is not
            if (resolutionsCount[c2] > 0){
              for(let j = 0; j < 4; j++){
                if (resolutions[c2][j]){
                  pairwiseCounts[c1][j] += resolutionsCount[c2];
                }
              }
            }
          } else {
            if (c2 < 4){ // c2 resolved an c1 is not
              if (resolutionsCount[c1] > 0){
                for(let j = 0; j < 4; j++){
                  if (resolutions[c1][j]){
                    pairwiseCounts[j][c2] += resolutionsCount[c1];
                  }
                }
              }
            } else {
              // ambig and ambig
              let norm = resolutionsCount[c1] * resolutionsCount[c2];
              if (norm > 0.0){
                for (let j = 0; j < 4; j++){
                  if (resolutions[c1][j]){
                    for (let k = 0; k < 4; k++){
                      if (resolutions[c2][k]){
                        pairwiseCounts[j][k] += norm;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    let nucFreq = [0, 0, 0, 0];
    for (let c1 = 0; c1 < 4; c1++){
      for (let c2 = 0; c2 < 4; c2++){
        nucFreq[c1] += pairwiseCounts[c1][c2];
        nucFreq[c2] += pairwiseCounts[c1][c2];
      }
    }

    let totalNonGap	= 2/(nucFreq[0] + nucFreq[1] + nucFreq[2] + nucFreq[3]);
    let AG = (pairwiseCounts[0][2] + pairwiseCounts[2][0]) * totalNonGap;
    let CT = (pairwiseCounts[1][3] + pairwiseCounts[3][1]) * totalNonGap;
    let tv = 1-((pairwiseCounts[0][0] + pairwiseCounts[1][1] + pairwiseCounts[2][2] + pairwiseCounts[3][3]) * totalNonGap + AG + CT);

    if (nucFreq[0] == 0 || nucFreq[1] == 0 || nucFreq[2] == 0 || nucFreq[3] == 0){
      AG = 1 - 2 * (AG + CT) - tv;
      CT = 1 - 2 * tv;
      if (AG > 0 && CT > 0){
        dist = -0.5 * Math.log(AG) - 0.25 * Math.log(CT);
      } else {
        dist = 1.0;
      }
    } else {
      const auxd = 1/(nucFreq[0] + nucFreq[1] + nucFreq[2] + nucFreq[3]);
      let nucF = [0, 0, 0, 0];
      for (let aux1 = 0; aux1 < 4; aux1++){
        nucF[aux1] = nucFreq[aux1] * auxd;
      }
      const fR = nucF[0] + nucF[2];
      const fY = nucF[1] + nucF[3];
      const K1 = 2 * nucF[0] * nucF[2] / fR;
      const K2 = 2 * nucF[1] * nucF[3] / fY;
      const K3 = 2 * (fR * fY - nucF[0] * nucF[2] * fY / fR - nucF[1] * nucF[3] * fR / fY);
      AG	= 1 - AG / K1 - 0.5 * tv / fR;
      CT	= 1 - CT / K2 - 0.5 * tv / fY;
      tv  = 1 - 0.5 * tv / fY / fR;
      dist = -K1 * Math.log(AG) - K2 * Math.log(CT) - K3 * Math.log(tv);
    }

    return(dist);
  }

  if(typeof exports !== 'undefined'){
    if(typeof module !== 'undefined' && module.exports){
      exports = module.exports = tn93;
    }
    exports.tn93 = tn93;
  } else {
    self.tn93 = tn93;
  }

})();
