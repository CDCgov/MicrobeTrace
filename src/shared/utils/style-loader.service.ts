import { Injectable } from "@angular/core";
@Injectable()
export class StyleLoaderService {

    private styles: any = {};

    load(...styles: string[]) {
        this.styles = styles;
        let promises: any[] = [];
        styles.forEach((style) => promises.push(this.loadStyle(style)));
        return Promise.all(promises);
    }

    loadArray(styles: string[]) {
        this.styles = styles;
        let promises: any[] = [];
        styles.forEach((style) => promises.push(this.loadStyle(style)));
        return Promise.all(promises);
    }

    loadStyle(name: string) {
        return new Promise((resolve, reject) => {
            let style = (document.createElement('link') as any);
            style.type = 'text/css';
            style.rel = 'stylesheet';
            style.href = name;

            if (style.readyState) {  //IE
                style.onreadystatechange = () => {
                    if (style.readyState === 'loaded' || style.readyState === 'complete') {
                        style.onreadystatechange = null;
                        resolve({style: name, loaded: true, status: 'Loaded'});
                    }
                };
            } else {  //Others
                style.onload = () => {
                    resolve({ style: name, loaded: true, status: 'Loaded'});
                };
            }

            style.onerror = (error: any) => resolve({ style: name, loaded: false, status: 'Loaded'});
            document.getElementsByTagName('head')[0].appendChild(style);
        });
    }

}
