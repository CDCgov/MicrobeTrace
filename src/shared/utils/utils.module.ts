import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
//import { ButtonBusyDirective } from './button-busy.directive';
// import { FriendProfilePictureComponent } from './friend-profile-picture.component';
import { LocalStorageService } from './local-storage.service';
import { LocalizePipe } from '@shared/common/pipes/localize.pipe';
import { EventEmitterService } from './event-emitter.service';

@NgModule({
    imports: [
        CommonModule
    ],
    providers: [
        EventEmitterService,
        LocalStorageService,
    ],
    declarations: [

        // FriendProfilePictureComponent,

        //ValidationMessagesComponent,
        LocalizePipe
    ],
    exports: [
        // EqualValidator,
        // FriendProfilePictureComponent,

        //ValidationMessagesComponent,
        LocalizePipe
    ]
})
export class UtilsModule { }
