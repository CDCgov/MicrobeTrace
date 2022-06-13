import { Directive, AfterViewInit, ElementRef } from '@angular/core';
import { filter } from 'rxjs/operators';
import { NavigationEnd, Router } from '@angular/router';

@Directive({
    selector: '[mMenuAsideOffcanvas]'
})
export class MenuAsideOffcanvasDirective implements AfterViewInit {
    menuOffcanvas: any;

    constructor(
        private el: ElementRef,
        private router: Router
    ) {

    }

    ngAfterViewInit(): void {
        const offcanvasClass = mUtil.hasClass(this.el.nativeElement, 'm-aside-left--offcanvas-default') ? 'm-aside-left--offcanvas-default' : 'm-aside-left';

        this.menuOffcanvas = new mOffcanvas(this.el.nativeElement, {
            baseClass: offcanvasClass,
            overlay: true,
            closeBy: 'm_aside_left_close_btn',
            toggleBy: [{
                target: 'm_aside_left_offcanvas_toggle',
                state: 'm-brand__toggler--active'
            },
            {
                target: 'm_aside_left_offcanvas_mobile_toggle',
                state: 'm-brand__toggler--active'
            }]
        });

        this.router.events
            .pipe(filter(event => event instanceof NavigationEnd))
            .subscribe(event => {
                if (mUtil.isMobileDevice()) {
                    this.menuOffcanvas.hide();
                }
            });
    }
}
