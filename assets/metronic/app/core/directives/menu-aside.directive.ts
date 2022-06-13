import { Directive, ElementRef } from '@angular/core';
import { LayoutConfigService } from '../services/layout-config.service';
import * as objectPath from 'object-path';
import { LayoutRefService } from '../services/layout/layout-ref.service';
import { mergeMap } from 'rxjs/operators';

@Directive({
    selector: '[mMenuAside]'
})
export class MenuAsideDirective {
    menu: any;
    layout: any;

    constructor(
        private el: ElementRef,
        private layoutConfigService: LayoutConfigService,
        private layoutRefService: LayoutRefService
    ) {
        this.layoutConfigService.onLayoutConfigUpdated$
            .pipe(
                mergeMap(() => {
                    return this.layoutRefService.layoutRefs$;
                })
            )
            .subscribe(layout => {
                this.layout = layout;
                this.initMenu();
            });
    }

    initMenu(): any {
        if (!this.layout.hasOwnProperty('header')) {
            return;
        }

        let scroll;
        if (mUtil.attr(this.el.nativeElement, 'm-menu-scrollable') === '1') {
            const headerHeight = parseInt(window.getComputedStyle(objectPath.get(this.layout, 'header'))['height'], null);
            scroll = {
                height() {
                    return mUtil.getViewPort().height - headerHeight;
                }
            };
        }

        const options = {
            // vertical scroll
            scroll: scroll,
            // submenu setup
            submenu: {
                desktop: {
                    // by default the menu mode set to accordion in desktop mode
                    default: 'accordion',
                    // whenever body has this class switch the menu mode to dropdown
                    state: {
                        body: 'm-aside-left--minimize',
                        mode: 'dropdown'
                    }
                },
                tablet: 'accordion', // menu set to accordion in tablet mode
                mobile: 'accordion' // menu set to accordion in mobile mode
            },
            // accordion setup
            accordion: {
                autoScroll: false,
                expandAll: false
            }
        };

        // init the mMenu plugin
        if (this.menu instanceof mMenu) {
            this.menu.update(options);
        } else {
            this.menu = new mMenu(this.el.nativeElement, options);
        }
    }
}
