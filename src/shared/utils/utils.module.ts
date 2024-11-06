import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
//import { ButtonBusyDirective } from './button-busy.directive';
// import { FriendProfilePictureComponent } from './friend-profile-picture.component';
import { LocalStorageService } from './local-storage.service';
import { NullDefaultValueDirective } from './null-value.directive';
import { StyleLoaderService } from './style-loader.service';
import { LocalizePipe } from '@shared/common/pipes/localize.pipe';
import { PermissionPipe } from '@shared/common/pipes/permission.pipe';
import { FeatureCheckerPipe } from '@shared/common/pipes/feature-checker.pipe';
import { EventEmitterService } from './event-emitter.service';

@NgModule({
    imports: [
        CommonModule
    ],
    providers: [
        EventEmitterService,
        LocalStorageService,
        StyleLoaderService,
    ],
    declarations: [

        // FriendProfilePictureComponent,

        //ValidationMessagesComponent,
        NullDefaultValueDirective,
        LocalizePipe,
        PermissionPipe,
        FeatureCheckerPipe
    ],
    exports: [
        // EqualValidator,
        // FriendProfilePictureComponent,

        //ValidationMessagesComponent,
        NullDefaultValueDirective,
        LocalizePipe,
        PermissionPipe,
        FeatureCheckerPipe
    ]
})
export class UtilsModule { }
