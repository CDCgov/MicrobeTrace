// import { PermissionCheckerService } from '@abp/auth/permission-checker.service';
// import { FeatureCheckerService } from '@abp/features/feature-checker.service';
// import { LocalizationService } from '@abp/localization/localization.service';
// import { MessageService } from '@abp/message/message.service';
// import { AbpMultiTenancyService } from '@abp/multi-tenancy/abp-multi-tenancy.service';
// import { NotifyService } from '@abp/notify/notify.service';
// import { SettingService } from '@abp/settings/setting.service';
import { Injector } from '@angular/core';
import { AppConsts } from '@shared/app.constants';
import { AppUrlService } from '@shared/common/nav/app-url.service';
import { AppSessionService } from '@shared/common/session/app-session.service';
import { AppUiCustomizationService } from '@shared/common/ui/app-ui-customization.service';
import { PrimengTableHelper } from '@shared/helpers/PrimengTableHelper';
// import { UiCustomizationSettingsDto } from '@shared/service-proxies/service-proxies';

export abstract class AppComponentBase {

    localizationSourceName = AppConsts.localization.defaultLocalizationSourceName;

    // localization: LocalizationService;
    // permission: PermissionCheckerService;
    // feature: FeatureCheckerService;
    // notify: NotifyService;
    // setting: SettingService;
    // message: MessageService;
    // multiTenancy: AbpMultiTenancyService;
    localization: any;
    permission: any;
    feature: any;
    notify: any;
    setting: any;
    message: any;
    multiTenancy: any;
    appSession: AppSessionService;
    primengTableHelper: PrimengTableHelper;
    ui: AppUiCustomizationService;
    appUrlService: AppUrlService;

    constructor(injector: Injector
        ) {
        // this.localization = injector.get(LocalizationService);
        // this.permission = injector.get(PermissionCheckerService);
        // this.feature = injector.get(FeatureCheckerService);
        // this.notify = injector.get(NotifyService);
        // this.setting = injector.get(SettingService);
        // this.message = injector.get(MessageService);
        // this.multiTenancy = injector.get(AbpMultiTenancyService);
        this.appSession = injector.get(AppSessionService);
        this.ui = injector.get(AppUiCustomizationService);
        this.appUrlService = injector.get(AppUrlService);
        this.primengTableHelper = new PrimengTableHelper();
    }

    flattenDeep(array) {
        return array.reduce((acc, val) =>
            Array.isArray(val) ?
            acc.concat(this.flattenDeep(val)) :
            acc.concat(val),
            []);
    }

    l(key: string, ...args: any[]): string {
        args.unshift(key);
        args.unshift(this.localizationSourceName);
        return this.ls.apply(this, args);
    }

    ls(sourcename: string, key: string, ...args: any[]): string {
        let localizedText = this.localization.localize(key, sourcename);

        if (!localizedText) {
            localizedText = key;
        }

        if (!args || !args.length) {
            return localizedText;
        }

        args.unshift(localizedText);
        return localizedText;
        // return abp.utils.formatString.apply(this, this.flattenDeep(args));
    }

    isGranted(permissionName: string): boolean {
        return this.permission.isGranted(permissionName);
    }

    isGrantedAny(...permissions: string[]): boolean {
        if (!permissions) {
            return false;
        }

        for (const permission of permissions) {
            if (this.isGranted(permission)) {
                return true;
            }
        }

        return false;
    }

    s(key: string): string {
        return key;
        // return abp.setting.get(key);
    }

    appRootUrl(): string {
        return this.appUrlService.appRootUrl;
    }

    // get currentTheme(): UiCustomizationSettingsDto {
    //     // return this.appSession.theme;
    // }
}
