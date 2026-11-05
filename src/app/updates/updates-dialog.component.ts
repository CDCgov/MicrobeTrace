import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { RELEASE_NOTES, ReleaseNotesItem, ReleaseNotesLinkedItem } from './release-notes';

@Component({
    selector: 'app-updates-dialog',
    templateUrl: './updates-dialog.component.html',
    styleUrls: ['./updates-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class UpdatesDialogComponent {
    @Input() visible = false;
    @Output() visibleChange = new EventEmitter<boolean>();
    @Output() viewed = new EventEmitter<string>();

    readonly releases = RELEASE_NOTES;
    expandedVersions: string[] = [RELEASE_NOTES[0].version];

    isLinkedItem(item: ReleaseNotesItem): item is ReleaseNotesLinkedItem {
        return typeof item !== 'string';
    }

    setVisible(visible: boolean): void {
        this.visible = visible;
        this.visibleChange.emit(visible);
    }

    onShow(): void {
        this.expandedVersions = [this.releases[0].version];
        this.viewed.emit(this.releases[0].version);
    }
}
