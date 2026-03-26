import { OnInit, Injectable } from '@angular/core';
import { InlineWorker } from '../helperClasses/inlineWorker';

@Injectable({
  providedIn: 'root'
})
export class WorkerModule implements OnInit {

  // This one is still a traditional worker.
  public compute_parse_csv_matrixWorker: Worker;

  // Dedicated patristic distance engine worker.
  // Uses its own worker file (not compute.worker.ts) because it maintains
  // persistent state (flattened tree, LCA index) across messages and uses
  // a custom message protocol with typed-array transfers.
  private patristicWorker: Worker | null = null;

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

  /**
   * Get or create the dedicated patristic distance engine worker.
   *
   * Unlike InlineWorker-based workers that share compute.worker.ts,
   * this is a standalone worker that:
   * - Maintains persistent tree state (flat arrays, LCA index)
   * - Uses typed-array transfers for zero-copy edge batches
   * - Supports cancellation and progress reporting
   * - Caches tree preprocessing across threshold changes
   *
   * The worker is created once and reused. Call terminatePatristicWorker()
   * to release it.
   */
  public getPatristicWorker(): Worker {
    if (!this.patristicWorker) {
      this.patristicWorker = new Worker(
        new URL('./patristic-engine.worker', import.meta.url),
        { type: 'module', name: 'mt-patristic-engine' }
      );
    }
    return this.patristicWorker;
  }

  /**
   * Terminate the patristic worker and release its resources.
   * Call this when loading a completely new session.
   */
  public terminatePatristicWorker(): void {
    if (this.patristicWorker) {
      this.patristicWorker.terminate();
      this.patristicWorker = null;
    }
  }

}
