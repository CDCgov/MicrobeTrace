import { Injectable } from '@angular/core';
import * as localForage from 'localforage';
import { StashObjects } from './helperClasses/interfaces';

const QUERY_PARAM = 'localSession';
const STORAGE_PREFIX = 'session-';
const KEY_PATTERN = /^[0-9a-f]{32}$/;

interface StoredLocalSession {
    version: 1;
    name: string;
    savedAt: number;
    payload: string;
}

@Injectable({ providedIn: 'root' })
export class LocalSessionLinkService {
    private readonly storage = localForage.createInstance({
        name: 'MicrobeTrace',
        storeName: 'local_session_links',
        driver: localForage.INDEXEDDB,
    });

    getKeyFromUrl(): string | null {
        return new URL(window.location.href).searchParams.get(QUERY_PARAM);
    }

    async save(name: string, session: StashObjects): Promise<string> {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        const key = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
        const record: StoredLocalSession = {
            version: 1,
            name,
            savedAt: Date.now(),
            payload: JSON.stringify(session),
        };

        await this.storage.setItem(STORAGE_PREFIX + key, record);

        const url = new URL(window.location.pathname, window.location.origin);
        url.searchParams.set(QUERY_PARAM, key);
        return url.toString();
    }

    async load(key: string): Promise<StashObjects | null> {
        if (!KEY_PATTERN.test(key)) {
            return null;
        }

        const record = await this.storage.getItem<StoredLocalSession>(STORAGE_PREFIX + key);
        if (!record) {
            return null;
        }

        if (record.version !== 1 || typeof record.payload !== 'string') {
            throw new Error('The saved local session is invalid.');
        }

        const stash = JSON.parse(record.payload) as StashObjects;
        if (!stash?.session?.data || !Array.isArray(stash.session.data.nodes)
            || !Array.isArray(stash.session.data.links) || !stash.session.style?.widgets) {
            throw new Error('The saved local session is invalid.');
        }

        return stash;
    }
}
