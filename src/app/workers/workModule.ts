import { Injectable, OnInit, Directive } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { InlineWorker } from '../helperClasses/inlineWorker';
import Papa from 'papaparse';
import * as bioseq from 'bioseq';


@Directive()
export class WorkerModule implements OnInit {

    public compute_parse_csv_matrixWorker: Worker;

    constructor() {

        this.compute_parse_csv_matrixWorker = new Worker('assets/parse-csv-matrix.js');
          
    }

    ngOnInit() {
        
    }

    public compute_consensusWorker = new InlineWorker(() => {

        const compute_consensus = (e): any => {

           
            var start = Date.now();
            var subset = (e.data != undefined ? e.data : e);
            var n = subset.length;
            var output = [];
            for (var i = 0; i < n; i++) {
                var seq = subset[i].seq.toUpperCase();
                for (var j = 0; j < seq.length; j++) {
                    if (!output[j]) output.push({ A: 0, C: 0, G: 0, T: 0, '-': 0 });
                    output[j][seq[j]]++;
                }
            }
            var consensus: any = "";
            var m = output.length;
            var entry, maxKey, maxVal;
            for (var k = 0; k < m; k++) {
                entry = output[k];
                maxKey = 'A';
                maxVal = entry[maxKey];
                Object.keys(entry).forEach(char => {
                    if (maxVal <= entry[char]) {
                        maxVal = entry[char];
                        maxKey = char;
                    }
                });
                consensus += maxKey;
            }
            console.log('Consensus Compute time: ', (Date.now() - start).toLocaleString(), 'ms');
            start = Date.now();
            var encoder = new TextEncoder();
            consensus = encoder.encode(consensus).buffer;
          
            let response = {}; 
            response = { consensus: consensus, start: start, data: consensus };

            postMessage(response, null, null);
                        
        }
      
        onmessage = (evt) => {           
            compute_consensus(evt.data);
        }
        

    });
    
    public compute_ambiguity_countsWorker = new InlineWorker(() => {

        const compute_ambiguity_counts = (e): any => {

            const start = Date.now();
            const subset = (e.data != undefined ? e.data : e);
            const n = subset.length;
            let output = new Float32Array(n);
            for (let i = 0; i < n; i++) {
                const sequence = subset[i]["_seqInt"];
                const sequenceLength = sequence.length;
                let count = 0;
                for (let j = 0; j < sequenceLength; j++) {
                    count += ((sequence[j] > 3) ? 1 : 0);
                }
                output[i] = count / sequenceLength;
            }
            console.log("Ambiguity Count time: ", (Date.now() - start).toLocaleString(), "ms");

            let response = {};
            response = { counts: output.buffer, start: Date.now(), data: output.buffer };

            postMessage(response, null, null);
        }

        onmessage = (evt) => {
            compute_ambiguity_counts(evt.data);
        }

    });

