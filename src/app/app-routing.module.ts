import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MicrobeTraceNextHomeComponent } from './microbe-trace-next-plugin.component';

const routes: Routes = [
  { path: '', component: MicrobeTraceNextHomeComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
