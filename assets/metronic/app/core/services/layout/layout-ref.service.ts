import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable()
export class LayoutRefService {
    layoutRefs$: BehaviorSubject<any> = new BehaviorSubject<any>({});
    layoutRefs: any = {};

    addElement(name, element) {
        const obj = {};
        obj[name] = element;
        this.layoutRefs$.next(Object.assign(this.layoutRefs, obj));
    }
}
