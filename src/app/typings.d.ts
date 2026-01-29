///<reference path="../../node_modules/abp-web-resources/Abp/Framework/scripts/abp.d.ts"/>
///<reference path="../../node_modules/abp-web-resources/Abp/Framework/scripts/libs/abp.jquery.d.ts"/>
///<reference path="../../node_modules/abp-web-resources/Abp/Framework/scripts/libs/abp.signalr.d.ts"/>
///<reference path="../../node_modules/moment/moment.d.ts"/>
////<reference path="../../node_modules/@types/moment-timezone/index.d.ts"/>

// Typings reference file, see links for more information
// https://github.com/typings/typings
// https://www.typescriptlang.org/docs/handbook/writing-declaration-files.html

declare var System: any;
declare var $: any;
declare var jQuery: any;

declare var mOffcanvas: any; // Related to Metronic
declare var mMenu: any; // Related to Metronic
declare var mToggle: any; // Related to Metronic
declare var mUtil: any; // Related to Metronic
declare var mHeader: any; // Related to Metronic
declare var StripeCheckout: any;

declare namespace abp {
    namespace ui {
        function setBusy(elm?: any, text?: any, optionsOrPromise?: any): void;
    }
}

declare module "*.json" {
    const value: any;
    export default value;
}


/**
 * rtl-detect
 */

declare module 'rtl-detect';

declare module 'patristic';