    public compute_linksWorker = new InlineWorker(() => {

        const compute_links = (e): any => {

            let snps = (s1, s2) => {

                let n = Math.min(s1.length, s2.length);
                let sum = 0;
                for (let i = 0; i < n; i++) {
                    let c1 = s1[i];
                    let c2 = s2[i];
                    sum += ((c1 != c2) && (c1 != 17) && (c2 != 17) ? 1 : 0);
                }
                return sum;
            };

            
            let resolutions = [
                /* A,C,G,T */
                [1, 0, 0, 0], // A             -> A (0) (Adenine)
                [0, 1, 0, 0], // C             -> C (1) (Cytosine)
                [0, 0, 1, 0], // G             -> G (2) (Guanine)
                [0, 0, 0, 1], // T             -> T (3) (Thymine)
                [0, 0, 0, 1], // T             -> U (4) (Uracil)
                [1, 0, 1, 0], // A | G         -> R (5) (Either Purine)
                [0, 1, 0, 1], // C | T         -> Y (6) (Either Pyrimidine)
                [0, 1, 1, 0], // C | G         -> S (7)
                [1, 0, 0, 1], // A | T         -> W (8)
                [0, 0, 1, 1], // G | T         -> K (9)
                [1, 1, 0, 0], // A | C         -> M (10)
                [0, 1, 1, 1], // C | G | T     -> B (11) (Not Adenine)
                [1, 0, 1, 1], // A | G | T     -> D (12) (Not Cytosine)
                [1, 1, 0, 1], // A | C | T     -> H (13) (Not Guanine)
                [1, 1, 1, 0], // A | C | G     -> V (14) (Not Thymine)
                [1, 1, 1, 1], // A | C | G | T -> N (15)
                [1, 1, 1, 1], // A | C | G | T -> ? (16)
                [0, 0, 0, 0]  // GAP
            ];
            let resolutionsCount = [
                1.0,     // A
                1.0,     // C
                1.0,     // G
                1.0,     // T
                1.0,     // U
                1.0 / 2.0, // R
                1.0 / 2.0, // Y
                1.0 / 2.0, // S
                1.0 / 2.0, // S
                1.0 / 2.0, // W
                1.0 / 2.0, // K
                1.0 / 2.0, // M
                1.0 / 3.0, // B
                1.0 / 3.0, // D
                1.0 / 3.0, // H
                1.0 / 3.0, // V
                1.0 / 4.0, // N
                1.0 / 4.0, // ?
                0.0      // GAP
            ];

            
            let mapChar = Array(256).fill(16);
            mapChar[45] = 17; // GAP
            mapChar[65] = 0; // A
            mapChar[66] = 11; // B
            mapChar[67] = 1; // C
            mapChar[68] = 12; // D
            mapChar[71] = 2; // G
            mapChar[72] = 13; // H
            mapChar[75] = 9; // K
            mapChar[77] = 10; // M
            mapChar[78] = 15; // N
            mapChar[82] = 5; // R
            mapChar[83] = 7; // S
            mapChar[84] = 3; // T
            mapChar[85] = 4; // U
            mapChar[86] = 14; // V
            mapChar[87] = 8; // W
            mapChar[89] = 6; // Y
            mapChar[97] = 0; // a
            mapChar[98] = 11; // b
            mapChar[99] = 1; // c
            mapChar[100] = 12; // d
            mapChar[103] = 2; // g
            mapChar[104] = 13; // h
            mapChar[107] = 9; // k
            mapChar[109] = 10; // m
            mapChar[110] = 15; // n
            mapChar[114] = 5; // r
            mapChar[115] = 7; // s
            mapChar[116] = 3; // t
            mapChar[117] = 4; // u
            mapChar[118] = 14; // v
            mapChar[119] = 8; // w
            mapChar[121] = 6; // y



            let tn93 = (s1 = null, s2 = null, matchMode = null) => {

            if (!matchMode) matchMode = "AVERAGE";
            const L = Math.min(s1.length, s2.length);

            let matched_count = 0;
            let positive_match = [];
            let norm2 = 0;
            let dist = 0;
            let pairwiseCounts = [
                /* A, C, G, T */
               /* A */[0, 0, 0, 0],
               /* C */[0, 0, 0, 0],
               /* G */[0, 0, 0, 0],
               /* T */[0, 0, 0, 0]
                    ];

            if (matchMode == 'SKIP') {
                for (let p = 0; p < L; p++) {
                    let c1 = mapChar[s1.charCodeAt(p)];
                    let c2 = mapChar[s2.charCodeAt(p)];
                    if (c1 < 4 && c2 < 4) {
                        pairwiseCounts[c1][c2] += 1;
                    }
                }
            } else if (matchMode == 'GAPMM') {
                for (let p = 0; p < L; p++) {
                    let c1 = mapChar[s1.charCodeAt(p)];
                    let c2 = mapChar[s2.charCodeAt(p)];

                    if (c1 < 4 && c2 < 4) {
                        pairwiseCounts[c1][c2] += 1;
                    } else { // not both resolved
                        if (c1 == 17 || c2 == 17) {
                            if (c1 == 17 && c2 == 17) {
                                continue;
                            } else {
                                if (c1 == 17) {
                                    c1 = 15;
                                } else {
                                    c2 = 15;
                                }
                            }
                        }

                        if (c1 < 4) { // c1 resolved and c2 is not
                            if (resolutionsCount[c2] > 0) {
                                for (let j = 0; j < 4; j++) {
                                    if (resolutions[c2][j]) {
                                        pairwiseCounts[c1][j] += resolutionsCount[c2];
                                    }
                                }
                            }
                        } else {
                            if (c2 < 4) { // c2 resolved an c1 is not
                                if (resolutionsCount[c1] > 0) {
                                    for (let j = 0; j < 4; j++) {
                                        if (resolutions[c1][j]) {
                                            pairwiseCounts[j][c2] += resolutionsCount[c1];
                                        }
                                    }
                                }
                            } else {
                                // ambig and ambig
                                let norm = resolutionsCount[c1] * resolutionsCount[c2];
                                if (norm > 0.0) {
                                    for (let j = 0; j < 4; j++) {
                                        if (resolutions[c1][j]) {
                                            for (let k = 0; k < 4; k++) {
                                                if (resolutions[c2][k]) {
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
            } else if (matchMode == 'RESOLVE') {
                for (let p = 0; p < L; p++) {
                    let c1 = mapChar[s1.charCodeAt(p)];
                    let c2 = mapChar[s2.charCodeAt(p)];

                    if (c1 < 4 && c2 < 4) {
                        pairwiseCounts[c1][c2] += 1;
                    } else { // not both resolved
                        if (c1 == 17 || c2 == 17) continue;
                        if (c1 < 4) { // c1 resolved and c2 is not
                            if (resolutionsCount[c2] > 0) {
                                if (resolutions[c2][c1]) {
                                    pairwiseCounts[c1][c1] += 1;
                                    continue;
                                }
                                for (let j = 0; j < 4; j++) {
                                    if (resolutions[c2][j]) {
                                        pairwiseCounts[c1][j] += resolutionsCount[c2];
                                    }
                                }
                            }
                        } else {
                            if (c2 < 4) { // c2 resolved an c1 is not
                                if (resolutionsCount[c1] > 0) {
                                    if (resolutions[c1][c2]) {
                                        pairwiseCounts[c2][c2] += 1;
                                        continue;
                                    }
                                    for (let j = 0; j < 4; j++) {
                                        if (resolutions[c1][j]) {
                                            pairwiseCounts[j][c2] += resolutionsCount[c1];
                                        }
                                    }
                                }
                            } else {
                                // ambig and ambig
                                let norm = resolutionsCount[c1] * resolutionsCount[c2];
                                if (norm > 0.0) {
                                    matched_count = 0;
                                    positive_match = [false, false, false, false];
                                    for (let j = 0; j < 4; j++) {
                                        if (resolutions[c1][j] && resolutions[c2][j]) {
                                            matched_count++;
                                            positive_match[j] = true;
                                        }
                                    }

                                    if (matched_count > 0) {
                                        norm2 = 1 / matched_count;
                                        for (let j = 0; j < 4; j++) {
                                            if (positive_match[j]) {
                                                pairwiseCounts[j][j] += norm2;
                                            }
                                        }
                                        continue;
                                    }

                                    for (let j = 0; j < 4; j++) {
                                        if (resolutions[c1][j]) {
                                            for (let k = 0; k < 4; k++) {
                                                if (resolutions[c2][k]) {
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
                for (let p = 0; p < L; p++) {
                    let c1 = mapChar[s1.charCodeAt(p)];
                    let c2 = mapChar[s2.charCodeAt(p)];

                    if (c1 < 4 && c2 < 4) {
                        pairwiseCounts[c1][c2] += 1;
                    } else { // not both resolved
                        if (c1 == 17 || c2 == 17) continue;
                        if (c1 < 4) { // c1 resolved and c2 is not
                            if (resolutionsCount[c2] > 0) {
                                for (let j = 0; j < 4; j++) {
                                    if (resolutions[c2][j]) {
                                        pairwiseCounts[c1][j] += resolutionsCount[c2];
                                    }
                                }
                            }
                        } else {
                            if (c2 < 4) { // c2 resolved an c1 is not
                                if (resolutionsCount[c1] > 0) {
                                    for (let j = 0; j < 4; j++) {
                                        if (resolutions[c1][j]) {
                                            pairwiseCounts[j][c2] += resolutionsCount[c1];
                                        }
                                    }
                                }
                            } else {
                                // ambig and ambig
                                let norm = resolutionsCount[c1] * resolutionsCount[c2];
                                if (norm > 0.0) {
                                    for (let j = 0; j < 4; j++) {
                                        if (resolutions[c1][j]) {
                                            for (let k = 0; k < 4; k++) {
                                                if (resolutions[c2][k]) {
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
            for (let c1 = 0; c1 < 4; c1++) {
                for (let c2 = 0; c2 < 4; c2++) {
                    nucFreq[c1] += pairwiseCounts[c1][c2];
                    nucFreq[c2] += pairwiseCounts[c1][c2];
                }
            }

            let totalNonGap = 2 / (nucFreq[0] + nucFreq[1] + nucFreq[2] + nucFreq[3]);
            let AG = (pairwiseCounts[0][2] + pairwiseCounts[2][0]) * totalNonGap;
            let CT = (pairwiseCounts[1][3] + pairwiseCounts[3][1]) * totalNonGap;
            let tv = 1 - ((pairwiseCounts[0][0] + pairwiseCounts[1][1] + pairwiseCounts[2][2] + pairwiseCounts[3][3]) * totalNonGap + AG + CT);

            if (nucFreq[0] == 0 || nucFreq[1] == 0 || nucFreq[2] == 0 || nucFreq[3] == 0) {
                AG = 1 - 2 * (AG + CT) - tv;
                CT = 1 - 2 * tv;
                if (AG > 0 && CT > 0) {
                    dist = -0.5 * Math.log(AG) - 0.25 * Math.log(CT);
                } else {
                    dist = 1.0;
                }
            } else {
                const auxd = 1 / (nucFreq[0] + nucFreq[1] + nucFreq[2] + nucFreq[3]);
                let nucF = [0, 0, 0, 0];
                for (let aux1 = 0; aux1 < 4; aux1++) {
                    nucF[aux1] = nucFreq[aux1] * auxd;
                }
                const fR = nucF[0] + nucF[2];
                const fY = nucF[1] + nucF[3];
                const K1 = 2 * nucF[0] * nucF[2] / fR;
                const K2 = 2 * nucF[1] * nucF[3] / fY;
                const K3 = 2 * (fR * fY - nucF[0] * nucF[2] * fY / fR - nucF[1] * nucF[3] * fR / fY);
                AG = 1 - AG / K1 - 0.5 * tv / fR;
                CT = 1 - CT / K2 - 0.5 * tv / fY;
                tv = 1 - 0.5 * tv / fY / fR;
                dist = -K1 * Math.log(AG) - K2 * Math.log(CT) - K3 * Math.log(tv);
            }

            return (dist);
        }

            let toInts = (sequence = null) => {
                    const n = sequence.length;
                    let output = new Uint8Array(n);
                    for (let i = 0; i < n; i++) {
                        output[i] = mapChar[sequence.charCodeAt(i)];
                    }
                    return output;
                };

            let onInts = (s1 = null, s2 = null, matchMode = null) => {
                if (!matchMode) matchMode = "AVERAGE";
                const L = Math.min(s1.length, s2.length);

                let matched_count = 0;
                let positive_match = [];
                let norm2 = 0;
                let dist = 0;
                let pairwiseCounts = [
                    /* A, C, G, T */
              /* A */[0, 0, 0, 0],
              /* C */[0, 0, 0, 0],
              /* G */[0, 0, 0, 0],
              /* T */[0, 0, 0, 0]
                ];

                if (matchMode == 'SKIP') {
                    for (let p = 0; p < L; p++) {
                        let c1 = s1[p];
                        let c2 = s2[p];
                        if (c1 < 4 && c2 < 4) {
                            pairwiseCounts[c1][c2] += 1;
                        }
                    }
                } else if (matchMode == 'GAPMM') {
                    for (let p = 0; p < L; p++) {
                        let c1 = s1[p];
                        let c2 = s2[p];

                        if (c1 < 4 && c2 < 4) {
                            pairwiseCounts[c1][c2] += 1;
                        } else { // not both resolved
                            if (c1 == 17 || c2 == 17) {
                                if (c1 == 17 && c2 == 17) {
                                    continue;
                                } else {
                                    if (c1 == 17) {
                                        c1 = 15;
                                    } else {
                                        c2 = 15;
                                    }
                                }
                            }

                            if (c1 < 4) { // c1 resolved and c2 is not
                                if (resolutionsCount[c2] > 0) {
                                    for (let j = 0; j < 4; j++) {
                                        if (resolutions[c2][j]) {
                                            pairwiseCounts[c1][j] += resolutionsCount[c2];
                                        }
                                    }
                                }
                            } else {
                                if (c2 < 4) { // c2 resolved an c1 is not
                                    if (resolutionsCount[c1] > 0) {
                                        for (let j = 0; j < 4; j++) {
                                            if (resolutions[c1][j]) {
                                                pairwiseCounts[j][c2] += resolutionsCount[c1];
                                            }
                                        }
                                    }
                                } else {
                                    // ambig and ambig
                                    let norm = resolutionsCount[c1] * resolutionsCount[c2];
                                    if (norm > 0.0) {
                                        for (let j = 0; j < 4; j++) {
                                            if (resolutions[c1][j]) {
                                                for (let k = 0; k < 4; k++) {
                                                    if (resolutions[c2][k]) {
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
                } else if (matchMode == 'RESOLVE') {
                    for (let p = 0; p < L; p++) {
                        let c1 = s1[p];
                        let c2 = s2[p]

                        if (c1 < 4 && c2 < 4) {
                            pairwiseCounts[c1][c2] += 1;
                        } else { // not both resolved
                            if (c1 == 17 || c2 == 17) continue;
                            if (c1 < 4) { // c1 resolved and c2 is not
                                if (resolutionsCount[c2] > 0) {
                                    if (resolutions[c2][c1]) {
                                        pairwiseCounts[c1][c1] += 1;
                                        continue;
                                    }
                                    for (let j = 0; j < 4; j++) {
                                        if (resolutions[c2][j]) {
                                            pairwiseCounts[c1][j] += resolutionsCount[c2];
                                        }
                                    }
                                }
                            } else {
                                if (c2 < 4) { // c2 resolved an c1 is not
                                    if (resolutionsCount[c1] > 0) {
                                        if (resolutions[c1][c2]) {
                                            pairwiseCounts[c2][c2] += 1;
                                            continue;
                                        }
                                        for (let j = 0; j < 4; j++) {
                                            if (resolutions[c1][j]) {
                                                pairwiseCounts[j][c2] += resolutionsCount[c1];
                                            }
                                        }
                                    }
                                } else {
                                    // ambig and ambig
                                    let norm = resolutionsCount[c1] * resolutionsCount[c2];
                                    if (norm > 0.0) {
                                        let matched_count = 0;
                                        positive_match = [false, false, false, false];
                                        for (let j = 0; j < 4; j++) {
                                            if (resolutions[c1][j] && resolutions[c2][j]) {
                                                matched_count++;
                                                positive_match[j] = true;
                                            }
                                        }

                                        if (matched_count > 0) {
                                            norm2 = 1 / matched_count;
                                            for (let j = 0; j < 4; j++) {
                                                if (positive_match[j]) {
                                                    pairwiseCounts[j][j] += norm2;
                                                }
                                            }
                                            continue;
                                        }

                                        for (let j = 0; j < 4; j++) {
                                            if (resolutions[c1][j]) {
                                                for (let k = 0; k < 4; k++) {
                                                    if (resolutions[c2][k]) {
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
                    for (let p = 0; p < L; p++) {
                        let c1 = s1[p];
                        let c2 = s2[p]

                        if (c1 < 4 && c2 < 4) {
                            pairwiseCounts[c1][c2] += 1;
                        } else { // not both resolved
                            if (c1 == 17 || c2 == 17) continue;
                            if (c1 < 4) { // c1 resolved and c2 is not
                                if (resolutionsCount[c2] > 0) {
                                    for (let j = 0; j < 4; j++) {
                                        if (resolutions[c2][j]) {
                                            pairwiseCounts[c1][j] += resolutionsCount[c2];
                                        }
                                    }
                                }
                            } else {
                                if (c2 < 4) { // c2 resolved an c1 is not
                                    if (resolutionsCount[c1] > 0) {
                                        for (let j = 0; j < 4; j++) {
                                            if (resolutions[c1][j]) {
                                                pairwiseCounts[j][c2] += resolutionsCount[c1];
                                            }
                                        }
                                    }
                                } else {
                                    // ambig and ambig
                                    let norm = resolutionsCount[c1] * resolutionsCount[c2];
                                    if (norm > 0.0) {
                                        for (let j = 0; j < 4; j++) {
                                            if (resolutions[c1][j]) {
                                                for (let k = 0; k < 4; k++) {
                                                    if (resolutions[c2][k]) {
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
                for (let c1 = 0; c1 < 4; c1++) {
                    for (let c2 = 0; c2 < 4; c2++) {
                        nucFreq[c1] += pairwiseCounts[c1][c2];
                        nucFreq[c2] += pairwiseCounts[c1][c2];
                    }
                }

                let totalNonGap = 2 / (nucFreq[0] + nucFreq[1] + nucFreq[2] + nucFreq[3]);
                let AG = (pairwiseCounts[0][2] + pairwiseCounts[2][0]) * totalNonGap;
                let CT = (pairwiseCounts[1][3] + pairwiseCounts[3][1]) * totalNonGap;
                let tv = 1 - ((pairwiseCounts[0][0] + pairwiseCounts[1][1] + pairwiseCounts[2][2] + pairwiseCounts[3][3]) * totalNonGap + AG + CT);

                if (nucFreq[0] == 0 || nucFreq[1] == 0 || nucFreq[2] == 0 || nucFreq[3] == 0) {
                    AG = 1 - 2 * (AG + CT) - tv;
                    CT = 1 - 2 * tv;
                    if (AG > 0 && CT > 0) {
                        dist = -0.5 * Math.log(AG) - 0.25 * Math.log(CT);
                    } else {
                        dist = 1.0;
                    }
                } else {
                    const auxd = 1 / (nucFreq[0] + nucFreq[1] + nucFreq[2] + nucFreq[3]);
                    let nucF = [0, 0, 0, 0];
                    for (let aux1 = 0; aux1 < 4; aux1++) {
                        nucF[aux1] = nucFreq[aux1] * auxd;
                    }
                    const fR = nucF[0] + nucF[2];
                    const fY = nucF[1] + nucF[3];
                    const K1 = 2 * nucF[0] * nucF[2] / fR;
                    const K2 = 2 * nucF[1] * nucF[3] / fY;
                    const K3 = 2 * (fR * fY - nucF[0] * nucF[2] * fY / fR - nucF[1] * nucF[3] * fR / fY);
                    AG = 1 - AG / K1 - 0.5 * tv / fR;
                    CT = 1 - CT / K2 - 0.5 * tv / fY;
                    tv = 1 - 0.5 * tv / fY / fR;
                    dist = -K1 * Math.log(AG) - K2 * Math.log(CT) - K3 * Math.log(tv);
                }

                return (dist);
            }



            
            let start = Date.now(),
                t = 0,
                output;

            const subset = e.nodes,
                n = subset.length,
                threshold = parseFloat(e.threshold),
                strategy = e.strategy.toUpperCase(),
                metric = e.metric;

            if (metric == 'snps') {

                output = new Uint16Array((n * n - n) / 2);
                for (let i = 0; i < n; i++) {
                    let source = subset[i];
                    for (let j = 0; j < i; j++) {

                        output[t++] = snps(source['_seqInt'], subset[j]['_seqInt'])
                    }
                }

            } else {

               
                output = new Float32Array((n * n - n) / 2);
               
                if (strategy != "HIVTRACE-G") {
                    for (let i = 0; i < n; i++) {
                        let source = subset[i]['_seqInt'];
                        for (let j = 0; j < i; j++) {
                            output[t++] = onInts(source, subset[j]['_seqInt'], strategy);
                        }
                    }
                } else {
                    for (let i = 0; i < n; i++) {
                        let source = subset[i];
                        let sourceInThreshold = source['_ambiguity'] < threshold;
                        let sourceSeq = source['_seqInt'];
                        for (let j = 0; j < i; j++) {
                            let target = subset[j];
                            output[t++] = onInts(sourceSeq, target['_seqInt'],
                                ((sourceInThreshold && target['_ambiguity'] < threshold) ?
                                    "RESOLVE" : "AVERAGE"
                                )
                            );
                        }
                    }
                }

            }

            console.log('Links Compute time: ', (Date.now() - start).toLocaleString(), 'ms');
            start = Date.now();

            let response = {};
            response = { links: output.buffer, start, data: output.buffer };

            postMessage(response, null, null);
        }

        onmessage = (evt) => {
            compute_links(evt.data);
        }


    });

    public compute_treeWorker = new InlineWorker(() => {

        const compute_tree = (e): any => {


            class Patristic {

                constructor() { };

                parseJSON = (json = null, idLabel = null, lengthLabel = null, childrenLabel = null) => {
                    if (!idLabel) idLabel = "id";
                    if (!lengthLabel) lengthLabel = "length";
                    if (!childrenLabel) childrenLabel = "children";
                    if (typeof json === "string") json = JSON.parse(json);
                    let root = new Branch({
                        id: json[idLabel],
                        length: json[lengthLabel]
                    });
                    if (json[childrenLabel] instanceof Array) {
                        json[childrenLabel].forEach(child => {
                            root.addChild(this.parseJSON(child));
                        });
                    }
                    return root.fixDistances();
                };

                parseMatrix = (matrix = null, labels = null) => {
                    let that: any = {};
                    let N = (that.N = matrix.length);
                   

                    if (!labels) labels = [new Array(N).keys()]; //[...Array(N).keys()];
                    that.cN = that.N;
                    that.D = matrix;
                    that.labels = labels;
                    that.labelToTaxon = {};
                    that.currIndexToLabel = new Array(N);
                    that.rowChange = new Array(N);
                    that.newRow = new Array(N);
                    that.labelToNode = new Array(2 * N);
                    that.nextIndex = N;
                    that.I = new Array(that.N);
                    that.S = new Array(that.N);
                    for (let i = 0; i < that.N; i++) {
                        let sortedRow = this.sortWithIndices(that.D[i], i);
                        that.S[i] = sortedRow;
                        that.I[i] = sortedRow.sortIndices;
                    }
                    that.removedIndices = new Set();
                    that.indicesLeft = new Set();
                    for (let i = 0; i < N; i++) {
                        that.currIndexToLabel[i] = i;
                        that.indicesLeft.add(i);
                    }
                    that.rowSumMax = 0;
                    that.PNewick = "";
                    let minI, minJ, d1, d2, l1, l2, node1, node2, node3;

                    function setUpNode(labelIndex, distance) {
                        let node;
                        if (labelIndex < that.N) {
                            node = new Branch({ id: that.labels[labelIndex], length: distance });
                            that.labelToNode[labelIndex] = node;
                        } else {
                            node = that.labelToNode[labelIndex];
                            node.setLength(distance);
                        }
                        return node;
                    }

                    that.rowSums = this.sumRows(that.D);
                    for (let i = 0; i < that.cN; i++) {
                        if (that.rowSums[i] > that.rowSumMax) that.rowSumMax = that.rowSums[i];
                    }


                    while (that.cN > 2) {
                        //if (that.cN % 100 == 0 ) console.log(that.cN);
                        // console.log('minI: ', minI);
                        // console.log('minJ: ', minJ);


                        ({ minI, minJ } = this.search(that));

                        // console.log('parsing matrix 7: ', JSON.stringify(that.D));


                        // console.log('that.D[minI][minJ]: ', that.D[minI][minJ]);
                        d1 =
                            0.5 * that.D[minI][minJ] +
                            (that.rowSums[minI] - that.rowSums[minJ]) / (2 * that.cN - 4);
                        d2 = that.D[minI][minJ] - d1;

                        l1 = that.currIndexToLabel[minI];
                        l2 = that.currIndexToLabel[minJ];

                        node1 = setUpNode(l1, d1);
                        node2 = setUpNode(l2, d2);
                        node3 = new Branch({ children: [node1, node2] });

                        this.recalculateDistanceMatrix(that, minI, minJ);
                        let sorted = this.sortWithIndices(that.D[minJ], minJ);
                        that.S[minJ] = sorted;
                        that.I[minJ] = sorted.sortIndices;
                        that.S[minI] = that.I[minI] = [];
                        that.cN--;

                        that.labelToNode[that.nextIndex] = node3;
                        that.currIndexToLabel[minI] = -1;
                        that.currIndexToLabel[minJ] = that.nextIndex++;
                    }



                    let left = that.indicesLeft.values();
                    minI = left.next().value;
                    minJ = left.next().value;

                    l1 = that.currIndexToLabel[minI];
                    l2 = that.currIndexToLabel[minJ];
                    d1 = d2 = that.D[minI][minJ] / 2;

                    node1 = setUpNode(l1, d1);
                    node2 = setUpNode(l2, d2);
                    
                    let tree = new Branch({ children: [node1, node2] });
                    // console.log('parsing matrix 7');

                    tree.fixParenthood();
                    return tree.fixDistances();
                };

                search = (t = null) => {
                    let qMin = Infinity,
                        D = t.D,
                        cN = t.cN,
                        n2 = cN - 2,
                        S = t.S,
                        I = t.I,
                        rowSums = t.rowSums,
                        removedColumns = t.removedIndices,
                        uMax = t.rowSumMax,
                        q,
                        minI = -1,
                        minJ = -1,
                        c2;

                   // initial guess for qMin
                   for (let r = 0; r < t.N; r++) {
                    if (removedColumns.has(r)) continue;
                    c2 = I[r][0];
                    if (removedColumns.has(c2)) continue;
                    q = D[r][c2] * n2 - rowSums[r] - rowSums[c2];
                    if (q < qMin) {
                        qMin = q;
                        minI = r;
                        minJ = c2;
                    }
                }

                for (let r = 0; r < t.N; r++) {
                    if (removedColumns.has(r)) continue;
                    for (let c = 0; c < S[r].length; c++) {
                        c2 = I[r][c];
                        if (removedColumns.has(c2)) continue;
                        if (S[r][c] * n2 - rowSums[r] - uMax > qMin) break;
                        q = D[r][c2] * n2 - rowSums[r] - rowSums[c2];
                        if (q < qMin) {
                            qMin = q;
                            minI = r;
                            minJ = c2;
                        }
                    }
                }

                    return { minI, minJ };
                };

                recalculateDistanceMatrix = (t, joinedIndex1, joinedIndex2) => {
                    let D = t.D,
                        n = D.length,
                        sum = 0,
                        aux,
                        aux2,
                        removedIndices = t.removedIndices,
                        rowSums = t.rowSums,
                        newRow = t.newRow,
                        rowChange = t.rowChange,
                        newMax = 0;

                    removedIndices.add(joinedIndex1);
                    for (let i = 0; i < n; i++) {
                        if (removedIndices.has(i)) continue;
                        aux = D[joinedIndex1][i] + D[joinedIndex2][i];
                        aux2 = D[joinedIndex1][joinedIndex2];
                        newRow[i] = 0.5 * (aux - aux2);
                        sum += newRow[i];
                        rowChange[i] = -0.5 * (aux + aux2);
                    }
                    for (let i = 0; i < n; i++) {
                        D[joinedIndex1][i] = -1;
                        D[i][joinedIndex1] = -1;
                        if (removedIndices.has(i)) continue;
                        D[joinedIndex2][i] = newRow[i];
                        D[i][joinedIndex2] = newRow[i];
                        rowSums[i] += rowChange[i];
                        if (rowSums[i] > newMax) newMax = rowSums[i];
                    }
                    rowSums[joinedIndex1] = 0;
                    rowSums[joinedIndex2] = sum;
                    if (sum > newMax) newMax = sum;
                    t.rowSumMax = newMax;
                    t.indicesLeft.delete(joinedIndex1);
                }

                sumRows = (a = null) => {
                    let n = a.length,
                        sums = new Array(n);
                    for (let i = 0; i < n; i++) {
                        let sum = 0;
                        for (let j = 0; j < n; j++) {
                            let v = parseFloat(a[i][j]);
                            if (typeof v !== "number") continue;
                            sum += a[i][j];
                        }
                        sums[i] = sum;
                    }
                    return sums;
                }

                sortWithIndices = (toSort, skip) => {
                    if (typeof skip === "undefined") skip = -1;
                    let n = toSort.length;
                    let indexCopy: any = new Array(n);
                    let valueCopy: any = new Array(n);
                    let i2 = 0;
                    for (let i = 0; i < n; i++) {
                        if (toSort[i] === -1 || i === skip) continue;
                        indexCopy[i2] = i;
                        valueCopy[i2++] = toSort[i];
                    }
                    indexCopy.length = i2;
                    valueCopy.length = i2;
                    indexCopy.sort((a, b) => toSort[a] - toSort[b]);
                    valueCopy.sortIndices = indexCopy;
                    for (let j = 0; j < i2; j++) {
                        valueCopy[j] = toSort[indexCopy[j]];
                    }
                    return valueCopy;
                };

                parseNewick = (newick = null) => {
                    let ancestors = [],
                        tree = new Branch(),
                        tokens = newick.split(/\s*(;|\(|\)|,|:)\s*/),
                        n = tokens.length;
                    for (let t = 0; t < n; t++) {
                        let token = tokens[t];
                        let c;
                        switch (token) {
                            case "(": // new Branchset
                                c = tree.addChild();
                                ancestors.push(tree);
                                tree = c;
                                break;
                            case ",": // another Branch
                                c = ancestors[ancestors.length - 1].addChild();
                                tree = c;
                                break;
                            case ")": // optional name next
                                tree = ancestors.pop();
                                break;
                            case ":": // optional length next
                                break;
                            default:
                                let x = tokens[t - 1];
                                if (x == ")" || x == "(" || x == ",") {
                                    tree.id = token;
                                } else if (x == ":") {
                                    tree.length = parseFloat(token);
                                }
                        }
                    }
                    return tree.fixDistances();
                };

            }

            class Branch  {

                _Patristic: Patristic = new Patristic();

                    _guid: any = null;
                    id: any = null;
                    data: any = null;
                    depth: any = 0;
                    height: any = 0;
                    length: any = 0;
                    parent: any = null;
                    children: any = [];
                    value: any = [];
                    respresenting: any = 1;


                constructor(data = null, children = null) {
                      
                        if (!data) data = {};
                        if (!children) children = d => d.children;
                        Object.assign(this, {
                            _guid: this.guid(),
                            id: data.id || "",
                            data: data,
                            depth: data.depth || 0,
                            height: data.height || 0,
                            length: data.length || 0,
                            parent: data.parent || null,
                            children: children(data) || [],
                            value: data.value || 1,
                            respresenting: 1
                        });
                    }

                    
                    guid = () => {
                        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                            var r = Math.random() * 16 | 0,
                                v = c == 'x' ? r : (r & 0x3 | 0x8);
                            return v.toString(16);
                        });
                    }

                    addParent = (data, siblings) => {
                        if (!siblings) siblings = [];
                        let c;
                        if (data instanceof Branch) {
                            c = data;
                        } else {
                            if (!data) data = {};
                            c = new Branch(Object.assign(data));
                        }
                        siblings.forEach(sib => sib.setParent(c));
                        c.children = [this].concat(siblings);
                        this.parent = c;
                        return this;
                    };

                    ancestors = () => {
                        return this.getAncestors(true);
                    };

                clone = () => {
                    return this._Patristic.parseJSON(this.toObject());
                    };

                    consolidate = () => {
                        return this.eachAfter(branch => {
                            if (branch.isRoot() || branch.length >= 0.0005) return;
                            if (branch.parent.id == "") {
                                branch.parent.id = branch.id;
                            } else {
                                branch.parent.id += '+' + branch.id;
                            }
                            branch.excise();
                        }).fixDistances();
                    };

                    copy = () => {
                        let newThis = this._Patristic.parseJSON(JSON.stringify(this));
                        newThis.parent = null;
                        return newThis.fixDistances();
                    };

                    count = () => {
                        return this.sum(() => 1);
                    };

                    descendants = () => {
                        return this.getDescendants(true);
                    };

                    depthOf = (descendant) => {
                        let distance = this.length;
                        if (typeof descendant == "string")
                            descendant = this.getDescendant(descendant);
                        if (typeof descendant == "undefined")
                            throw Error("Cannot compute depth of undefined descendant!");
                        let current = descendant;
                        while (current != this) {
                            distance += current.length;
                            current = current.parent;
                        }
                        return distance;
                    };

                    distanceBetween = (descendantA, descendantB) => {
                        let mrca = descendantA.getMRCA(descendantB);
                        return mrca.depthOf(descendantA) + mrca.depthOf(descendantB);
                    };

                    distanceTo = (cousin) => {
                        let mrca = this.getMRCA(cousin);
                        return mrca.depthOf(this) + mrca.depthOf(cousin);
                    };

                    each = (callback) => {
                        let branch = this,
                            next = [branch],
                            current;
                        while (next.length) {
                            current = next.reverse();
                            next = [];
                            while ((branch = current.pop())) {
                                callback(branch);
                                branch.eachChild(child => next.push(child));
                            }
                        }
                        return this;
                    };

                    eachAfter = (callback) => {
                        this.eachChild(child => child.eachAfter(callback));
                        callback(this);
                        return this;
                    };

                    eachBefore = (callback) => {
                        callback(this);
                        this.eachChild(child => child.eachBefore(callback));
                        return this;
                    };

                    eachChild = (callback) => {
                        this.children.forEach(callback);
                        return this;
                    };

                    excise = () => {
                        if (this.isRoot() && this.children.length > 1) {
                            throw new Error("Cannot excise a root Branch with multiple children.");
                        }
                        this.eachChild(child => {
                            child.length += this.length;
                            child.parent = this.parent;
                            if (!this.isRoot()) this.parent.children.push(child);
                        });
                        this.parent.children.splice(this.parent.children.indexOf(this), 1);
                        this.parent.representing++;
                        return this.parent;
                    };

                    fixDistances = () => {
                        let maxdepth = 0,
                            root = this.getRoot();
                        root.depth = 0;
                        this.eachBefore(d => {
                            if (d.isRoot()) return;
                            d.depth = d.parent.depth + 1;
                            if (d.depth > maxdepth) maxdepth = d.depth;
                        }).eachAfter(d => {
                            d.height = maxdepth - d.depth;
                            d.value = d.value + d.children.reduce((a, c) => a + c.value, 0);
                        });
                        return this;
                    };

                    flip = () => {
                        return this.each(c => c.rotate());
                    };

                    getAncestors = (includeSelf) => {
                        let ancestors = includeSelf ? [this] : [];
                        let current = this;
                        while ((current = current.parent)) ancestors.push(current);
                        return ancestors;
                    };

                    getChild = (childID) => {
                        if (!(typeof childID == "string"))
                            throw Error("childID is not a String!");
                        return this.children.find(c => c.id === childID);
                    };

                    getDescendant = (id) => {
                        if (this.id === id) return this;
                        let children = this.children,
                            n = children.length;
                        if (children) {
                            for (let i = 0; i < n; i++) {
                                let descendant = children[i].getDescendant(id);
                                if (descendant) return descendant;
                            }
                        }
                    };

                    getDescendants = (includeSelf = null) => {
                        let descendants = includeSelf ? [this] : [];
                        if (!this.isLeaf()) {
                            this.children.forEach(child => {
                                child.getDescendants(true).forEach(d => descendants.push(d));
                            });
                        }
                        return descendants;
                    };

                    getLeafs = () => {
                        return this.getLeaves();
                    };

                    getLeaves = () => {
                        if (this.isLeaf()) {
                            return [this];
                        } else {
                            let descendants = [];
                            this.children.forEach(child => {
                                child.getLeaves().forEach(d => descendants.push(d));
                            });
                            return descendants;
                        }
                        throw new Error("Something very weird happened. Sorry about that!");
                    };

                    getMRCA = (cousin) => {
                        let mrca = this;
                        while (!mrca.hasDescendant(cousin)) {
                            if (mrca.isRoot())
                                throw Error(
                                    "Branch and cousin do not appear to share a common ancestor!"
                                );
                            mrca = mrca.parent;
                        }
                        return mrca;
                    };

                    getRoot = () => {
                        let branch = this;
                        while (!branch.isRoot()) branch = branch.parent;
                        return branch;
                    };

                    hasChild = (child) => {
                        if (child instanceof Branch) {
                            return this.children.includes(child);
                        } else if (typeof child === "string") {
                            return this.children.some(c => c.id === child);
                        }
                        throw Error(
                            `Unknown type of child (${typeof child}) passed to Branch.hasChild!`
                        );
                    };

                    hasDescendant = (descendant) => {
                        let descendants = this.getDescendants();
                        if (descendant instanceof Branch) {
                            return descendants.some(d => d === descendant);
                        } else if (typeof descendant === "string") {
                            return descendants.some(d => d.id === descendant);
                        }
                        throw Error("Unknown type of descendant passed to Branch.hasDescendant!");
                    };

                    includes = (container: any, value: any) => {
                        var returnValue = false;
                        var pos = container.indexOf(value);
                        if (pos >= 0) {
                            returnValue = true;
                        }

                        return returnValue;
                    };

                    hasLeaf = (leaf) => {
                        let leaves = this.getLeaves();
                        if (leaf instanceof Branch) {
                            return this.includes(leaves, leaf);
                        } else if (typeof leaf === "string") {
                            return leaves.some(d => d.id === leaf);
                        }
                        throw Error("Unknown type of leaf passed to Branch.hasLeaf.");
                    };

                    invert = () => {
                        let oldParent = this.parent;
                        if (oldParent) {
                            let temp = this.parent.length;
                            this.parent.length = this.length;
                            this.length = temp;
                            this.parent = oldParent.parent;
                            this.children.push(oldParent);
                            oldParent.parent = this;
                            oldParent.children.splice(oldParent.children.indexOf(this), 1);
                        } else {
                            throw Error("Cannot invert root node!");
                        }
                        return this;
                    };

                    isChildOf = (parent) => {
                        if (parent instanceof Branch) return this.parent === parent;
                        if (typeof parent === "string") return this.parent.id === parent;
                        throw Error("Unknown parent type passed to Branch.isChildOf");
                    };

                    isConsistent = () => {
                        if (!this.isRoot()) {
                            if (!this.parent.children.includes(this)) return false;
                        }
                        if (!this.isLeaf()) {
                            if (this.children.some(c => c.parent !== this)) return false;
                            return this.children.every(c => c.isConsistent());
                        }
                        return true;
                    };

                    isDescendantOf = (ancestor) => {
                        if (!ancestor || !this.parent) return false;
                        if (this.parent === ancestor || this.parent.id === ancestor) return true;
                        return this.parent.isDescendantOf(ancestor);
                    };

                    isLeaf = () => {
                        return this.children.length === 0;
                    };

                    isolate = () => {
                        let index = this.parent.children.indexOf(this);
                        this.parent.children.splice(index, 1);
                        this.setParent(null);
                        return this;
                    };

                    isRoot = () => {
                        return this.parent === null;
                    };

                    leafs = () => {
                        return this.getLeaves();
                    };

                    leaves = () => {
                        return this.getLeaves();
                    };

                    links = () => {
                        let links = [];
                        this.each(d => {
                            if (d.isRoot()) return;
                            links.push({
                                source: d.parent,
                                target: d
                            });
                        });
                        return links;
                    };

                    normalize = (newmin, newmax) => {
                        if (typeof newmax !== "number") newmax = 1;
                        if (typeof newmin !== "number") newmin = 0;
                        let min = Infinity,
                            max = -Infinity;
                        this.each(d => {
                            if (d.value < min) min = d.value;
                            if (d.value > max) max = d.value;
                        });
                        let ratio = (newmax - newmin) / (max - min);
                        return this.each(d => (d.value = (d.value - min) * ratio + newmin));
                    };

                    path = (target) => {
                        let current = this;
                        let branches = [this];
                        let mrca = this.getMRCA(target);
                        while (current !== mrca) {
                            current = current.parent;
                            branches.push(current);
                        }
                        let k = branches.length;
                        current = target;
                        while (current !== mrca) {
                            branches.splice(k, 0, current);
                            current = current.parent;
                        }
                        return branches;
                    };

                    remove = () => {
                        let root = this.getRoot();
                        this.isolate();
                        return root;
                    };

                    replace = (replacement) => {
                        let root = this.getRoot();
                        let parent = this.parent;
                        let index = this.parent.children.indexOf(this);
                        this.parent.children.splice(index, 1, replacement);
                        return root;
                    };

                    reroot = () => {
                        let current = this;
                        let toInvert = [];
                        while (!current.isRoot()) {
                            toInvert.push(current);
                            current = current.parent;
                        }
                        toInvert.reverse().forEach(c => c.invert());
                        return this.fixDistances();
                    };

                    rotate = (recursive) => {
                        if (!this.children) return this;
                        this.children.reverse();
                        return this;
                    };

                    setLength = (length) => {
                        this.length = length;
                        return this;
                    };

                    setParent = (parent = null) => {
                        if (!(this.parent instanceof Branch) && this.parent !== null)
                            throw Error("Cannot set parent to non-Branch object!");

                        this.parent = parent;
                        return this;
                    };

                    simplify = () => {
                        this.eachAfter(branch => {
                            if (branch.children.length == 1) {
                                let child = branch.children[0];
                                if (child.id == '') {
                                    child.id = branch.id;
                                } else {
                                    child.id = branch.id + "+" + child.id;
                                }
                                branch.excise();
                            }
                        });
                        return this.fixDistances();
                    };

                    sort = (comparator = null) => {
                        if (!comparator) comparator = (a, b) => a.value - b.value;
                        return this.eachBefore(d => d.children.sort(comparator));
                    };

                    sources = (cousin = null) => {
                        let mrca = this.getMRCA(cousin);
                        return mrca.depthOf(this) < mrca.depthOf(cousin);
                    };

                    sum = (value = null) => {
                        if (!value) value = d => d.value;
                        return this.eachAfter(
                            d => (d.value = value(d) + d.children.reduce((a, c) => a + c.value, 0))
                        );
                    };

                    targets = (cousin = null) => {
                        return cousin.sources(this);
                    };

                    toJSON = () => {
                        return this.toObject();
                    };

                    toMatrix = () => {
                        let leafs = this.getLeaves();
                        let n = leafs.length;
                        let matrix = new Array(n);
                        for (let i = 0; i < n; i++) {
                            matrix[i] = new Array(n);
                            matrix[i][i] = 0;
                            for (let j = 0; j < i; j++) {
                                let distance = leafs[i].distanceTo(leafs[j]);
                                matrix[i][j] = distance;
                                matrix[j][i] = distance;
                            }
                        }
                        return {
                            matrix: matrix,
                            ids: leafs.map(d => d.id)
                        };
                    };

                    toNewick = (nonterminus = null) => {
                        let out = "";
                        if (!this.isLeaf()) {
                            out +=
                                "(" + this.children.map(child => child.toNewick(true)).join(",") + ")";
                        }
                        out += this.id;
                        if (this.length) out += ":" + this.numberToString(this.length);
                        if (!nonterminus) out += ";";
                        return out;
                    };

                    toObject = () => {
                        let output: any = {
                            id: this.id,
                            length: this.length
                        };
                        if (this.children.length > 0)
                            output.children = this.children.map(c => c.toObject());
                        return output;
                    };

                    toString = (replacer = null, width = null) => {
                        if (!replacer) replacer = null;
                        if (!width) width = 0;
                        return JSON.stringify(this, replacer, width);
                    };

                    numberToString = (num = null) => {
                        let numStr = String(num);
                        if (Math.abs(num) < 1.0) {
                            let e = parseInt(num.toString().split("e-")[1]);
                            if (e) {
                                let negative = num < 0;
                                if (negative) num *= -1;
                                num *= Math.pow(10, e - 1);
                                numStr = "0." + new Array(e).join("0") + num.toString().substring(2);
                                if (negative) numStr = "-" + numStr;
                            }
                        } else {
                            let e = parseInt(num.toString().split("+")[1]);
                            if (e > 20) {
                                e -= 20;
                                num /= Math.pow(10, e);
                                numStr = num.toString() + new Array(e + 1).join("0");
                            }
                        }
                        return numStr;
                    };

                    addChild = (data = null) => {
                        let c;
                        if (data instanceof Branch) {
                            c = data;
                            c.parent = this;
                        } else {
                            if (!data) data = {};
                            c = new Branch(
                                Object.assign(data, {
                                    parent: this
                                })
                            );
                        }
                        this.children.push(c);
                        return c;
                    };

                    fixParenthood = (nonrecursive = null) => {
                        this.children.forEach(child => {
                            if (!child.parent) child.parent = this;
                            if (child.parent !== this) child.parent = this;
                            if (!nonrecursive && child.children.length > 0) {
                                child.fixParenthood();
                            }
                        });
                        return this;
                    };

                }
                           
            
            let start = Date.now();

            const matrix = e.matrix;
            let patristic = new Patristic();
            
            console.log('parsingggg');
            const RNJ = patristic.parseMatrix(matrix, e.labels);
            console.log('Tree Compute time: ', (Date.now() - start).toLocaleString(), 'ms');
            start = Date.now();
            const encoder = new TextEncoder();
            const output = encoder.encode(JSON.stringify(RNJ.toObject())).buffer;


            let response = {};
            response = { tree: output, start: start, data: output };

            postMessage(response, null, null);
        }

        onmessage = (evt) => {
            compute_tree(evt.data);
        }

    });

    public compute_directionalityWorker = new InlineWorker(() => {

        const compute_directionality = (e): any => {


            class Patristic {

                constructor() { };

                parseJSON = (json = null, idLabel = null, lengthLabel = null, childrenLabel = null) => {
                    if (!idLabel) idLabel = "id";
                    if (!lengthLabel) lengthLabel = "length";
                    if (!childrenLabel) childrenLabel = "children";
                    if (typeof json === "string") json = JSON.parse(json);
                    let root = new Branch({
                        id: json[idLabel],
                        length: json[lengthLabel]
                    });
                    if (json[childrenLabel] instanceof Array) {
                        json[childrenLabel].forEach(child => {
                            root.addChild(this.parseJSON(child));
                        });
                    }
                    return root.fixDistances();
                };

                parseMatrix = (matrix = null, labels = null) => {
                    let that: any = {};
                    let N = (that.N = matrix.length);

                 
                    if (!labels) labels = [new Array(N).keys()]; //[...Array(N).keys()];
                    that.cN = that.N;
                    that.D = matrix;
                    that.labels = labels;
                    that.labelToTaxon = {};
                    that.currIndexToLabel = new Array(N);
                    that.rowChange = new Array(N);
                    that.newRow = new Array(N);
                    that.labelToNode = new Array(2 * N);
                    that.nextIndex = N;
                    that.I = new Array(that.N);
                    that.S = new Array(that.N);
                    for (let i = 0; i < that.N; i++) {
                        let sortedRow = this.sortWithIndices(that.D[i], i);
                        that.S[i] = sortedRow;
                        that.I[i] = sortedRow.sortIndices;
                    }
                    that.removedIndices = new Set();
                    that.indicesLeft = new Set();
                    for (let i = 0; i < N; i++) {
                        that.currIndexToLabel[i] = i;
                        that.indicesLeft.add(i);
                    }
                    that.rowSumMax = 0;
                    that.PNewick = "";
                    let minI, minJ, d1, d2, l1, l2, node1, node2, node3;

                    function setUpNode(labelIndex, distance) {
                        let node;
                        if (labelIndex < that.N) {
                            node = new Branch({ id: that.labels[labelIndex], length: distance });
                            that.labelToNode[labelIndex] = node;
                        } else {
                            node = that.labelToNode[labelIndex];
                            node.setLength(distance);
                        }
                        return node;
                    }

                    that.rowSums = this.sumRows(that.D);
                    for (let i = 0; i < that.cN; i++) {
                        if (that.rowSums[i] > that.rowSumMax) that.rowSumMax = that.rowSums[i];
                    }

                    while (that.cN > 2) {
                        //if (that.cN % 100 == 0 ) console.log(that.cN);
                        ({ minI, minJ } = this.search(that));

                        d1 =
                            0.5 * that.D[minI][minJ] +
                            (that.rowSums[minI] - that.rowSums[minJ]) / (2 * that.cN - 4);
                        d2 = that.D[minI][minJ] - d1;

                        l1 = that.currIndexToLabel[minI];
                        l2 = that.currIndexToLabel[minJ];

                        node1 = setUpNode(l1, d1);
                        node2 = setUpNode(l2, d2);
                        node3 = new Branch({ children: [node1, node2] });

                        this.recalculateDistanceMatrix(that, minI, minJ);
                        let sorted = this.sortWithIndices(that.D[minJ], minJ);
                        that.S[minJ] = sorted;
                        that.I[minJ] = sorted.sortIndices;
                        that.S[minI] = that.I[minI] = [];
                        that.cN--;

                        that.labelToNode[that.nextIndex] = node3;
                        that.currIndexToLabel[minI] = -1;
                        that.currIndexToLabel[minJ] = that.nextIndex++;
                    }

                    let left = that.indicesLeft.values();
                    minI = left.next().value;
                    minJ = left.next().value;

                    l1 = that.currIndexToLabel[minI];
                    l2 = that.currIndexToLabel[minJ];
                    d1 = d2 = that.D[minI][minJ] / 2;

                    node1 = setUpNode(l1, d1);
                    node2 = setUpNode(l2, d2);

                    let tree = new Branch({ children: [node1, node2] });
                    tree.fixParenthood();
                    return tree.fixDistances();
                };

                search = (t = null) => {
                    let qMin = Infinity,
                        D = t.D,
                        cN = t.cN,
                        n2 = cN - 2,
                        S = t.S,
                        I = t.I,
                        rowSums = t.rowSums,
                        removedColumns = t.removedIndices,
                        uMax = t.rowSumMax,
                        q,
                        minI = -1,
                        minJ = -1,
                        c2;

                    // initial guess for qMin
                    for (let r = 0; r < t.N; r++) {
                        if (removedColumns.has(r)) continue;
                        c2 = I[r][0];
                        if (removedColumns.has(c2)) continue;
                        q = D[r][c2] * n2 - rowSums[r] - rowSums[c2];
                        if (q < qMin) {
                            qMin = q;
                            minI = r;
                            minJ = c2;
                        }
                    }

                    for (let r = 0; r < t.N; r++) {
                        if (removedColumns.has(r)) continue;
                        for (let c = 0; c < S[r].length; c++) {
                            c2 = I[r][c];
                            if (removedColumns.has(c2)) continue;
                            if (S[r][c] * n2 - rowSums[r] - uMax > qMin) break;
                            q = D[r][c2] * n2 - rowSums[r] - rowSums[c2];
                            if (q < qMin) {
                                qMin = q;
                                minI = r;
                                minJ = c2;
                            }
                        }
                    }

                    return { minI, minJ };
                };

                recalculateDistanceMatrix = (t, joinedIndex1, joinedIndex2) => {
                    let D = t.D,
                        n = D.length,
                        sum = 0,
                        aux,
                        aux2,
                        removedIndices = t.removedIndices,
                        rowSums = t.rowSums,
                        newRow = t.newRow,
                        rowChange = t.rowChange,
                        newMax = 0;

                    removedIndices.add(joinedIndex1);
                    for (let i = 0; i < n; i++) {
                        if (removedIndices.has(i)) continue;
                        aux = D[joinedIndex1][i] + D[joinedIndex2][i];
                        aux2 = D[joinedIndex1][joinedIndex2];
                        newRow[i] = 0.5 * (aux - aux2);
                        sum += newRow[i];
                        rowChange[i] = -0.5 * (aux + aux2);
                    }
                    for (let i = 0; i < n; i++) {
                        D[joinedIndex1][i] = -1;
                        D[i][joinedIndex1] = -1;
                        if (removedIndices.has(i)) continue;
                        D[joinedIndex2][i] = newRow[i];
                        D[i][joinedIndex2] = newRow[i];
                        rowSums[i] += rowChange[i];
                        if (rowSums[i] > newMax) newMax = rowSums[i];
                    }
                    rowSums[joinedIndex1] = 0;
                    rowSums[joinedIndex2] = sum;
                    if (sum > newMax) newMax = sum;
                    t.rowSumMax = newMax;
                    t.indicesLeft.delete(joinedIndex1);
                }

                sumRows = (a = null) => {
                    let n = a.length,
                        sums = new Array(n);
                    for (let i = 0; i < n; i++) {
                        let sum = 0;
                        for (let j = 0; j < n; j++) {
                            let v = parseFloat(a[i][j]);
                            if (typeof v !== "number") continue;
                            sum += a[i][j];
                        }
                        sums[i] = sum;
                    }
                    return sums;
                }

                sortWithIndices = (toSort, skip) => {
                    if (typeof skip === "undefined") skip = -1;
                    let n = toSort.length;
                    let indexCopy: any = new Array(n);
                    let valueCopy: any = new Array(n);
                    let i2 = 0;
                    for (let i = 0; i < n; i++) {
                        if (toSort[i] === -1 || i === skip) continue;
                        indexCopy[i2] = i;
                        valueCopy[i2++] = toSort[i];
                    }
                    indexCopy.length = i2;
                    valueCopy.length = i2;
                    indexCopy.sort((a, b) => toSort[a] - toSort[b]);
                    valueCopy.sortIndices = indexCopy;
                    for (let j = 0; j < i2; j++) {
                        valueCopy[j] = toSort[indexCopy[j]];
                    }
                    return valueCopy;
                };

                parseNewick = (newick = null) => {
                    let ancestors = [],
                        tree = new Branch(),
                        tokens = newick.split(/\s*(;|\(|\)|,|:)\s*/),
                        n = tokens.length;
                    for (let t = 0; t < n; t++) {
                        let token = tokens[t];
                        let c;
                        switch (token) {
                            case "(": // new Branchset
                                c = tree.addChild();
                                ancestors.push(tree);
                                tree = c;
                                break;
                            case ",": // another Branch
                                c = ancestors[ancestors.length - 1].addChild();
                                tree = c;
                                break;
                            case ")": // optional name next
                                tree = ancestors.pop();
                                break;
                            case ":": // optional length next
                                break;
                            default:
                                let x = tokens[t - 1];
                                if (x == ")" || x == "(" || x == ",") {
                                    tree.id = token;
                                } else if (x == ":") {
                                    tree.length = parseFloat(token);
                                }
                        }
                    }
                    return tree.fixDistances();
                };

            }

            class Branch {

                _Patristic: Patristic = new Patristic();

                _guid: any = null;
                id: any = null;
                data: any = null;
                depth: any = 0;
                height: any = 0;
                length: any = 0;
                parent: any = null;
                children: any = [];
                value: any = [];
                respresenting: any = 1;


                constructor(data = null, children = null) {

                    if (!data) data = {};
                    if (!children) children = d => d.children;
                    Object.assign(this, {
                        _guid: this.guid(),
                        id: data.id || "",
                        data: data,
                        depth: data.depth || 0,
                        height: data.height || 0,
                        length: data.length || 0,
                        parent: data.parent || null,
                        children: children(data) || [],
                        value: data.value || 1,
                        respresenting: 1
                    });
                }


                guid = () => {
                    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                        var r = Math.random() * 16 | 0,
                            v = c == 'x' ? r : (r & 0x3 | 0x8);
                        return v.toString(16);
                    });
                }

                addParent = (data, siblings) => {
                    if (!siblings) siblings = [];
                    let c;
                    if (data instanceof Branch) {
                        c = data;
                    } else {
                        if (!data) data = {};
                        c = new Branch(Object.assign(data));
                    }
                    siblings.forEach(sib => sib.setParent(c));
                    c.children = [this].concat(siblings);
                    this.parent = c;
                    return this;
                };

                ancestors = () => {
                    return this.getAncestors(true);
                };

                clone = () => {
                    return this._Patristic.parseJSON(this.toObject());
                };

                consolidate = () => {
                    return this.eachAfter(branch => {
                        if (branch.isRoot() || branch.length >= 0.0005) return;
                        if (branch.parent.id == "") {
                            branch.parent.id = branch.id;
                        } else {
                            branch.parent.id += '+' + branch.id;
                        }
                        branch.excise();
                    }).fixDistances();
                };

                copy = () => {
                    let newThis = this._Patristic.parseJSON(JSON.stringify(this));
                    newThis.parent = null;
                    return newThis.fixDistances();
                };

                count = () => {
                    return this.sum(() => 1);
                };

                descendants = () => {
                    return this.getDescendants(true);
                };

                depthOf = (descendant) => {
                    let distance = this.length;
                    if (typeof descendant == "string")
                        descendant = this.getDescendant(descendant);
                    if (typeof descendant == "undefined")
                        throw Error("Cannot compute depth of undefined descendant!");
                    let current = descendant;
                    while (current != this) {
                        distance += current.length;
                        current = current.parent;
                    }
                    return distance;
                };

                distanceBetween = (descendantA, descendantB) => {
                    let mrca = descendantA.getMRCA(descendantB);
                    return mrca.depthOf(descendantA) + mrca.depthOf(descendantB);
                };

                distanceTo = (cousin) => {
                    let mrca = this.getMRCA(cousin);
                    return mrca.depthOf(this) + mrca.depthOf(cousin);
                };

                each = (callback) => {
                    let branch = this,
                        next = [branch],
                        current;
                    while (next.length) {
                        current = next.reverse();
                        next = [];
                        while ((branch = current.pop())) {
                            callback(branch);
                            branch.eachChild(child => next.push(child));
                        }
                    }
                    return this;
                };

                eachAfter = (callback) => {
                    this.eachChild(child => child.eachAfter(callback));
                    callback(this);
                    return this;
                };

                eachBefore = (callback) => {
                    callback(this);
                    this.eachChild(child => child.eachBefore(callback));
                    return this;
                };

                eachChild = (callback) => {
                    this.children.forEach(callback);
                    return this;
                };

                excise = () => {
                    if (this.isRoot() && this.children.length > 1) {
                        throw new Error("Cannot excise a root Branch with multiple children.");
                    }
                    this.eachChild(child => {
                        child.length += this.length;
                        child.parent = this.parent;
                        if (!this.isRoot()) this.parent.children.push(child);
                    });
                    this.parent.children.splice(this.parent.children.indexOf(this), 1);
                    this.parent.representing++;
                    return this.parent;
                };

                fixDistances = () => {
                    let maxdepth = 0,
                        root = this.getRoot();
                    root.depth = 0;
                    this.eachBefore(d => {
                        if (d.isRoot()) return;
                        d.depth = d.parent.depth + 1;
                        if (d.depth > maxdepth) maxdepth = d.depth;
                    }).eachAfter(d => {
                        d.height = maxdepth - d.depth;
                        d.value = d.value + d.children.reduce((a, c) => a + c.value, 0);
                    });
                    return this;
                };

                flip = () => {
                    return this.each(c => c.rotate());
                };

                getAncestors = (includeSelf) => {
                    let ancestors = includeSelf ? [this] : [];
                    let current = this;
                    while ((current = current.parent)) ancestors.push(current);
                    return ancestors;
                };

                getChild = (childID) => {
                    if (!(typeof childID == "string"))
                        throw Error("childID is not a String!");
                    return this.children.find(c => c.id === childID);
                };

                getDescendant = (id) => {
                    if (this.id === id) return this;
                    let children = this.children,
                        n = children.length;
                    if (children) {
                        for (let i = 0; i < n; i++) {
                            let descendant = children[i].getDescendant(id);
                            if (descendant) return descendant;
                        }
                    }
                };

                getDescendants = (includeSelf = null) => {
                    let descendants = includeSelf ? [this] : [];
                    if (!this.isLeaf()) {
                        this.children.forEach(child => {
                            child.getDescendants(true).forEach(d => descendants.push(d));
                        });
                    }
                    return descendants;
                };

                getLeafs = () => {
                    return this.getLeaves();
                };

                getLeaves = () => {
                    if (this.isLeaf()) {
                        return [this];
                    } else {
                        let descendants = [];
                        this.children.forEach(child => {
                            child.getLeaves().forEach(d => descendants.push(d));
                        });
                        return descendants;
                    }
                    throw new Error("Something very weird happened. Sorry about that!");
                };

                getMRCA = (cousin) => {
                    let mrca = this;
                    while (!mrca.hasDescendant(cousin)) {
                        if (mrca.isRoot())
                            throw Error(
                                "Branch and cousin do not appear to share a common ancestor!"
                            );
                        mrca = mrca.parent;
                    }
                    return mrca;
                };

                getRoot = () => {
                    let branch = this;
                    while (!branch.isRoot()) branch = branch.parent;
                    return branch;
                };

                hasChild = (child) => {
                    if (child instanceof Branch) {
                        return this.children.includes(child);
                    } else if (typeof child === "string") {
                        return this.children.some(c => c.id === child);
                    }
                    throw Error(
                        `Unknown type of child (${typeof child}) passed to Branch.hasChild!`
                    );
                };

                hasDescendant = (descendant) => {
                    let descendants = this.getDescendants();
                    if (descendant instanceof Branch) {
                        return descendants.some(d => d === descendant);
                    } else if (typeof descendant === "string") {
                        return descendants.some(d => d.id === descendant);
                    }
                    throw Error("Unknown type of descendant passed to Branch.hasDescendant!");
                };

                includes = (container: any, value: any) => {
                    var returnValue = false;
                    var pos = container.indexOf(value);
                    if (pos >= 0) {
                        returnValue = true;
                    }

                    return returnValue;
                };

                hasLeaf = (leaf) => {
                    let leaves = this.getLeaves();
                    if (leaf instanceof Branch) {
                        return this.includes(leaves, leaf);
                    } else if (typeof leaf === "string") {
                        return leaves.some(d => d.id === leaf);
                    }
                    throw Error("Unknown type of leaf passed to Branch.hasLeaf.");
                };

                invert = () => {
                    let oldParent = this.parent;
                    if (oldParent) {
                        let temp = this.parent.length;
                        this.parent.length = this.length;
                        this.length = temp;
                        this.parent = oldParent.parent;
                        this.children.push(oldParent);
                        oldParent.parent = this;
                        oldParent.children.splice(oldParent.children.indexOf(this), 1);
                    } else {
                        throw Error("Cannot invert root node!");
                    }
                    return this;
                };

                isChildOf = (parent) => {
                    if (parent instanceof Branch) return this.parent === parent;
                    if (typeof parent === "string") return this.parent.id === parent;
                    throw Error("Unknown parent type passed to Branch.isChildOf");
                };

                isConsistent = () => {
                    if (!this.isRoot()) {
                        if (!this.parent.children.includes(this)) return false;
                    }
                    if (!this.isLeaf()) {
                        if (this.children.some(c => c.parent !== this)) return false;
                        return this.children.every(c => c.isConsistent());
                    }
                    return true;
                };

                isDescendantOf = (ancestor) => {
                    if (!ancestor || !this.parent) return false;
                    if (this.parent === ancestor || this.parent.id === ancestor) return true;
                    return this.parent.isDescendantOf(ancestor);
                };

                isLeaf = () => {
                    return this.children.length === 0;
                };

                isolate = () => {
                    let index = this.parent.children.indexOf(this);
                    this.parent.children.splice(index, 1);
                    this.setParent(null);
                    return this;
                };

                isRoot = () => {
                    return this.parent === null;
                };

                leafs = () => {
                    return this.getLeaves();
                };

                leaves = () => {
                    return this.getLeaves();
                };

                links = () => {
                    let links = [];
                    this.each(d => {
                        if (d.isRoot()) return;
                        links.push({
                            source: d.parent,
                            target: d
                        });
                    });
                    return links;
                };

                normalize = (newmin, newmax) => {
                    if (typeof newmax !== "number") newmax = 1;
                    if (typeof newmin !== "number") newmin = 0;
                    let min = Infinity,
                        max = -Infinity;
                    this.each(d => {
                        if (d.value < min) min = d.value;
                        if (d.value > max) max = d.value;
                    });
                    let ratio = (newmax - newmin) / (max - min);
                    return this.each(d => (d.value = (d.value - min) * ratio + newmin));
                };

                path = (target) => {
                    let current = this;
                    let branches = [this];
                    let mrca = this.getMRCA(target);
                    while (current !== mrca) {
                        current = current.parent;
                        branches.push(current);
                    }
                    let k = branches.length;
                    current = target;
                    while (current !== mrca) {
                        branches.splice(k, 0, current);
                        current = current.parent;
                    }
                    return branches;
                };

                remove = () => {
                    let root = this.getRoot();
                    this.isolate();
                    return root;
                };

                replace = (replacement) => {
                    let root = this.getRoot();
                    let parent = this.parent;
                    let index = this.parent.children.indexOf(this);
                    this.parent.children.splice(index, 1, replacement);
                    return root;
                };

                reroot = () => {
                    let current = this;
                    let toInvert = [];
                    while (!current.isRoot()) {
                        toInvert.push(current);
                        current = current.parent;
                    }
                    toInvert.reverse().forEach(c => c.invert());
                    return this.fixDistances();
                };

                rotate = (recursive) => {
                    if (!this.children) return this;
                    this.children.reverse();
                    return this;
                };

                setLength = (length) => {
                    this.length = length;
                    return this;
                };

                setParent = (parent = null) => {
                    if (!(this.parent instanceof Branch) && this.parent !== null)
                        throw Error("Cannot set parent to non-Branch object!");

                    this.parent = parent;
                    return this;
                };

                simplify = () => {
                    this.eachAfter(branch => {
                        if (branch.children.length == 1) {
                            let child = branch.children[0];
                            if (child.id == '') {
                                child.id = branch.id;
                            } else {
                                child.id = branch.id + "+" + child.id;
                            }
                            branch.excise();
                        }
                    });
                    return this.fixDistances();
                };

                sort = (comparator = null) => {
                    if (!comparator) comparator = (a, b) => a.value - b.value;
                    return this.eachBefore(d => d.children.sort(comparator));
                };

                sources = (cousin = null) => {
                    let mrca = this.getMRCA(cousin);
                    return mrca.depthOf(this) < mrca.depthOf(cousin);
                };

                sum = (value = null) => {
                    if (!value) value = d => d.value;
                    return this.eachAfter(
                        d => (d.value = value(d) + d.children.reduce((a, c) => a + c.value, 0))
                    );
                };

                targets = (cousin = null) => {
                    return cousin.sources(this);
                };

                toJSON = () => {
                    return this.toObject();
                };

                toMatrix = () => {
                    let leafs = this.getLeaves();
                    let n = leafs.length;
                    let matrix = new Array(n);
                    for (let i = 0; i < n; i++) {
                        matrix[i] = new Array(n);
                        matrix[i][i] = 0;
                        for (let j = 0; j < i; j++) {
                            let distance = leafs[i].distanceTo(leafs[j]);
                            matrix[i][j] = distance;
                            matrix[j][i] = distance;
                        }
                    }
                    return {
                        matrix: matrix,
                        ids: leafs.map(d => d.id)
                    };
                };

                toNewick = (nonterminus = null) => {
                    let out = "";
                    if (!this.isLeaf()) {
                        out +=
                            "(" + this.children.map(child => child.toNewick(true)).join(",") + ")";
                    }
                    out += this.id;
                    if (this.length) out += ":" + this.numberToString(this.length);
                    if (!nonterminus) out += ";";
                    return out;
                };

                toObject = () => {
                    let output: any = {
                        id: this.id,
                        length: this.length
                    };
                    if (this.children.length > 0)
                        output.children = this.children.map(c => c.toObject());
                    return output;
                };

                toString = (replacer = null, width = null) => {
                    if (!replacer) replacer = null;
                    if (!width) width = 0;
                    return JSON.stringify(this, replacer, width);
                };

                numberToString = (num = null) => {
                    let numStr = String(num);
                    if (Math.abs(num) < 1.0) {
                        let e = parseInt(num.toString().split("e-")[1]);
                        if (e) {
                            let negative = num < 0;
                            if (negative) num *= -1;
                            num *= Math.pow(10, e - 1);
                            numStr = "0." + new Array(e).join("0") + num.toString().substring(2);
                            if (negative) numStr = "-" + numStr;
                        }
                    } else {
                        let e = parseInt(num.toString().split("+")[1]);
                        if (e > 20) {
                            e -= 20;
                            num /= Math.pow(10, e);
                            numStr = num.toString() + new Array(e + 1).join("0");
                        }
                    }
                    return numStr;
                };

                addChild = (data = null) => {
                    let c;
                    if (data instanceof Branch) {
                        c = data;
                        c.parent = this;
                    } else {
                        if (!data) data = {};
                        c = new Branch(
                            Object.assign(data, {
                                parent: this
                            })
                        );
                    }
                    this.children.push(c);
                    return c;
                };

                fixParenthood = (nonrecursive = null) => {
                    this.children.forEach(child => {
                        if (!child.parent) child.parent = this;
                        if (child.parent !== this) child.parent = this;
                        if (!nonrecursive && child.children.length > 0) {
                            child.fixParenthood();
                        }
                    });
                    return this;
                };

            }



            const start = Date.now();
            const links = e.links;
            const n = links.length;
            let patristic = new Patristic();
            const tree = patristic.parseJSON(e.tree);
            let flips = new Uint8Array(n);
            for (let i = 0; i < n; i++) {
                const link = links[i];
                const source = tree.getDescendant(link.source);
                const target = tree.getDescendant(link.target);
                if (source instanceof Branch && target instanceof Branch) {
                    if (target.sources(source)) {
                        flips[i] = 1;
                    }
                }
            }
            console.log('Directionality Inference time: ', (Date.now() - start).toLocaleString(), 'ms');

            let response = {};
            response = { output: flips.buffer, start: Date.now(), data: flips.buffer };

            postMessage(response, null, null);
        }

        onmessage = (evt) => {
            compute_directionality(evt.data);
        }

    });


    public compute_mstWorker = new InlineWorker(() => {

        const compute_mst = (e): any => {

            const start = Date.now();
            const links = e.links;
            const dm = e.matrix;
            const labels = Object.keys(dm);
            const epsilon = Math.pow(10, e.epsilon);
            const metric = e.metric;
            const n = labels.length
            const m = links.length;
            let output = new Uint8Array(m);
            let matrix = [];
            let map : string[] = [];
            for (let i = 0; i < n; i++) {
                let minDist = Number.MAX_VALUE;
                let targets = [];
                const nodeid = labels[i];
                const row = dm[nodeid];
                for (let j = 0; j < n; j++) {
                  let cell = row[labels[j]];
                  if(!cell) {
                    targets.push(0);
                    continue;
                  };
                  let value = cell[metric];
                  targets.push(value);
                }
                matrix.push(targets);
                map.push(nodeid);
            }

            const minKey = (key, mstSet, V) => {
                let min = Number.MAX_VALUE;
                let min_index = -1;
                for (let v = 0; v < V; v++)
                  if (!mstSet[v] && key[v] < min) {
                      min = key[v];
                      min_index = v;
                  }
                return min_index;
              }
              
              const primMST = (graph) => {
                const V = graph.length;
                let parent = [];
                let key = [];
                let mstSet = [];
                for (let i = 0; i < V; i++) {
                    key[i] = Number.MAX_VALUE;
                    mstSet[i] = false;
                }
                key[0] = 0.0; 
                parent[0] = -1;
                for (let count = 0; count < V-1; count++) {
                    let u = minKey(key, mstSet, V);
                    if (u < 0) continue;
                    mstSet[u] = true;
              
                    if (graph[u].reduce((a, b) => a + b, 0) === 0 && u != 0) continue;
              
                    for (let v = 0; v < V; v++) {
                        if (graph[u][v] >= 0 && !mstSet[v] && graph[u][v] <  key[v]) {
                            parent[v]  = u;
                            key[v] = graph[u][v];
                        }
                    }
                }
                return parent;
              }
              
              const nearest_neighbour_graph = (graph, mst_parents, epsilon) => {
                const V = graph.length;
                let mst = [];
                for (let i=0; i<V; ++i) {
                  mst.push([]);
                }
                for (let i=1; i<V; ++i) {
                  mst[i].push(mst_parents[i]);
                  mst[mst_parents[i]].push(i);
                }
                let nng = [];
                let longest_edge = [];
                for (let i=0; i<V; ++i) {
                  nng.push([]);
                  longest_edge.push([]);
                  for (let j=0; j<V; ++j) {
                      longest_edge[i][j] = 0;
                  }
                }
                for (let i=0; i<V; ++i) {
                  bfs_update_matrix(mst, graph, i, longest_edge);
                }
                for (let i=0; i<V; ++i) {
                  for (let j=0; j<V; ++j) {
                    if ((graph[i][j] > 0 ) && (graph[i][j] <= (longest_edge[i][j] * (1.0 + epsilon)))) {
                        nng[i].push(j);
                        nng[j].push(i);
                    } 
                  }
                }
                return nng;
              }
              
              const bfs_update_matrix = (mst, weights, root, longest_edge) => {
                let visited = [];
                let queue = [];
                queue.push(root);
                while (queue.length) {
                  let v = queue.shift();
                  visited[v] = true;
                  mst[v].forEach((u, index) => {
                    if(visited[u]) return;
                    queue.push(u);
                    const value = Math.max(weights[v][u], Math.max(longest_edge[root][u], longest_edge[root][v]));
                    longest_edge[root][u] = value;
                    longest_edge[u][root] = value;
                  })
                }
              }
    
            const mst = primMST(matrix);
            const nng = nearest_neighbour_graph(matrix, mst, epsilon);
        

            for (let i = 0; i < n; i++) {
              const source = map[i];
              nng[i].push(mst[i]);
              Array.from(new Set(nng[i])).forEach((u, index) => {
                const target = map[parseInt(u as string)];
                for(let k = 0; k < m; k++){
                  let l = links[k];
                  if((l.source == source && l.target == target) || (l.source == target && l.target == source)) {
                    output[k] = 1;
                  }
                }
              })
            }

            console.log('MST Compute time: ', (Date.now() - start).toLocaleString(), 'ms');

            let response = {};
            response = { links: output.buffer, start: Date.now(), data: output.buffer };

            postMessage(response, null, null);
        }

        onmessage = (evt) => {
            compute_mst(evt.data);
        }
      
    });

    public compute_nnWorker = new InlineWorker(() => {

        const compute_nn = (e): any => {

            const includes = (container: any, value: any) => {

                var returnValue = false;
                var pos = container.indexOf(value);
                if (pos >= 0) {
                    returnValue = true;
                }

                return returnValue;
            };



            const start = Date.now();
            const links = e.links,
                dm = e.matrix,
                labels = Object.keys(dm),
                epsilon = Math.pow(10, e.epsilon),
                metric = e.metric;
            const n = labels.length, m = links.length;
            let output = new Uint8Array(m);
            for (let i = 0; i < n; i++) {
                let minDist = Number.MAX_VALUE;
                let targets = [];
                const nodeid = labels[i];
                const row = dm[nodeid];
                for (let j = 0; j < i; j++) {
                    let cell = row[labels[j]];
                    if (!cell) continue;
                    let value = cell[metric];
                    if (typeof value != 'number' || isNaN(value)) continue;
                    if (value < minDist) minDist = value;
                }
                for (let h = 0; h < i; h++) {
                    let node = labels[h];
                    let cell = row[node];
                    if (!cell) continue;
                    let value = cell[metric];
                    if (typeof value != 'number' || isNaN(value)) continue;
                    if (Math.abs(value - minDist) < epsilon) {
                        targets.push(node);
                    }
                }
                for (let k = 0; k < m; k++) {
                    let l = links[k];

                    if ((l.source == nodeid && includes(targets, l.target)) ||
                        (l.target == nodeid && includes(targets, l.source))) {
                        output[k] = 1;
                    }
                }
            }

            console.log('NN Compute time: ', (Date.now() - start).toLocaleString(), 'ms');

            let response = {};
            response = { links: output.buffer, start: Date.now(), data: output.buffer };

            postMessage(response, null, null);
        }

        onmessage = (evt) => {
            compute_nn(evt.data);
        }
      
    });

    public compute_triangulationWorker = new InlineWorker(() => {

        const compute_triangulation = (e): any => {

            let start = Date.now();
            let m = e.matrix;
            let n = m.length;
            for (let i = 0; i < n; i++) {
                for (let j = 0; j < i; j++) {
                    let missingCell = m[i][j];
                    if (typeof missingCell == 'number') continue;
                    let minRange = Infinity, min = Infinity;
                    for (let k = 0; k < i; k++) {
                        let companionA = m[i][k];
                        if (typeof companionA != 'number') continue;
                        for (let l = j + 1; l < n; l++) {
                            let companionB = m[l][j];
                            if (typeof companionB != 'number') continue;
                            let diff = Math.abs(companionA - companionB);
                            if (minRange > diff) {
                                minRange = diff;
                                min = Math.min(companionA, companionB);
                            }
                        }
                    }
                    if (minRange < Infinity) {
                        let newVal = min + minRange / 2;
                        m[i][j] = newVal;
                        m[j][i] = newVal;
                    }
                }
            }
            console.log('Triangulation Compute time: ', (Date.now() - start).toLocaleString(), 'ms');
            start = Date.now();
            let encoder = new TextEncoder();
            let output = encoder.encode(JSON.stringify(m)).buffer;

            let response = {}
            response = { matrix: output, start: start, data: output };

            postMessage(response, null, null);
        }

        onmessage = (evt) => {
            compute_triangulation(evt.data);
        }

    });

    public compute_parse_fastaWorker = new InlineWorker(() => {

        const compute_parse_fasta = (e): any => {

            var start = Date.now();
            var text = e.data;
            if (!text || text.length == 0) return [];
            var seqs: any = [], currentSeq: any = {};
            var lines = text.split(/[\r\n]+/g);
            var n = lines.length;
            var isblank = /^\s*$/;
            for (var i = 0; i < n; i++) {
                var line = lines[i];
                if (isblank.test(line) || line[0] == ';') continue;
                if (line[0] == '>') {
                    if (i > 0) seqs.push(currentSeq);
                    currentSeq = {
                        id: line.slice(1),
                        seq: ''
                    };
                } else {
                    currentSeq.seq += line.toUpperCase();
                }
            }
            seqs.push(currentSeq);
            console.log('FASTA Parse time: ', (Date.now() - start).toLocaleString(), 'ms');
            start = Date.now();
            var encoder = new TextEncoder();
            var output = encoder.encode(JSON.stringify(seqs)).buffer;


            let response = {};
            response = { nodes: output, start: start, data: output };

            postMessage(response, null, null);
        }

        onmessage = (evt) => {
            compute_parse_fasta(evt);
        }

    });

    // public compute_parse_csv_matrixWorker = new Worker('parse-csv-matrix.worker.js');

    public compute_align_swWorker = new InlineWorker(() => {

        const compute_align_sw = (e): any => {

            let start = Date.now();
            let subset = e.nodes;
            let reference = e.reference;
            let n = subset.length;
            for (let i = 0; i < n; i++) {
                let node = subset[i];
                let rst = bioseq.align(
                    reference,
                    node.seq,
                    false,
                    e.match,
                    e.gap
                );
                let fmt = bioseq.cigar2gaps(
                    reference,
                    node.seq,
                    rst.position,
                    rst.CIGAR,
                    true
                );
                node._score = rst.score;
                node._padding = rst.position;
                node._cigar = rst.CIGAR;
                node._seq = fmt[1];
            }
            console.log("Alignment time: ", (Date.now() - start).toLocaleString(), "ms");
            start = Date.now();
            let encoder = new TextEncoder();
            let output = encoder.encode(JSON.stringify(subset)).buffer;

            let response = {};
            response = { data: output, start: start };

            postMessage(response, null, null);

        }

        onmessage = (evt) => {
            compute_align_sw(evt.data);
        }

    });



}







