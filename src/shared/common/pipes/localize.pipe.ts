import { Injector, Pipe, PipeTransform } from '@angular/core';
import { AppConsts } from '@shared/app.constants';
// import { LocalizationService } from '@abp/localization/localization.service';

@Pipe({
    name: 'localize'
})
export class LocalizePipe implements PipeTransform {

    localizationSourceName = AppConsts.localization.defaultLocalizationSourceName;

    // localization: LocalizationService;

    constructor(injector: Injector) {
        // this.localization = injector.get(LocalizationService);
    }

    l(key: string, ...args: any[]): string {
        args.unshift(key);
        args.unshift(this.localizationSourceName);
        return this.ls.apply(this, args);
    }

    ls(sourcename: string, key: string, ...args: any[]): string {
        return key;

        // let localizedText = this.localization.localize(key, sourcename);

        // if (!localizedText) {
        //     localizedText = key;
        // }

        // if (!args || !args.length) {
        //     return localizedText;
        // }

        // args.unshift(localizedText);
        // return this.localizedText;
        // return abp.utils.formatString.apply(this, this.flattenDeep(args));
    }

    transform(key: string, ...args: any[]): string {
        return this.l(key, args);
    }

    flattenDeep(array) {
        return array.reduce((acc, val) =>
            Array.isArray(val) ?
                acc.concat(this.flattenDeep(val)) :
                acc.concat(val),
            []);
    }
}
