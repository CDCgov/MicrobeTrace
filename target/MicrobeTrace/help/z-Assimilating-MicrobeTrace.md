**Please note that this page is for developers and system administrators, and likely does not contain any information relevant to users of MicrobeTrace.**

MicrobeTrace can be assimilated into your network analysis or Bioinformatics pipeline!

![](https://upload.wikimedia.org/wikipedia/en/a/a1/Picard_as_Locutus.jpg)

Because MicrobeTrace is solely a frontend platform, it can be integrated into more or less *any* server architecture with a relatively small investment in integration development. Here's a head start:

## Setting up

To set up a local deployment of MicrobeTrace, all you should need is Node.js.
 
In a console, cd to the directory where you want to keep it, clone the repo from github (or download and unzip it if you don't use git). Then cd into the MicrobeTrace directory and run `npm install`. That will download all of MicrobeTrace's dependencies. If the directory you've put it in is already being served, you can launch MicrobeTrace in your browser. If not, you can run `npm start`, which will launch a simple static file server on port 5000, and you can see MicrobeTrace by going to http://localhost:5000/ in your browser.

(This process is described in more detail in both the [Development](https://github.com/CDCgov/MicrobeTrace/wiki/z-Development) and [Deployment](https://github.com/CDCgov/MicrobeTrace/wiki/z-Deployment) pages of this wiki.)

## The Easy Way

The way to get your data into MicrobeTrace and then MicrobeTrace out of your server is to hack a copy of MicrobeTrace's [`index.html`](https://github.com/CDCgov/MicrobeTrace/blob/master/index.html). Duplicate that to the index-dot-whatever's appropriate for your stack (index.php, index.jsp, index.asp, whatever). That's the easy part. The hard part is that the server will need to emit four discrete pieces of information: the nodes, the links, the list of attributes each node has, and the list of attributes each link has. Moreover, it has to do it very specifically at the point in index.html where MicrobeTrace calls `app.launchView('files')` (presently [around line 1050](https://github.com/CDCgov/MicrobeTrace/blob/master/index.html#L1053), but this will probably have changed by the time you're reading this).

`app.launchView` takes, as a second argument, a callback function. That callback is the place where we need to inject the data from your server into MicrobeTrace. In the end it should look something like this:

```javascript
app.launchView('files', function(){
  var foreignData = { 
    nodes: [ /*...Server Code to serialize nodes...*/ ],
    links: [ /*...Server Code to serialize links...*/ ],
    nodeFields: [ /*...Server Code to list node attributes as strings...*/ ],
    linkFields: [ /*...Server Code to list link attributes as strings...*/ ]
  };
  foreignData.nodes.forEach(app.addNode);
  foreignData.links.forEach(app.addLink);
  session.data.nodeFields = [...new Set([...session.data.nodeFields, ...foreignData.nodeFields])];
  session.data.linkFields = [...new Set([...session.data.linkFields, ...foreignData.linkFields])];
  app.finishUp();
});
```

The last five lines of javascript just get the data into the correct parts of the MicrobeTrace session object, and then tell MicrobeTrace to load the network visualization. Boom, done!

## The Hard Way

Alternately, if you'd like to exert a bit more control over the app, you could attempt to emit the entire session variable. I would advise against this (at least in the beginning) as it's much more complex and will all but certainly require some additional computation in order to work well.

The global session object is created by `app.sessionSkeleton()`, and structured like this:

`session.data` - all the data, as Javascript objects. See `app.dataSkeleton()` for its structure at creation.

`session.data.nodeFields` - an array of strings indicating the attributes we expect each node to have. Note that MicrobeTrace will attempt to populate missing attributes, so you don't need to enforce rules that all nodes actually have each of these attributes.

`session.data.nodes` - an array of distinct nodes (i.e. with a unique "id") as a Javascript object

`session.data.linkFields` - an array of strings indicating the attributes we expect each link to have. Similar to `session.data.nodeFields` (see above).

`session.data.links` - an array of distinct, non-directed links.

`session.data.distance_matrix` - an object containing attributes of distance metrics (e.g. 'tn93', 'snps') pointing to arrays of arrays storing the pairwise distances. It also contains a 'labels' attribute, which points to an array of node IDs, indicating the order of cells in the distance matrices. If there's a single reason we shouldn't use the session-creation approach, this is it. Computing the distance matrices is complex and they must be in a rigid and highly specific structure.

`session.layout` - a cached object indicating the characteristics of the layout (which views are open and how they're arranged). Just set this to `{content: [{type: '2d_network'}],type: 'stack'}` to start.

`session.files` - an array of plain javascript object describing the files used to create this session. For GHOST, this should be an empty array (`[]`).

`session.meta` - an object with some metadata about loadtimes, useful for performance tuning. Set this to `{loadTime: 0, startTime: 0}`

`session.network` - an object containing information about the state of the network visualization. set to `{allPinned: false,nodes: []}`

`session.state` - an object containing data about what elements should be visible throughout the visualization. Set this to: `{metrics: ['distance'],timeStart: 0,timeEnd: Date.now()}`

`session.style` - all of the required styling information. This changes pretty often, so I'd suggest just calling `app.sessionSkeleton().style` and then modifying its output with whatever customizations you desire.

Once you've completed this session object, you should load it at the same time specified above: once MicrobeTrace has completed running `app.launchView('files')`. Here's what is should look like:

```javascript
app.launchView('files', function(){
  var foreignSession = {
    /*...Server Code to serialize the Session as valid javascript...*/
  };
  app.applySession(foreignSession);
});
```

As you can see, there's less cleanup, since we can hook into the same system that MicrobeTrace uses to load save files and stashed sessions.

## Good Luck!

That's about the extent of the guidance I can provide without knowing more about you server stack. So, Good luck!