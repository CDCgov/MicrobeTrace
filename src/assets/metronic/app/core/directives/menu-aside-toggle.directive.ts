import { Directive, ElementRef, AfterViewInit } from '@angular/core';

@Directive({
    selector: '[mMenuAsideToggle]',
    standalone: false
})
export class MenuAsideToggleDirective implements AfterViewInit {
    toggle: any;
    constructor(private el: ElementRef) { }

    ngAfterViewInit(): void {
        this.toggle = new mToggle(this.el.nativeElement, {
            target: 'body',
            targetState: 'm-brand--minimize m-aside-left--minimize',
            togglerState: 'm-brand__toggler--active'
        });
    }
}
