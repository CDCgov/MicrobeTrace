import { Injectable } from '@angular/core';
import * as localForage from 'localforage';

@Injectable()
export class LocalStorageService {

    getItem(key: string, callback: any): void {
        if (!localForage) {
            return;
        }

        localForage.getItem(key, callback);
    }


    setItem(key: string, value: string | null | undefined): void {
        if (!localForage) {
            return;
        }

        if (value === null) {
            value = undefined;
        }

        localForage.setItem(key, value);
    }

    getItemAsync<T>(key: string): Promise<T | null> {
        if (!localForage) {
            return Promise.resolve(null);
        }

        return localForage.getItem<T>(key);
    }

    setItemAsync<T>(key: string, value: T): Promise<T> {
        if (!localForage) {
            return Promise.resolve(value);
        }

        return localForage.setItem<T>(key, value);
    }

    removeItem(key: string, value: ((err: any) => void) | null | undefined): void {
        if (!localForage) {
            return;
        }

        if (value === null) {
            value = undefined;
        }

        localForage.removeItem(key, value);
    }

    removeItemAsync(key: string): Promise<void> {
        if (!localForage) {
            return Promise.resolve();
        }

        return localForage.removeItem(key);
    }

    keys() {

        if (!localForage) {
            return;
        }

        return localForage.keys();
    }

}
