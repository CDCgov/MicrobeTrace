import { BehaviorSubject } from 'rxjs';
import { Injectable } from '@angular/core';
import { tap, filter, mergeMap } from 'rxjs/operators';
import { Router, NavigationEnd } from '@angular/router';
import { UtilsService } from './utils.service';

@Injectable()
export class LayoutConfigService {

    public onLayoutConfigUpdated$: BehaviorSubject<any>;

    constructor(
        private router: Router,
        private utils: UtilsService
    ) {
        // register on config changed event and set default config
        this.onLayoutConfigUpdated$ = new BehaviorSubject(null);

        this.router.events
            .pipe(
                filter(event => event instanceof NavigationEnd)
            )
            .subscribe(() => {
                this.onLayoutConfigUpdated$.next(null);
            });
    }
}
