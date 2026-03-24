import { OnInit, Injectable } from '@angular/core';
import { InlineWorker } from '../helperClasses/inlineWorker';

@Injectable({
  providedIn: 'root'
})
export class WorkerModule implements OnInit {

  // This one is still a traditional worker.
  public compute_parse_csv_matrixWorker: Worker;

  constructor() {
    this.compute_parse_csv_matrixWorker = new Worker('assets/parse-csv-matrix.js');
  }

  ngOnInit() {}

  public getAlignWorker(): InlineWorker {
    return new InlineWorker('align');
  }

  public getConsensusWorker(): InlineWorker {
    return new InlineWorker('consensus');
  }

  public getAmbiguityCountsWorker(): InlineWorker {
    return new InlineWorker('ambiguityCounts');
  }

  public getLinksWorker(): InlineWorker {
    return new InlineWorker('links');
  }

  public getTreeWorker(): InlineWorker {
    return new InlineWorker('tree');
  }

  public getDirectionalityWorker(): InlineWorker {
    return new InlineWorker('directionality');
  }

  public getMSTWorker(): InlineWorker {
    return new InlineWorker('mst');
  }

  public getNNWorker(): InlineWorker {
    return new InlineWorker('nn');
  }

  public getTriangulationWorker(): InlineWorker {
    return new InlineWorker('triangulation');
  }

  public getParseFastaWorker(): InlineWorker {
    return new InlineWorker('parseFasta');
  }


}
