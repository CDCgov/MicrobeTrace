import { Observable, Subject } from 'rxjs';




export class InlineWorker {

    private readonly worker: Worker;
    private onMessage = new Subject<MessageEvent>();
    private onError = new Subject<ErrorEvent>();
    


    constructor(func) {
        
        const WORKER_ENABLED = !!(Worker);

        if (WORKER_ENABLED) {
            let urls = ["https://raw.githubusercontent.com/CDCgov/patristic/master/dist/patristic.js",
            "https://raw.githubusercontent.com/CDCgov/tn93.js/master/dist/tn93.js",
            "https://raw.githubusercontent.com/CDCgov/bioseq-js/master/dist/bioseq.js"];
            let functionBody = "";
            for (let i=0; i<urls.length; i++){
                let request = new XMLHttpRequest();
                request.open("GET", urls[i], false);
                request.send(null);
                let returnValue = request.responseText;
                if (i === 0){
                    let start = returnValue.indexOf("const version = \"0.6.0\";");
                    let finish = returnValue.indexOf("exports.Branch = Branch;");
                    functionBody += returnValue.substring(start, finish);

                }
                else if (i === 1){
                    let start = returnValue.indexOf("\n");
                    let finish = returnValue.indexOf("if(typeof exports !== 'undefined'){");
                    functionBody += returnValue.substring(start + 1, finish);
                }
                else if (i === 2){
                    let start = returnValue.indexOf("var bioseq");
                    let finish = returnValue.indexOf("return bioseq");
                    functionBody += returnValue.substring(start, finish);
                }
                else {
                    functionBody += returnValue;
                }
                
                // functionBody += returnValue;
                functionBody += "\n";
            }

            functionBody += func.toString().replace(/^[^{]*{\s*/, '').replace(/\s*}[^}]*$/, '');

            this.worker = new Worker(URL.createObjectURL(
                new Blob([functionBody], { type: 'text/javascript' })
            ));

            this.worker.onmessage = (data) => {
                this.onMessage.next(data);
            };

            this.worker.onerror = (data) => {
                this.onError.next(data);
            };

        } else {
            throw new Error('WebWorker is not enabled');
        }
    }

    postMessage(data) {       
        this.worker.postMessage(data);
    }

    onmessage(): Observable<MessageEvent> {
        
        return this.onMessage.asObservable();
    }

    onerror(): Observable<ErrorEvent> {
        
        return this.onError.asObservable();
    }

    terminate() {
       
        if (this.worker) {
            this.worker.terminate();
        }
    }

}