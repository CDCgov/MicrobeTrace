export class DialogSettings {
    public isVisible: boolean = false;

    public top: number = 200;
    public left: number = 450;

    // Link Color
    public linkTop: number = 200;
    public linkLeft: string = "bottom-left";

    // Map settings
    public mapRight: string = "bottom-right";

    // Node Color
    public nodeTop: number = 400;
    public nodeLeft: string = "left";

    // Node Shape
    public shapeTop: number = 700;
    public shapeRight: string = "bottom-right";

    // Polygon Color
    public polygonRight: string = "right";

    public polygonTop: number = 200;
    public polygonLeft: number = 950;

    private dialogControlId: string;

    private stateBeforeExport?: {
        isVisible: boolean,
        top?: number,
        left?: number
    };

    constructor(
        dialogControlId: string,
        isVisible: boolean
    ) {
        this.dialogControlId = dialogControlId;
        this.isVisible = isVisible;
    }

    private getDialogControl(): Element {
        return document.querySelector(this.dialogControlId);
    }

    private getDomRect(): DOMRect | ClientRect {
        const dialogControl = this.getDialogControl();

        return dialogControl.children[0].getBoundingClientRect();
    }

    public onShow() {
        this.isVisible = true;
    }

    public onHide() {
        this.isVisible = false;
    }

    setStateBeforeExport() {
        this.stateBeforeExport = {
            isVisible: this.isVisible,
            top: undefined,
            left: undefined
        }

        if (this.isVisible) {
            // sometimes getDomRect throws an error, need to revisit when we decide to revisit saving the locations of tables on show/hide
            try {
                const domRect = this.getDomRect();

                this.stateBeforeExport.top = domRect.top;
                this.stateBeforeExport.left = domRect.left;
            } catch {
                this.stateBeforeExport.top = 100;
                this.stateBeforeExport.left = 100;  
            }
        }

        this.isVisible = false;
    }

    restoreStateAfterExport() {
        if (!this.stateBeforeExport) {
            return;
        }

        this.isVisible = this.stateBeforeExport.isVisible;
        this.top = this.stateBeforeExport.top;
        this.left = this.stateBeforeExport.left;
    }

    setPosition(top: number, left: number) {
        this.top = top;
        this.left = left;
        this.stateBeforeExport = undefined;
    }


    setVisibility(isVisible: boolean) {
        if(isVisible && this.top === 0 && this.left === 0){
            this.top = window.innerHeight / 2 - 300;
            this.left = window.innerWidth / 2;
        }
        else if(isVisible && this.stateBeforeExport){
            this.restoreStateAfterExport();
        }
        else if(!isVisible){
            this.setStateBeforeExport();
        }

        this.isVisible = isVisible;
        
        // this section causes the network settings dialog box (at least on 2D network) to minimize so that only top headings to be displayed. Removed (12/5/23) because it causes unwanted behavior
        /*
        if(isVisible){
            const dialog = document.querySelector('#network-settings-pane');
            const tabset = dialog.querySelector('.tab-container');
    
            if(tabset){
                const tabs: Array<Element> = Array.from(tabset.querySelectorAll('.m-tabs__item'));
                
                for(let tab of tabs){
                    tab.classList.remove('active');
                }
                
            }
        }
        */
    }
}
