import { AbpModule } from '@abp/abp.module';
import * as ngCommon from '@angular/common';
import { ModuleWithProviders, NgModule } from '@angular/core';
import { AppUrlService } from './nav/app-url.service';
import { AppUiCustomizationService } from './ui/app-ui-customization.service';
import { AppSessionService } from './session/app-session.service';
//import { CookieConsentService } from './session/cookie-consent.service';

@NgModule({
    imports: [
        ngCommon.CommonModule,
        AbpModule
    ]
})
export class CommonModule {
    static forRoot(): ModuleWithProviders<CommonModule> {
        return {
            ngModule: CommonModule,
            providers: [
                AppUiCustomizationService,
                //CookieConsentService,
                AppSessionService,
                AppUrlService
            ]
        };
    }
}