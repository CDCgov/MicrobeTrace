
// Moved out of alignment-view-plugin-component, so that it can be accessed from files view without having to initialize the whole view
/**
   * Adapted from  https://github.com/CDCgov/AlignmentViewer to also allow minimum charSetting, accepts array of seq (not array of seq objects)
   * @param seqs array of sequences objects ['ATGA...', 'TATA...', ...]
   * @param config  object: { width: number, height: number, charSetting:['hide'|'show'|'min'], fontSize: number, colors: {'A':'#000000', 'C': , 'G':, 'T':, 'ambig':}}
   * @returns promise of a HTMLCanvasElement showing the alignment
   */
export function generateCanvas(seqs, config) {
    config = Object.assign({
      width: 1,
      height: 1,
      'charSetting': 'hide'
    }, config, {
      colors: Object.assign({
        'A': '#ccff00',
        'C': '#ffff00',
        'G': '#ff9900',
        'T': '#ff6600',
        'ambig': '#ffffff'
      }, ('colors' in config) ? config.colors : {}),
    });
  
    return new Promise(resolve => {
      let longest = 0;
      let n = seqs.length;
      for (let i = 0; i < n; i++) {
        let seq = seqs[i].toUpperCase();
        if (seq.length > longest) longest = seq.length;
      }
      let ch = Math.max(1, Math.ceil(config.height));
      let cw = Math.max(1, Math.ceil(config.width));
      let width = Math.max(1, Math.ceil(longest * config.width));
      let height = Math.max(1, Math.ceil(seqs.length * config.height));
      let canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      let context = canvas.getContext('2d', { alpha: false });
      if (!context) {
        resolve(canvas);
        return;
      }
      context.fillStyle = config.colors['ambig'];
      context.fillRect(0, 0, width, height);
      if (n === 0 || longest === 0) {
        resolve(canvas);
        return;
      }
      Object.keys(config.colors).forEach(nucleotide => {
        if(nucleotide == 'ambig') return;
        context.fillStyle = config.colors[nucleotide];
        for (let row = 0; row < n; row ++) {
          let seq = seqs[row];
          let y = Math.floor(row * ch);
          for (let col = 0; col < longest; col++) {
            let c = seq[col];
            if(!c) break;
            if(c != nucleotide) continue;
            let x = Math.floor(col * cw);
            context.fillRect(x, y, cw, ch);
          }
        }
      });
      context.font = (config.fontSize) + 'px mono';
      context.textAlign = 'center';
      context.textBaseline = 'bottom';
      context.fillStyle = 'black';
      if(config.charSetting=='show'){
        for (let row = 0; row < n; row++) {
          let seq = seqs[row];
          let y = row * ch + ch;
          for (let col = 0; col < longest; col++) {
            let c = seq[col];
            if(!c) break;
            let x = col * cw + cw/2;
            context.fillText(c, x, y, cw);
          }
        }
      } else if (config.charSetting=='min'){
        let refSeq = seqs[0]
        for (let col = 0; col < longest; col++) {
          let c = refSeq[col];
          if(!c) break;
          let x = col * cw + cw/2;
          context.fillText(c, x, ch, cw);
        }

        for (let row = 1; row < n; row++) {
          let seq = seqs[row];
          let y = row * ch + ch;
          for (let col = 0; col < longest; col++) {
            let c = (refSeq[col] != seq[col] || seq[col]=='-' || refSeq[col] == ' ')? seq[col]: '.';
            if(!c) break;
            let x = col * cw + cw/2;
            context.fillText(c, x, y, cw);
          }
        } 

      }
      resolve(canvas);
    });
  }
