import { Injectable } from '@angular/core';
import { HttpParams, HttpHeaders } from '@angular/common/http';

@Injectable()
export class UtilsService {
    constructor() { }

    /**
	 * Build url parameters key and value pairs from array or object
	 * @param obj
	 */
    urlParam(obj: any): string {
        return Object.keys(obj)
            .map(k => k + '=' + encodeURIComponent(obj[k]))
            .join('&');
    }

    /**
	 * Simple object check.
	 * @param item
	 * @returns {boolean}
	 */
    isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    }

    /**
	 * Deep merge two objects.
	 * @param target
	 * @param ...sources
	 * @see https://stackoverflow.com/a/34749873/1316921
	 */
    mergeDeep(target, ...sources) {
        if (!sources.length) {
            return target;
        }
        const source = sources.shift();

        if (this.isObject(target) && this.isObject(source)) {
            for (const key in source) {
                if (this.isObject(source[key])) {
                    if (!target[key]) {
                        Object.assign(target, { [key]: {} });
                    }
                    this.mergeDeep(target[key], source[key]);
                } else {
                    Object.assign(target, { [key]: source[key] });
                }
            }
        }

        return this.mergeDeep(target, ...sources);
    }

    getPath(obj, val, path?) {
        path = path || '';
        let fullpath = '';
        for (const b in obj) {
            if (obj[b] === val) {
                return path + '/' + b;
            } else if (typeof obj[b] === 'object') {
                fullpath =
                    this.getPath(obj[b], val, path + '/' + b) || fullpath;
            }
        }
        return fullpath;
    }

    getFindHTTPParams(queryParams): HttpParams {
        const params = new HttpParams()
            .set('lastNamefilter', queryParams.filter)
            .set('sortOrder', queryParams.sortOrder)
            .set('sortField', queryParams.sortField)
            .set('pageNumber', queryParams.pageNumber.toString())
            .set('pageSize', queryParams.pageSize.toString());

        return params;
    }

    getHTTPHeader() {
        return {
            headers: new HttpHeaders({ 'Content-Type': 'application/json' })
        };
    }
}


export function isInteger(value: any): value is number {
    return typeof value === 'number' && isFinite(value) && Math.floor(value) === value;
}


export function isString(value: any): value is string {
    return typeof value === 'string';
}
