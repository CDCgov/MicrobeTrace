import { Directive, AfterViewInit, ElementRef } from '@angular/core';
import { filter } from 'rxjs/operators';
import { NavigationEnd, Router } from '@angular/router';

@Directive({
    selector: '[mMenuHorizontalOffcanvas]'
})
export class MenuHorizontalOffcanvasDirective implements AfterViewInit {
    menuOffcanvas: any;

    constructor(private el: ElementRef,
        private router: Router) { }

    ngAfterViewInit(): void {
        // init the mOffcanvas plugin
        this.menuOffcanvas = new mOffcanvas(this.el.nativeElement, {
            overlay: true,
            baseClass: 'm-aside-header-menu-mobile',
            closeBy: 'm_aside_header_menu_mobile_close_btn',
            toggleBy: {
                target: 'm_aside_header_menu_mobile_toggle',
                state: 'm-brand__toggler--active'
            }
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
