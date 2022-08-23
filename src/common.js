(function (self) {
  'use strict';

  let MT = {};

  let sessionApplied = false;


  MT.dataSkeleton = () => ({
    nodes: [],
    links: [],
    clusters: [],
    nodeFields: [
      "index",
      "_id",
      "selected",
      "cluster",
      "visible",
      "degree",
      "origin"
    ],
    nodeExclusions: [],
    linkFields: [
      "index",
      "source",
      "target",
      "distance",
      "visible",
      "cluster",
      "origin",
      "nn",
      "directed"
    ],
    clusterFields: [
      "id",
      "nodes",
      "links",
      "sum_distances",
      "links_per_node",
      "mean_genetic_distance",
      "visible"
    ],
    reference:
      "CCTCAGGTCACTCTTTGGCAACGACCCCTCGTCACAATAAAGATAGGGGGGCAACTAAAGGAAGCTCTATTAGATACAGGAGCAGATGATACAGTATTAGAAGAAATGAGTTTGCCAGGAAGATGGAAACCAAAAATGATAGGGGGAATTGGAGGTTTTATCAAAGTAAGACAGTATGATCAGATACTCATAGAAATCTGTGGACATAAAGCTATAGGTACAGTATTAGTAGGACCTACACCTGTCAACATAATTGGAAGAAATCTGTTGACTCAGATTGGTTGCACTTTAAATTTTCCCATTAGCCCTATTGAGACTGTACCAGTAAAATTAAAGCCAGGAATGGATGGCCCAAAAGTTAAACAATGGCCATTGACAGAAGAAAAAATAAAAGCATTAGTAGAAATTTGTACAGAGATGGAAAAGGAAGGGAAAATTTCAAAAATTGGGCCTGAAAATCCATACAATACTCCAGTATTTGCCATAAAGAAAAAAGACAGTACTAAATGGAGAAAATTAGTAGATTTCAGAGAACTTAATAAGAGAACTCAAGACTTCTGGGAAGTTCAATTAGGAATACCACATCCCGCAGGGTTAAAAAAGAAAAAATCAGTAACAGTACTGGATGTGGGTGATGCATATTTTTCAGTTCCCTTAGATGAAGACTTCAGGAAGTATACTGCATTTACCATACCTAGTATAAACAATGAGACACCAGGGATTAGATATCAGTACAATGTGCTTCCACAGGGATGGAAAGGATCACCAGCAATATTCCAAAGTAGCATGACAAAAATCTTAGAGCCTTTTAGAAAACAAAATCCAGACATAGTTATCTATCAATACATGGATGATTTGTATGTAGGATCTGACTTAGAAATAGGGCAGCATAGAACAAAAATAGAGGAGCTGAGACAACATCTGTTGAGGTGGGGACTTACCACACCAGACAAAAAACATCAGAAAGAACCTCCATTCCTTTGGATGGGTTATGAACTCCATCCTGATAAATGGACAGTACAGCCTATAGTGCTGCCAGAAAAAGACAGCTGGACTGTCAATGACATACAGAAGTTAGTGGGGAAATTGAATTGGGCAAGTCAGATTTACCCAGGGATTAAAGTAAGGCAATTATGTAAACTCCTTAGAGGAACCAAAGCACTAACAGAAGTAATACCACTAACAGAAGAAGCAGAGCTAGAACTGGCAGAAAACAGAGAGATTCTAAAAGAACCAGTACATGGAGTGTATTATGACCCATCAAAAGACTTAATAGCAGAAATACAGAAGCAGGGGCAAGGCCAATGGACATATCAAATTTATCAAGAGCCATTTAAAAATCTGAAAACAGGAAAATATGCAAGAATGAGGGGTGCCCACACTAATGATGTAAAACAATTAACAGAGGCAGTGCAAAAAATAACCACAGAAAGCATAGTAATATGGGGAAAGACTCCTAAATTTAAACTGCCCATACAAAAGGAAACATGGGAAACATGGTGGACAGAGTATTGGCAAGCCACCTGGATTCCTGAGTGGGAGTTTGTTAATACCCCTCCCTTAGTGAAATTATGGTACCAGTTAGAGAAAGAACCCATAGTAGGAGCAGAAACCTTC"
  });

  MT.defaultWidgets = {
    "3DNet-link-tooltip-variable": "None",
    "3DNet-link-transparency": 0,
    "3DNet-link-width": 1.6,
    "3DNet-node-tooltip-variable": "_id",
    "3DNet-node-radius": 4,
    "3DNet-node-radius-variable": "None",
    "align-sw": false,
    "align-none": true,
    "ambiguity-resolution-strategy": "AVERAGE",
    "ambiguity-threshold": 0.015,
    "background-color": "#ffffff",
    "background-color-contrast": "#000000",
    "bubble-x": "None",
    "bubble-y": "None",
    "bubble-charge": 1.5,
    "bubble-size": 5,
    "choropleth-aggregate-as": "states",
    "choropleth-aggregate-on": "None",
    "choropleth-basemap-show": false,
    "choropleth-color-high": "#800026",
    "choropleth-color-low": "#ffffcc",
    "choropleth-color-medium": "#fd8d3c",
    "choropleth-satellite-show": false,
    "choropleth-transparency": 0.3,
    "cluster-minimum-size": 1,
    "default-view": "2d_network",
    "filtering-epsilon": -8,
    "flow-showNodes": "selected",
    "globe-countries-show": false,
    "globe-field-lat": "None",
    "globe-field-lon": "None",
    "globe-field-tract": "None",
    "globe-field-zipcode": "None",
    "globe-field-county": "None",
    "globe-field-state": "None",
    "globe-field-country": "None",
    "globe-link-show": true,
    "globe-link-transparency": 0,
    "globe-node-jitter": -2,
    "globe-node-show": true,
    "globe-node-transparency": 0,
    "globe-stars-show": true,
    "heatmap-invertX": false,
    "heatmap-invertY": false,
    "heatmap-color-high": "#a50026",
    "heatmap-color-medium": "#ffffbf",
    "heatmap-color-low": "#313695",
    "heatmap-axislabels-show": false,
    "histogram-axis-x": true,
    "histogram-scale-log": false,
    "histogram-variable": "links-distance",
    "infer-directionality-false": true,
    "link-color": "#a6cee3",
    "link-color-table-name-sort": "DESC",
    "link-color-table-counts-sort": "DESC",
    "link-color-table-counts": true,
    "link-color-table-frequencies": false,
    "link-color-variable": "None",
    "link-decimal-variable": 2,
    "link-directed": false,
    "link-label-variable": "None",
    "link-length": 0.125,
    "link-opacity": 0,
    "link-show-nn": false,
    "link-sort-variable": "distance",
    "link-threshold": 0.015,
    "link-tooltip-variable": "None",
    "link-width": 3,
    "link-width-variable": "None",
    "link-width-max": 27,
    "link-width-min": 3,
    "map-basemap-show": false,
    "map-collapsing-on": true,
    "map-counties-show": false,
    "map-countries-show": true,
    "map-field-lat": "None",
    "map-field-lon": "None",
    "map-field-tract": "None",
    "map-field-zipcode": "None",
    "map-field-county": "None",
    "map-field-state": "None",
    "map-field-country": "None",
    "map-link-show": true,
    "map-link-tooltip-variable": "None",
    "map-link-transparency": 0,
    "map-node-jitter": -2,
    "map-node-show": true,
    "map-node-tooltip-variable": "_id",
    "map-node-transparency": 0,
    "map-satellite-show": false,
    "map-states-show": true,
    "network-friction": 0.4,
    "network-gravity": 0.05,
    "network-link-strength": 0.125,
    "node-border-width": 2,
    "node-charge": 200,
    "node-color": "#1f77b4",
    "node-color-border": "#000000",
    "node-color-table-name-sort": "DESC",
    "node-color-table-counts-sort": "DESC",
    "node-color-table-counts": true,
    "node-color-table-frequencies": false,
    "node-color-variable": "None",
    "node-highlight": false,
    "node-label-size": 16,
    "node-label-variable": "None",
    "node-radius": 250,
    "node-radius-variable": "None",
    "node-radius-min": 250,
    "node-radius-max": 4500,
    "node-symbol": "symbolCircle",
    "node-symbol-table-counts": true,
    "node-symbol-table-frequencies": false,
    "node-symbol-variable": "None",
    "node-timeline-variable": "None",
    "node-tooltip-variable": "_id",
    "physics-tree-branch-type": "Straight",
    "physics-tree-branch-length": 50,
    "physics-tree-charge": 30,
    "physics-tree-friction": 0.05,
    "physics-tree-gravity": 0.05,
    "physics-tree-lateral-strength": 0.025,
    "physics-tree-layout": "Horizontal",
    "physics-tree-node-label-variable": "None",
    "physics-tree-tooltip": "id",
    "physics-tree-type": "tree",
    "polygon-color": "#bbccee",
    "polygon-color-table-name-sort": "DESC",
    "polygon-color-table-counts-sort": "DESC",
    "polygon-color-table-counts": true,
    "polygon-color-table-frequencies": false,
    "polygons-color-show": false,
    "polygons-foci": "cluster",
    "polygons-gather-force": 0,
    "polygons-label-show": false,
    "polygons-label-size": 16,
    "polygons-show": false,
    "reference-source-file": true,
    "reference-source-first": false,
    "reference-source-consensus": false,
    "scatterplot-xVar": "index",
    "scatterplot-yVar": "distance",
    "scatterplot-logScale": false,
    "scatterplot-showNodes": false,
    "search-field": "_id",
    //#298
    "search-case-sensitive": false,
    "search-whole-word": false,
    "selected-color": "#ff8300",
    "selected-color-contrast": "#000000",
    "timeline-date-field": "None",
    "timeline-noncumulative": true,
    "tree-animation-on": true,
    "tree-branch-distances-hide": true,
    "tree-branch-distance-size": 12,
    "tree-branch-nodes-show": false,
    "tree-horizontal-stretch": 1,
    "tree-layout-vertical": false,
    "tree-layout-horizontal": true,
    "tree-layout-circular": false,
    "tree-labels-align": false,
    "tree-labels-show": false,
    "tree-leaf-label-show": false,
    "tree-leaf-label-size": 12,
    "tree-leaf-node-radius-variable": "None",
    "tree-leaf-node-show": true,
    "tree-leaf-node-size": 9,
    "tree-mode-square": true,
    "tree-mode-smooth": false,
    "tree-mode-straight": false,
    "tree-round-true": false,
    "tree-ruler-show": true,
    "tree-tooltip-show": true,
    "tree-type": "weighted",
    "tree-vertical-stretch": 1,
    "triangulate-false": true
  };

  MT.sessionSkeleton = () => ({
    data: MT.dataSkeleton(),
    files: [],
    layout: {
      content: [
        {
          type: "files"
        }
      ],
      type: "stack"
    },
    messages: [],
    meta: {
      loadTime: 0,
      readyTime: Date.now(),
      startTime: 0,
      anySequences: false
    },
    network: {
      allPinned: false,
      timelinePinned: false,
      nodes: [],
      timelineNodes: []
    },
    state: {
      timeStart: 0,
      timeEnd: Date.now(),
      timeTarget: null
    },
    style: {
      linkAlphas: [1],
      linkColors: d3.schemePaired,
      linkValueNames: {},
      nodeAlphas: [1],
      nodeColors: [d3.schemeCategory10[0]].concat(d3.schemeCategory10.slice(2)),
      nodeColorsTable: {},
      nodeColorsTableHistory: {
        "null": "#EAE553"
      },
      nodeColorsTableKeys: {},
      linkColorsTable: {},
      linkColorsTableKeys: {},
      nodeSymbols: [
        "symbolCircle",
        "symbolCross",
        "symbolDiamond",
        "symbolSquare",
        "symbolStar",
        "symbolTriangle",
        "symbolWye",
        "symbolTriangleDown",
        "symbolTriangleLeft",
        "symbolTriangleRight",
        "symbolDiamondAlt",
        "symbolDiamondSquare",
        "symbolPentagon",
        "symbolHexagon",
        "symbolHexagonAlt",
        "symbolOctagon",
        "symbolOctagonAlt",
        "symbolX"
      ],
      nodeSymbolsTable: {},
      nodeSymbolsTableKeys: {},
      nodeValueNames: {},
      polygonAlphas: [0.5],
      polygonColors: ['#bbccee', '#cceeff', '#ccddaa', '#eeeebb', '#ffcccc', '#dddddd'],
      polygonValueNames: {},
      overwrite: {},
      widgets: MT.defaultWidgets
    },
    timeline: 0,
    warnings: []
  });

  MT.tempSkeleton = () => ({
    componentCache: {},
    mapData: {},
    matrix: {},
    messageTimeout: null,
    style: {
      linkAlphaMap: () => 1 - session.style.widgets["link-opacity"],
      linkColorMap: () => session.style.widgets["link-color"],
      nodeAlphaMap: () => 1,
      nodeColorMap: () => session.style.widgets["node-color"],
      nodeSymbolMap: () => session.style.widgets["node-symbol"],
      polygonAlphaMap: () => 0.5,
      polygonColorMap: () => session.style.widgets["polygon-color"]
    },
    trees: {}
  });

  MT.defaultNode = () => ({
    index: session.data.nodes.length,
    _id: "",
    selected: false,
    cluster: 1,
    visible: true,
    degree: 0,
    origin: [],
    hasDistance: false
  });

  let isNumber = a => typeof a == "number";

  let uniq = a => {
    let seen = {};
    let out = [];
    let len = a.length;
    let j = 0;
    for (let i = 0; i < len; i++) {
      let item = a[i];
      if (seen[item] !== 1) {
        seen[item] = 1;
        out[j++] = item;
      }
    }
    return out;
  };

  MT.addNode = (newNode, check) => {
    if ('id' in newNode) {
      if ('_id' in newNode) {
        //This is here because the logic won't negate for some reason. I don't get it...
      } else {
        newNode._id = newNode.id;
      }
    }

    // Ensure degree set to 0 when adding new node.
    newNode.degree = 0;

    if (isNumber(newNode._id)) newNode._id = "" + newNode._id;
    if (session.data.nodeExclusions.indexOf(newNode._id) > -1) return 0;
    if (check) {
      let nodes = session.data.nodes;
      const n = nodes.length;
      for (let i = 0; i < n; i++) {
        let node = nodes[i];
        if (node._id == newNode._id) {
          newNode.origin = uniq(newNode.origin.concat(node.origin));
          Object.assign(node, newNode);
          return 0;
        }
      }
    }
    session.data.nodes.push(Object.assign(MT.defaultNode(), newNode));
    return 1;
  };

  MT.addLink = newLink => {
    if (!temp.matrix[newLink.source]) {
      temp.matrix[newLink.source] = {};
    }
    if (!temp.matrix[newLink.target]) {
      temp.matrix[newLink.target] = {};
    }
    if (newLink.source == newLink.target) {
      return 0;
    }

    let linkIsNew = 1;
    let sdlinks = session.data.links;

    if (temp.matrix[newLink.source][newLink.target]) {
      let oldLink = temp.matrix[newLink.source][newLink.target];
      let origin = uniq(newLink.origin.concat(oldLink.origin));

      // Ensure new link keeps distance if already defined previously
      if (oldLink.hasDistance) {
        newLink.hasDistance = true;
        newLink['distance'] = oldLink['distance'];
        newLink.distanceOrigin = oldLink.distanceOrigin;
      }

      Object.assign(oldLink, newLink, { origin: origin });
      linkIsNew = 0;
    } else if (temp.matrix[newLink.target][newLink.source]) {
      console.warn("This scope should be unreachable. If you're using this code, something's wrong.");
      let oldLink = temp.matrix[newLink.target][newLink.source];
      let origin = uniq(newLink.origin.concat(oldLink.origin));
      Object.assign(oldLink, newLink, { origin: origin });
      linkIsNew = 0;
    } else {
      newLink = Object.assign({
        index: sdlinks.length,
        source: "",
        target: "",
        visible: false,
        cluster: 1,
        origin: [],
        hasDistance: false
      }, newLink);
      if ((newLink.source == 'MZ797735' || newLink.target == 'MZ797735') && (newLink.source == 'MZ797519' || newLink.target == 'MZ797519')) {
        console.log('------ newLink2: ', newLink)
      }
      temp.matrix[newLink.source][newLink.target] = newLink;
      temp.matrix[newLink.target][newLink.source] = newLink;
      sdlinks.push(newLink);
      linkIsNew = 1;
    }

    if (newLink.source == 'MZ797735' || newLink.target == 'MZ797735') {
      // console.log('Links are 2: ', sdlinks);
    }

    return linkIsNew;
  };

  MT.processSVG = svg => {
    let nodes = [];
    const $xml = $(svg);
    if ($xml.find("#edges").length) {
      $xml.find("#nodes circle").each((i, node) => {

        const $node = $(node);
        const gephid = $node.attr("class")

        const encodedGephid = (gephid).replace(/[\u00A0-\u9999<>\&]/g, function (i) {
          return '&#' + i.charCodeAt(0) + ';';
        });
        const encodedFill = ($node.attr("fill")).replace(/[\u00A0-\u9999<>\&]/g, function (i) {
          return '&#' + i.charCodeAt(0) + ';';
        });

        nodes.push(gephid);
        MT.addNode(
          {
            id: encodedGephid + "",
            color: encodedFill,
            size: parseFloat($node.attr("r")),
            origin: ["Scraped Gephi SVG"]
          },
          false
        );
      });

      session.data.nodeFields.push("color");
      session.data.nodeFields.push("size");
      $xml.find("#edges path").each((i, link) => {
        const $link = $(link);
        const coords = $link.attr("class").split(" ");
        let base = {
          source: coords[0] + "",
          target: coords[1] + "",
          color: $link.attr("stroke"),
          origin: ["Scraped MicrobeTrace SVG"]
        };
        base[session.style.widgets['default-distance-metric']] = 0;
        MT.addLink(base, true);
      });
      session.data.linkFields.push("color");
    } else {
      $xml.find(".nodes g").each((i, node) => {
        nodes.push(
          $(node)
            .attr("transform")
            .slice(10, -1)
            .split(",")
            .map(parseFloat)
        );
        MT.addNode(
          {
            id: i + "",
            origin: ["Scraped SVG"]
          },
          false
        );
      });
      $xml.find("line").each((i, link) => {
        let $l = $(link);
        const source = nodes.findIndex(d => {
          return (
            Math.abs(d[0] - parseFloat($l.attr("x1"))) < 0.0001 &&
            Math.abs(d[1] - parseFloat($l.attr("y1"))) < 0.0001
          );
        });
        const target = nodes.findIndex(d => {
          return (
            Math.abs(d[0] - parseFloat($l.attr("x2"))) < 0.0001 &&
            Math.abs(d[1] - parseFloat($l.attr("y2"))) < 0.0001
          );
        });
        if (source < 0 || target < 0) return;
        let base = {
          source: source + "",
          target: target + "",
          origin: ["Scraped SVG"]
        };
        base[session.style.widgets['default-distance-metric']] = 0;
        MT.addLink(base, true);
      });
    }
    MT.runHamsters();
  };

  MT.processJSON = (json, extension) => {
    let data;
    try {
      data = JSON.parse(json);
    } catch (error) {
      alertify.error(
        "File Not Recognized! Are you certain this is a MicrobeTrace Session or HIV-TRACE Output File?"
      );
      console.error(error);
      return;
    }
    if (extension == "microbetrace") {
      MT.applySession(data);
    } else {
      if (data.version) {
        MT.applyGHOST(data);
      } else {
        MT.applyHIVTrace(data);
      }
    }
  };

  MT.applySession = oldSession => {
    //If anything here seems eccentric, assume it's to maintain compatibility with
    //session files from older versions of MicrobeTrace.

    $window.trigger("stop-force-simulation"); // stop previous network ticks so previous polygon won't show up

    // when using recall function several times, window remembers every registered event function of each recall which all registered functions will be fired when triggered
    // since an event is registered in both 2d_network.html and index.js, add namespace to events in 2d_network so they can be removed without affecting events in index
    $window.off('.2d');

    MT.reset();
    $("#launch").prop("disabled", true);
    session.files = oldSession.files;
    session.state = oldSession.state;
    session.style = Object.assign({},
      session.style,
      oldSession.style
    );
    session.layout = oldSession.layout;

    layout.root.removeChild(layout.root.contentItems[0]);

    session.meta.startTime = Date.now();
    const nodes = oldSession.data.nodes,
      links = oldSession.data.links,
      n = nodes.length,
      m = links.length;
    for (let i = 0; i < n; i++) MT.addNode(nodes[i]);
    for (let j = 0; j < m; j++) {
      // Add distance property for files saved prior to distance visibility fix
      if ((links[j].origin).includes('Genetic Distance')) {
        links[j].hasDistance = true;
        links[j].distanceOrigin = 'Genetic Distance';
      } else if (links[j].distance && links[j].distance > 0) {
        links[j].hasDistance = true;
      }
      MT.addLink(links[j]);
    }
    ['nodeFields', 'linkFields', 'clusterFields', 'nodeExclusions'].forEach(v => {
      if (oldSession.data[v]) session.data[v] = uniq(session.data[v].concat(oldSession.data[v]));
    });
    if (oldSession.network) session.network = oldSession.network;
    sessionApplied = true;
    MT.applyStyle(session.style);
    // if(!links[0]['distance']){  #249
    //   if(links[0]['tn93']){
    //     session.style.widgets['link-sort-variable'] = 'tn93';
    //   } else {
    //     session.style.widgets['link-sort-variable'] = 'snps';
    //   }
    // }
    MT.finishUp(true);
    $("#network-statistics-show").parent().trigger("click");
  };

  MT.applyStyle = style => {
    session.style = style;
    session.style.widgets = Object.assign({},
      MT.defaultWidgets,
      style.widgets
    );
    MT.createLinkColorMap();
    MT.createNodeColorMap();
    MT.createPolygonColorMap();
    let $id = null;
    for (let id in session.style.widgets) {
      $id = $("#" + id);
      if ($id.length > 0) {
        if (["radio", "checkbox"].includes($id[0].type)) {
          if (session.style.widgets[id]) $id.trigger("click");
        } else {
          $id.val(session.style.widgets[id]);
        }
      }
    }

    // Need session applied variable since this will break restoring full microbe trace file vs loading a style file
    if (!sessionApplied) {
      // Trigger global style updates
      $("#node-color-variable").trigger("change");
      $("#node-color-border").trigger("change");
      $("#link-color-variable").trigger("change");
      $("#selected-color").trigger("change");
      $("#background-color").trigger("change");

      // 2d Network Specific
      $('#node-radius-variable').trigger("change");
      $('#node-symbol-variable').trigger("change");
      $('#node-label-variable').trigger("change");
    } else {
      sessionApplied = false;
    }

  };

  MT.applyHIVTrace = hivtrace => {
    self.session = MT.sessionSkeleton();
    session.meta.startTime = Date.now();
    hivtrace["trace_results"]["Nodes"].forEach(node => {
      let newNode = JSON.parse(JSON.stringify(node.patient_attributes));
      newNode._id = node._id;
      newNode.origin = "HIVTRACE Import";
      MT.addNode(newNode, false);
    });
    Object.keys(
      hivtrace["trace_results"]["Nodes"][0]["patient_attributes"]
    ).forEach(key => {
      if (!session.data.nodeFields.includes(key)) {
        const encodedKey = key.replace(/[\u00A0-\u9999<>(){}\&]/g, function (i) {
          return '&#' + i.charCodeAt(0) + ';';
        });
        session.data.nodeFields.push(encodedKey);
      }
    });
    let n = hivtrace["trace_results"]["Edges"].length;
    let metric = session.style.widgets['default-distance-metric'];
    for (let i = 0; i < n; i++) {
      let link = hivtrace["trace_results"]["Edges"][i];
      let newLink = {
        source: "" + link.sequences[0],
        target: "" + link.sequences[1],
        origin: ["HIVTRACE Import"],
        visible: true
      };
      newLink[metric] = parseFloat(link.length);
      MT.addLink(newLink, false);
    }
    session.data.linkFields.push(metric);
    MT.runHamsters();
  };

  MT.applyGHOST = ghost => {
    self.session = MT.sessionSkeleton();
    session.meta.startTime = Date.now();
    ghost["samples"].forEach(node => {
      let newNode = JSON.parse(JSON.stringify(node));
      newNode.origin = ["GHOST Import"];
      newNode.genotypes = Object.keys(newNode.genotypes)[0];
      newNode.id = "" + newNode.id;
      MT.addNode(newNode, false);
    });
    ["genotypes", "group", "id", "name"].forEach(key => {
      if (!session.data.nodeFields.includes(key)) {
        session.data.nodeFields.push(key);
      }
    });
    let links = ghost["links"];
    let n = links.length;
    for (let i = 0; i < n; i++) {
      let link = links[i];
      let newLink = Object.assign({}, link, {
        source: "" + link.source,
        target: "" + link.target,
        distance: parseFloat(link.dist),
        origin: ["GHOST Import"], visible: true
      });
      MT.addLink(newLink, false);
    }
    ["density", "dist", "shared", "src_genotype", "src_haps", "tgt_genotype", "tgt_haps"].forEach(key => { if (!session.data.linkFields.includes(key)) session.data.linkFields.push(key); });
    //	MT.finishUp(); 
    MT.runHamsters();
  };

  let decoder = new TextDecoder("utf-8");
  MT.decode = x => decoder.decode(x);

  MT.parseFASTA = text => {
    return new Promise(resolve => {
      let computer = new Worker("workers/parse-fasta.js");
      computer.onmessage = response => {
        let nodes = JSON.parse(MT.decode(new Uint8Array(response.data.nodes)));
        console.log("FASTA Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
        resolve(nodes);
      };
      computer.postMessage(text);
    });
  };

  MT.parseMEGA = text => {
    return new Promise(resolve => {
      let computer = new Worker("workers/parse-mega.js");
      computer.onmessage = response => {
        let nodes = JSON.parse(MT.decode(new Uint8Array(response.data.nodes)));
        console.log("MEGA Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
        resolve(nodes);
      };
      computer.postMessage(text);
    });
  };

  MT.parseCSVMatrix = file => {
    return new Promise(resolve => {
      let check = session.files.length > 1;
      const origin = [file.name];
      let nn = 0,
        nl = 0;
      let computer = new Worker("workers/parse-csv-matrix.js");
      computer.onmessage = response => {
        const data = JSON.parse(MT.decode(new Uint8Array(response.data.data)));
        console.log("CSV Matrix Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
        const start = Date.now();
        const nodes = data.nodes;
        const tn = nodes.length;
        for (let i = 0; i < tn; i++) {
          nn += MT.addNode({
            _id: filterXSS(nodes[i]),
            origin: origin
          }, check);
        }
        const links = data.links;
        const tl = links.length;
        for (let j = 0; j < tl; j++) {
          nl += MT.addLink(Object.assign(links[j], { origin: origin, hasDistance: true, distanceOrigin: origin }), check);
        }
        console.log("CSV Matrix Merge time: ", (Date.now() - start).toLocaleString(), "ms");
        resolve({ nn, nl, tn, tl });
      };
      computer.postMessage(file.contents);
    })
  };

  MT.r01 = Math.random;

  // ported from https://github.com/CDCgov/SeqSpawnR/blob/91d5857dbda5998839a002fbecae0f494dca960a/R/SequenceSpawner.R
  MT.generateSeqs = (idPrefix, count, snps, seed) => {
    let start = Date.now();
    if (!count) count = 1000;
    if (!snps) snps = 100;
    if (!seed) seed = session.data.reference;

    let sampleCodons = [
      "GCA",
      "GCC",
      "GCG",
      "GCT",
      "AAC",
      "AAT",
      "GAC",
      "GAT",
      "TGC",
      "TGT",
      "GAC",
      "GAT",
      "GAA",
      "GAG",
      "TTC",
      "TTT",
      "GGA",
      "GGC",
      "GGG",
      "GGT",
      "CAC",
      "CAT",
      "ATA",
      "ATC",
      "ATT",
      "AAA",
      "AAG",
      "CTA",
      "CTC",
      "CTG",
      "CTT",
      "TTA",
      "TTG",
      "ATG",
      "AAC",
      "AAT",
      "CCA",
      "CCC",
      "CCG",
      "CCT",
      "CAA",
      "CAG",
      "AGA",
      "AGG",
      "CGA",
      "CGC",
      "CGG",
      "CGT",
      "AGC",
      "AGT",
      "TCA",
      "TCC",
      "TCG",
      "TCT",
      "ACA",
      "ACC",
      "ACG",
      "ACT",
      "GTA",
      "GTC",
      "GTG",
      "GTT",
      "TGG",
      "TAC",
      "TAT",
      "CAA",
      "CAG",
      "GAA",
      "GAG"
    ];
    let sampleSNPs = ["A", "C", "G", "T"];

    let sample = (vec, nCodons) => {
      let samples = [];
      for (let x = 0; x < nCodons; x++) {
        let idx = Math.floor(MT.r01() * vec.length);
        samples.push(vec[idx]);
      }
      return samples;
    }

    let seqs = [];

    seqs.push({ id: idPrefix + "0", seq: seed });

    while (seqs.length < count) {
      // number codons to vary
      let nCodons = Math.floor(MT.r01() * 10) + 1;

      // randomly select this many to check for existence
      let randomCodonSet = sample(sampleCodons, nCodons).join("");

      // try again if not present
      if (seqs[seqs.length - 1].seq.indexOf(randomCodonSet) == -1) continue;

      // sequence to mutate
      let oldseed = seqs[Math.floor(MT.r01() * seqs.length)].seq;

      // select codons to replace randomCodonSet
      let replacementCodonSet = sample(sampleCodons, nCodons).join("");

      // replace codon set
      let newseed = oldseed.replace(randomCodonSet, replacementCodonSet);

      // add snp substitutions randomly across entire sequence
      // - randomly sample addedSNP
      // - randomly pick SNPS to replace
      let addedSNPs = Math.floor(MT.r01() * snps);
      for (let j = 0; j < addedSNPs; j++) {
        let randomSNP = sample(sampleSNPs, 1)[0];
        let locOfSNP = Math.floor(MT.r01() * seed.length);
        newseed =
          newseed.substr(0, locOfSNP) + randomSNP + newseed.substr(locOfSNP + 1);
      }

      seqs.push({ id: idPrefix + "" + seqs.length, seq: newseed });
    }
    console.log("Sequence spawn time:", (Date.now() - start).toLocaleString(), 'ms');
    return seqs;
  };

  MT.align = params => {
    return new Promise(resolve => {
      if (params.aligner == "none") {
        return resolve(params.nodes);
      }
      let n = params.nodes.length;
      let referenceLength = params.reference.length;
      let aligner = new Worker("workers/align-sw.js");
      aligner.onmessage = response => {
        let subset = JSON.parse(MT.decode(new Uint8Array(response.data.nodes)));
        console.log("Alignment transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
        let start = Date.now();
        let minPadding = Infinity,
          d = null;
        for (let i = 0; i < n; i++) {
          d = subset[i];
          if (!d._seq) d._seq = "";
          if (minPadding > d._padding) minPadding = d._padding;
        }
        for (let j = 0; j < n; j++) {
          d = subset[j];
          d._seq = "-".repeat(d._padding - minPadding) + d._seq;
          if (d._seq.length > referenceLength) {
            d._seq = d._seq.substring(0, referenceLength);
          } else {
            d._seq = d._seq.padEnd(referenceLength, "-");
          }
        }
        session.data.nodeFields.push('_score');
        session.data.nodeFields.push('_padding');
        session.data.nodeFields.push('_cigar');
        console.log("Alignment Padding time: ", (Date.now() - start).toLocaleString(), "ms");
        resolve(subset);
      };
      aligner.postMessage(params);
    });
  };

  MT.computeConsensus = nodes => {
    if (!nodes) nodes = session.data.nodes.filter(d => d.seq);
    return new Promise(resolve => {
      let computer = new Worker("workers/compute-consensus.js");
      computer.onmessage = response => {
        console.log("Consensus Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
        resolve(MT.decode(new Uint8Array(response.data.consensus)));
      };
      computer.postMessage(nodes);
    });
  };

  MT.computeAmbiguityCounts = () => {
    return new Promise(resolve => {
      let nodes = session.data.nodes;
      let subset = nodes.filter(d => d.seq);
      const subsetLength = subset.length;
      let computer = new Worker("workers/compute-ambiguity-counts.js");
      computer.onmessage = response => {
        console.log("Ambiguity Count Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
        let start = Date.now();
        const dists = new Float32Array(response.data.counts);
        for (let j = 0; j < subsetLength; j++) {
          nodes[subset[j].index]._ambiguity = dists[j];
        }
        session.data.nodeFields.push('_ambiguity');
        console.log("Ambiguity Count Merge time: ", (Date.now() - start).toLocaleString(), "ms");
        resolve();
      };
      computer.postMessage(subset);
    });
  };

  MT.computeConsensusDistances = () => {
    return new Promise(resolve => {
      let start = Date.now();
      let nodes = session.data.nodes;
      let nodesLength = nodes.length;
      let subset = [];
      for (let i = 0; i < nodesLength; i++) {
        let node = nodes[i];
        if (node.seq) {
          subset.push({
            index: i,
            seq: node.seq
          });
        } else {
          subset.push({
            index: i,
            seq: ""
          });
        }
      }
      let subsetLength = subset.length;
      let computer = new Worker("workers/compute-consensus-distances.js");
      computer.onmessage = response => {
        let dists = new Uint16Array(response.data.dists);
        console.log("Consensus Difference Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
        start = Date.now();
        for (let j = 0; j < subsetLength; j++) {
          nodes[subset[j].index]._diff = dists[j];
        }
        session.data.nodeFields.push('_diff');
        console.log("Consensus Difference Merge time: ", (Date.now() - start).toLocaleString(), "ms");
        resolve();
      };
      computer.postMessage({
        consensus: session.data.consensus,
        subset: subset,
        start: start
      });
    });
  };

  MT.computeLinks = subset => {
    return new Promise(resolve => {
      let k = 0;
      let computer = new Worker("workers/compute-links.js");
      computer.onmessage = response => {
        let dists = session.style.widgets['default-distance-metric'] == 'snps' ?
          new Uint16Array(response.data.links) :
          new Float32Array(response.data.links);
        console.log("Links Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
        let start = Date.now();
        let check = session.files.length > 1;
        let n = subset.length;
        let l = 0;
        for (let i = 0; i < n; i++) {
          let sourceID = subset[i]._id;
          for (let j = 0; j < i; j++) {
            let targetID = subset[j]._id;
            k += MT.addLink({
              source: sourceID,
              target: targetID,
              distance: dists[l++],
              origin: ['Genetic Distance'],
              distanceOrigin: 'Genetic Distance',
              hasDistance: true
            }, check);
          }
        }
        console.log("Links Merge time: ", (Date.now() - start).toLocaleString(), "ms");
        resolve(k);
      };
      computer.postMessage({
        nodes: subset,
        metric: session.style.widgets['default-distance-metric'],
        strategy: session.style.widgets["ambiguity-resolution-strategy"],
        threshold: session.style.widgets["ambiguity-threshold"]
      });
    });
  };

  MT.getDM = () => {
    let start = Date.now();
    return new Promise(resolve => {
      let labels = session.data.nodes.map(d => d._id);
      let metric = session.style.widgets['link-sort-variable'];
      const n = labels.length;
      let dm = new Array(n);
      for (let i = 0; i < n; i++) {
        dm[i] = new Array(n);
        dm[i][i] = 0;
        let source = labels[i];
        let row = temp.matrix[source];
        if (!row) {
          console.error('Incompletely populated temp.matrix! Couldn\'t find ' + source);
          continue;
        }
        for (let j = 0; j < i; j++) {
          let link = row[labels[j]];
          if (link) {
            dm[i][j] = dm[j][i] = link[metric];
          } else {
            dm[i][j] = dm[j][i] = null;
          }
        }
      }
      console.log("DM Compute time: ", (Date.now() - start).toLocaleString(), "ms");
      resolve(dm);
    });
  };

  MT.computeTree = () => {
    return new Promise((resolve, reject) => {
      let computer = new Worker("workers/compute-tree.js");
      computer.onmessage = response => {
        temp.tree = patristic.parseJSON(MT.decode(new Uint8Array(response.data.tree)));
        console.log("Tree Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
        resolve();
      };
      computer.onerror = e => {
        console.error(e);
        reject(e);
      };
      MT.getDM().then(dm => {
        computer.postMessage({
          labels: Object.keys(temp.matrix),
          matrix: dm,
          round: session.style.widgets["tree-round"]
        });
      });
    });
  };

  MT.computeDirectionality = () => {
    return new Promise(resolve => {
      let computer = new Worker("workers/compute-directionality.js");
      computer.onmessage = response => {
        let flips = new Uint8Array(response.data.output);
        console.log("Directionality Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
        let start = Date.now();
        let n = flips.length;
        for (let i = 0; i < n; i++) {
          if (flips[i]) {
            let fliplink = session.data.links[i];
            let fliptemp = fliplink.source;
            fliplink.source = fliplink.target;
            fliplink.target = fliptemp;
            fliplink.directed = true;
          }
        }
        console.log("Directionality Integration time: ", (Date.now() - start).toLocaleString(), "ms");
        resolve();
      };
      computer.postMessage({
        links: session.data.links,
        tree: temp.tree
      });
    });
  };

  MT.computeMST = () => {
    return new Promise((resolve, reject) => {
      let mstMachine = new Worker("workers/compute-mst.js");
      mstMachine.onmessage = response => {
        if (response.data == "Error") {
          return reject("MST washed out");
        }
        let output = new Uint8Array(response.data.links);
        console.log("MST Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
        const start = Date.now();
        let links = session.data.links;
        const numLinks = links.length;
        for (let i = 0; i < numLinks; i++) {
          links[i].nn = output[i] ? true : false;
        }
        console.log("MST Merge time: ", (Date.now() - start).toLocaleString(), "ms");
        resolve();
      };
      mstMachine.onerror = (e) => {
        console.log(e);
        resolve();
      };
      mstMachine.postMessage({
        links: session.data.links,
        matrix: temp.matrix,
        epsilon: session.style.widgets["filtering-epsilon"],
        metric: session.style.widgets['link-sort-variable']
      });
    });
  };

  MT.computeNN = () => {
    return new Promise((resolve, reject) => {
      let nnMachine = new Worker("workers/compute-nn.js");
      nnMachine.onmessage = response => {
        if (response.data == "Error") {
          return reject("Nearest Neighbor washed out");
        }
        let output = new Uint8Array(response.data.links);
        console.log("NN Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
        const start = Date.now();
        let links = session.data.links;
        const numLinks = links.length;
        for (let i = 0; i < numLinks; i++) {
          links[i].nn = output[i] ? true : false;
        }
        console.log("NN Merge time: ", (Date.now() - start).toLocaleString(), "ms");
        resolve();
      };
      nnMachine.postMessage({
        links: session.data.links,
        matrix: temp.matrix,
        epsilon: session.style.widgets["filtering-epsilon"],
        metric: session.style.widgets['link-sort-variable']
      });
    });
  };

  MT.computeTriangulation = () => {
    return new Promise((resolve, reject) => {
      const metric = session.style.widgets['link-sort-variable'];
      let machine = new Worker("workers/compute-triangulation.js");
      machine.onmessage = response => {
        if (response.data == "Error") return reject("Triangulation washed out");
        console.log("Triangulation Transit time: ", (Date.now() - response.data.start).toLocaleString(), "ms");
        let start = Date.now();
        let matrix = JSON.parse(MT.decode(new Uint8Array(response.data.matrix)));
        let labels = Object.keys(temp.matrix);
        const n = labels.length;
        for (let i = 0; i < n; i++) {
          let source = labels[i];
          let row = temp.matrix[source];
          for (let j = 0; j < i; j++) {
            let target = labels[j];
            if (!row[target]) {
              MT.addLink({
                source: source,
                target: target,
                origin: ['Triangulation'],
                visible: false
              });
            }
            row[target][metric] = matrix[i][j];
          }
        }
        console.log("Triangulation Merge time: ", (Date.now() - start).toLocaleString(), "ms");
        resolve();
      };
      MT.getDM().then(dm => {
        machine.postMessage({
          matrix: dm
        });
      });
    });
  };

  MT.runHamsters = async () => {
    // if (!session.style.widgets['triangulate-false']) await MT.computeTriangulation(); #236
    // MT.computeNN();
    // MT.computeMST();
    // await MT.computeTree();
    if (!session.style.widgets['infer-directionality-false']) MT.computeDirectionality();
    MT.finishUp();
  };

  MT.finishUp = async (oldSession) => {
    clearTimeout(temp.messageTimeout);
    ["node", "link"].forEach(v => {
      let n = session.data[v + "s"].length;
      let fields = session.data[v + "Fields"];
      for (let i = 0; i < n; i++) {
        let d = session.data[v + "s"][i];
        fields.forEach(field => {
          if (!(field in d)) d[field] = null;
        });
      }
    });

    // patch missing date fields to earliest date in the the data
    let fields = session.data["nodeFields"];
    let nodeSkeleton = MT.dataSkeleton();
    let fieldsToCheck = fields.filter(f => !nodeSkeleton.nodeFields.includes(f) && f != '_ambiguity' && f != '_diff');
    let n = session.data.nodes.length;
    let k = fieldsToCheck.length;
    for (let j = 0; j < k; j++) {
      let field = fieldsToCheck[j];
      let times = [];
      for (let i = 0; i < n; i++) {
        let node = session.data.nodes[i];
        if (node[field] != null) {
          let time = moment(node[field]);
          if (time.isValid() && isNaN(node[field])) //#315
            times.push(time.toDate());
        }
      }

      // If column has the word date in it, date expected to be in column 
      if (field.toLowerCase().includes("date")) {

        let minTime = Math.min(...times);
        let minTimeString = new Date(minTime).toString();
        session.data.nodes.forEach(d => {
          if (d[field] == null || (d[field] && String(d[field]).trim() == "")) {
            d[field] = minTimeString;
          }
        });
      }
    };

    $("#search-field")
      .html(session.data.nodeFields.map(field => '<option value="' + field + '">' + MT.titleize(field) + "</option>").join("\n"))
      .val(session.style.widgets["search-field"]);
    $("#search-form").css("display", "flex");
    $("#link-sort-variable")
      .html(session.data.linkFields.map(field => '<option value="' + field + '">' + MT.titleize(field) + "</option>").join("\n"))
      .val(session.style.widgets["link-sort-variable"]);
    $("#node-color-variable")
      .html(
        "<option selected>None</option>" +
        session.data.nodeFields.map(field => '<option value="' + field + '">' + MT.titleize(field) + "</option>").join("\n"))
      .val(session.style.widgets["node-color-variable"]);
    $("#node-timeline-variable")
      .html(
        "<option selected>None</option>" +
        session.data.nodeFields.map(field => '<option value="' + field + '">' + MT.titleize(field) + "</option>").join("\n"))
      .val(session.style.widgets["node-timeline-variable"]);
    $("#link-color-variable")
      .html(
        "<option>None</option>" +
        session.data.linkFields.map(field => '<option value="' + field + '">' + MT.titleize(field) + "</option>").join("\n"))
      .val(session.style.widgets["link-color-variable"]);
    try {
      MT.updateThresholdHistogram();
    } catch (error) {
      console.error(error);
      $("#loading-information-modal").modal("hide");
      alertify
        .error("Something went wrong! Please click here to start a new session and try again.")
        .delay(0)
        .ondismiss(() => window.location.reload());
    }
    MT.setLinkVisibility(true);
    // $("#SettingsTab").attr("data-target", "#global-settings-modal");
    session.meta.loadTime = Date.now() - session.meta.startTime;
    console.log("Total load time:", session.meta.loadTime.toLocaleString(), "ms");
    if (oldSession) {
      setTimeout(() => {
        MT.loadLayout(session.layout), 80
      }
      );
    } else {
      MT.launchView(session.style.widgets['default-view']);
    }
    MT.tagClusters().then(() => {
      MT.setClusterVisibility(true);
      MT.setLinkVisibility(true);
      MT.setNodeVisibility(true);
      ["cluster", "link", "node"].forEach(thing => $window.trigger(thing + "-visibility"));
      // Default link color variable to origin on launch if variable not set
      if ($("#link-color-variable").val() || $("#link-color-variable").val() === "") {
        $("#link-color-variable").val("origin");
        $("#link-color-variable").trigger("change");
      }
      $("#network-statistics-wrapper").fadeIn();
      //Temp fix to set link visibility appropriately when loading csv matrix file
      MT.tagClusters();
      MT.updateStatistics();
    });
    localforage.getItem("stash-auto").then(autostash => {
      if (autostash == "true") {
        temp.autostash = {
          time: Date.now(),
          interval: setInterval(() => {
            let newTime = Date.now();
            localforage.setItem("stash-" + newTime + "-autostash", JSON.stringify(session));
            localforage.removeItem("stash-" + temp.autostash.time + "-autostash");
            temp.autostash.time = newTime;
          }, 60000)
        };
      }
    })
    $(".hideForHIVTrace").css("display", "flex");

    setTimeout(() => {
      let files = layout.contentItems.find(item => item.componentName == "files");
      if (files) files.remove();
      $("#loading-information-modal").modal("hide");
    }, 1200);
  };

  MT.titleize = title => {
    let small = title.toLowerCase().replace(/_/g, " ");
    if (small == "null") return "(Empty)";
    if (small == "id" || small == " id") return "ID";
    if (small == "tn93") return "TN93";
    if (small == "snps") return "SNPs";
    if (small == "2d network") return "2D Network";
    if (small == "3d network") return "3D Network";
    if (small == "geo map") return "Map";
    if (small == "timeline") return "Epi Curve";
    if (small == "nn") return "Nearest Neighbor";
    return title;
    // TODO add back titlize if required
    return small.replace(/(?:^|\s|-)\S/g, c => c.toUpperCase());
  };

  MT.tagClusters = () => {
    return new Promise(resolve => {
      let start = Date.now();
      let clusters = session.data.clusters = [];
      let nodes = session.data.nodes,
        links = session.data.links,
        labels = nodes.map(d => d._id);
      let numNodes = nodes.length,
        numLinks = links.length;
      let tempnodes = temp.nodes = [];
      let lsv = session.style.widgets["link-sort-variable"];

      let DFS = (id, cluster) => {
        if (tempnodes.indexOf(id) >= 0) return;
        tempnodes.push(id);
        let node = {};
        for (let i = 0; i < numNodes; i++) {
          let d = nodes[i];
          if (d._id == id) {
            node = d;
            break;
          }
        }
        let clusterID = cluster.id;
        node.cluster = clusterID;
        cluster.nodes++;
        let row = temp.matrix[id];
        if (!row) return;
        for (let j = 0; j < numNodes; j++) {
          let l = row[labels[j]];
          if (!l) continue;
          if (!l.visible) continue;
          l.cluster = clusterID;
          cluster.links++;
          cluster.sum_distances += l[lsv];
          if (tempnodes.length == numNodes) return;
          DFS(l.source, cluster);
          DFS(l.target, cluster);
        }
      };

      for (let k = 0; k < numNodes; k++) {
        let d = nodes[k];
        d.degree = 0;
        let id = d._id;
        if (tempnodes.indexOf(id) == -1) {
          let cluster = {
            id: clusters.length,
            nodes: 0,
            links: 0,
            sum_distances: 0,
            links_per_node: 0,
            mean_genetic_distance: undefined,
            visible: true
          };
          clusters.push(cluster);
          DFS(id, cluster);
          if (tempnodes.length == numNodes) break;
        }
      }
      console.log("Cluster Tagging time:", (Date.now() - start).toLocaleString(), "ms");

      start = Date.now();
      //This is O(N^3)
      //TODO: Refactor using temp.matrix to get O(N^2)
      for (let m = 0; m < numLinks; m++) {
        let l = links[m];
        if (l.visible === false) {
          continue;
        }

        let s = false,
          t = false;
        for (let n = 0; n < numNodes; n++) {
          let node = nodes[n];
          // node.degree = 0;
          if (l.source == node._id) {
            s = true;
            node.degree++;
          }
          if (l.target == node._id) {
            t = true;
            node.degree++;
          }
          if (s && t) break;
        }
      }
      clusters.forEach(c => {
        c.links = c.links / 2;
        c.links_per_node = c.links / c.nodes;
        c.mean_genetic_distance = c.sum_distances / 2 / c.links;
      });
      console.log("Degree Computation time:", (Date.now() - start).toLocaleString(), "ms");
      resolve();
    });
  };

  MT.setNodeVisibility = silent => {
    let start = Date.now();
    let dateField = session.style.widgets["timeline-date-field"];
    let nodes = session.data.nodes,
      clusters = session.data.clusters;
    let n = nodes.length;
    for (let i = 0; i < n; i++) {
      let node = nodes[i];
      node.visible = true;
      let cluster = clusters[node.cluster];
      if (cluster) {
        node.visible = node.visible && cluster.visible;
      }
      if (dateField != "None") {
        node.visible = node.visible && moment(session.state.timeEnd).toDate() >= moment(node[dateField]).toDate();
      }
    }
    if (!silent) $window.trigger("node-visibility");
    console.log("Node Visibility Setting time:", (Date.now() - start).toLocaleString(), "ms");
  };

  MT.setLinkVisibility = silent => {
    let start = Date.now();
    let metric = session.style.widgets["link-sort-variable"],
      threshold = session.style.widgets["link-threshold"],
      showNN = session.style.widgets["link-show-nn"];
    let links = session.data.links;
    let clusters = session.data.clusters;
    let n = links.length;
    for (let i = 0; i < n; i++) {
      let link = links[i];
      let visible = true;
      let overrideNN = false;

      if (link.hasDistance && !link.origin.includes(link.distanceOrigin)) {
        link.origin.push(link.distanceOrigin);
      }

      // No distance value
      if (link[metric] == null) {

        // If origin file exists for link outside of distance, keep visible
        if (link.origin.filter(fileName => !fileName.includes(link.distanceOrigin)).length > 0) {
          // Set visible and origin to only show the from the file outside of Distance
          link.origin = link.origin.filter(fileName => !fileName.includes(link.distanceOrigin));
          overrideNN = true;
          visible = true;
        } else {
          link.visible = false;
          continue;
        }

      } else {

        if (link.hasDistance) {

          visible = link[metric] <= threshold;

          if (link[metric] == 0) {

            if (link.origin.filter(fileName => !fileName.includes(link.distanceOrigin)).length > 0) {
              // Set visible and origin to only show the from the file outside of Distance
              link.origin = link.origin.filter(fileName => !fileName.includes(link.distanceOrigin));
              visible = true;
              overrideNN = true;
            }
          }

          if (!visible) {

            // Only need to get distance origin and override if there are other files using a distance metric, otherwise the else code block below would be exectued since the link would not have distance
            if (link.origin.length > 1 && link.origin.filter(fileName => !fileName.includes(link.distanceOrigin)).length > 0) {
              // Set visible and origin to only show the from the file outside of Distance
              link.origin = link.origin.filter(fileName => !fileName.includes(link.distanceOrigin));
              overrideNN = true;
              visible = true;
            }
          }

        } else {

          // If has no distance, then link should be visible and unnaffected by NN
          overrideNN = true;
          visible = true;

        }

      }

      if (visible && showNN && !overrideNN) {
        visible = visible && link.nn;
        // Keep link visible of not nearest neighbor, but still connected via an edge list
        if (!visible && link.origin.filter(fileName => !fileName.includes(link.distanceOrigin)).length > 0) {
          link.origin = link.origin.filter(fileName => !fileName.includes(link.distanceOrigin));
          visible = true;
        }
      }

      let cluster = clusters[link.cluster];
      if (cluster) {
        visible = visible && cluster.visible;
      }

      link.visible = visible;


    }
    if (!silent) $window.trigger("link-visibility");
    console.log("Link Visibility Setting time:", (Date.now() - start).toLocaleString(), "ms");
  };

  MT.setClusterVisibility = silent => {
    let start = Date.now();
    let min = session.style.widgets["cluster-minimum-size"];
    let clusters = session.data.clusters;
    let n = clusters.length;
    for (let i = 0; i < n; i++) {
      let cluster = clusters[i];
      cluster.visible = cluster.nodes >= min;
    }
    if (!silent) $window.trigger("cluster-visibility");
    console.log("Cluster Visibility Setting time:", (Date.now() - start).toLocaleString(), "ms");
  };

  MT.getNetworkNodes = () => {
    let nodes = session.network.nodes;
    let n = nodes.length;
    let out = [];
    for (let i = 0; i < n; i++) {
      let node = nodes[i];
      out.push(JSON.parse(JSON.stringify(node)));
    }
    return out;
  };

  MT.updatePinNodes = copy => {
    let nodes = session.network.nodes;
    let n = nodes.length;
    for (let i = 0; i < n; i++) {
      let node = nodes[i];
      if (copy && node.fixed) node.preFixed = true;
      if (!copy && session.network.timelineNodes[i].preFixed) {
        node.fixed = true;
        node.fx = node.x;
        node.fy = node.y;
      }
    }
  };

  MT.getVisibleNodes = copy => {
    let nodes = session.data.nodes;
    let n = nodes.length;
    let out = [];
    if (copy) {
      for (let i = 0; i < n; i++) {
        let node = nodes[i];
        if (node.visible) {
          out.push(JSON.parse(JSON.stringify(node)));
        }
      }
    } else {
      for (let i = 0; i < n; i++) {
        let node = nodes[i];
        if (node.visible) {
          out.push(node);
        }
      }
    }
    return out;
  };

  MT.getVisibleLinks = copy => {
    let links = session.data.links;
    let n = links.length;
    let out = [];
    if (copy) {
      for (let i = 0; i < n; i++) {
        let link = links[i];
        if (link.visible) {
          out.push(JSON.parse(JSON.stringify(link)));
        }
      }
    } else {
      for (let j = 0; j < n; j++) {
        let link = links[j];
        if (link.visible) {
          out.push(link);
        }
      }
    }
    return out;
  };

  MT.getVisibleClusters = copy => {
    let clusters = session.data.clusters;
    let n = clusters.length;
    let out = [];
    if (copy) {
      for (let i = 0; i < n; i++) {
        let cluster = clusters[i];
        if (cluster.visible) {
          out.push(JSON.parse(JSON.stringify(cluster)));
        }
      }
    } else {
      for (let j = 0; j < n; j++) {
        let cluster = clusters[j];
        if (cluster.visible) {
          out.push(cluster);
        }
      }
    }
    return out;
  };

  MT.updateStatistics = () => {
    if ($("#network-statistics-hide").is(":checked")) return;
    let vnodes = MT.getVisibleNodes();
    let vlinks = MT.getVisibleLinks();
    let linkCount = 0;
    let clusterCount = 0;
    if (session.style.widgets["timeline-date-field"] == 'None') {
      linkCount = vlinks.length;
      clusterCount = session.data.clusters.filter(cluster => cluster.visible && cluster.nodes > 1).length;
    } else {
      let n = vlinks.length;
      for (let i = 0; i < n; i++) {
        let src = vnodes.find(d => d._id == vlinks[i].source || d.id == vlinks[i].source);
        let tgt = vnodes.find(d => d._id == vlinks[i].target || d.id == vlinks[i].target);
        if (src && tgt) linkCount++;
      }

      n = vnodes.length;
      let clusters = {};
      for (let i = 0; i < n; i++) {
        let id = vnodes[i].cluster;
        if (clusters[id]) clusters[id]++;
        else clusters[id] = 1;
      }
      clusterCount = session.data.clusters.filter(cluster => clusters[cluster.id] && clusters[cluster.id] > 2 && cluster.visible && cluster.nodes > 1).length;
    }
    let singletons = vnodes.filter(d => d.degree == 0).length;
    $("#numberOfSelectedNodes").text(vnodes.filter(d => d.selected).length.toLocaleString());
    $("#numberOfNodes").text(vnodes.length.toLocaleString());
    $("#numberOfVisibleLinks").text(linkCount.toLocaleString());
    $("#numberOfSingletonNodes").text(singletons.toLocaleString());
    //$("#numberOfDisjointComponents").text(session.data.clusters.length - singletons);
    $("#numberOfDisjointComponents").text(clusterCount.toLocaleString()); // #187
  };

  MT.createNodeColorMap = () => {
    let variable = session.style.widgets["node-color-variable"];
    if (variable == "None") {
      temp.style.nodeColorMap = () => session.style.widgets["node-color"];
      return [];
    }

    let nodeColors;
    if (session.style.nodeColorsTable[variable]) {
      nodeColors = [...session.style.nodeColorsTable[variable]];
    } else {
      nodeColors = session.style.nodeColorsTable[variable] = [...session.style.nodeColors];
    }

    let aggregates = {};
    let nodes = session.data.nodes;
    let n = nodes.length;
    for (let i = 0; i < n; i++) {
      let d = nodes[i];
      if (!d.visible) continue;
      let dv = d[variable];
      if (dv in aggregates) {
        aggregates[dv]++;
      } else {
        aggregates[dv] = 1;
      }
    }
    let values = Object.keys(aggregates);
    if (values.length > nodeColors.length) {
      let colors = [];
      let m = Math.ceil(values.length / nodeColors.length);
      while (m-- > 0) {
        colors = colors.concat(nodeColors);
      }
      nodeColors = colors;
    }
    if (!session.style.nodeAlphas) session.style.nodeAlphas = new Array(values.length).fill(1);
    if (values.length > session.style.nodeAlphas.length) {
      session.style.nodeAlphas = session.style.nodeAlphas.concat(
        new Array(values.length - session.style.nodeAlphas.length).fill(1)
      );
    }

    let keys = Object.keys(session.style.nodeColorsTableHistory)

    //Update Table History
    values.forEach((val, ind) => {

      // Get index of value in history
      let index = keys.findIndex(key => key === val);

      //If found in history set previous color
      if (index !== -1) {

        // Update color of where value currently is
        nodeColors[ind] = session.style.nodeColorsTableHistory[val];

        //If value not found in history, add it
      } else {
        session.style.nodeColorsTableHistory[val] = nodeColors[ind];
      }

      if (val === "null") {
        nodeColors[ind] = "#EAE553"
      }

    });

    if (session.style.widgets["node-timeline-variable"] == 'None') {
      session.style.nodeColorsTableKeys[variable] = values;
      session.style.nodeColorsTable[variable] = nodeColors;
    } else {

      // During timeline mode, user Pause and switch to a different Node varaible but nodeColorsTableKeys[variable] is not available
      if (!session.style.nodeColorsTableKeys[variable]) {
        let aggregatesTL = {};
        let nodesTL = session.network.timelineNodes;
        let n = nodesTL.length;
        let nodeColorsTL = [...session.style.nodeColors];
        for (let i = 0; i < n; i++) {
          let d = nodesTL[i];
          if (!d.visible) continue;
          let dv = d[variable];
          if (dv in aggregatesTL) {
            aggregatesTL[dv]++;
          } else {
            aggregatesTL[dv] = 1;
          }
        }
        let valuesTL = Object.keys(aggregatesTL);
        if (valuesTL.length > nodeColorsTL.length) {
          let colors = [];
          let m = Math.ceil(valuesTL.length / nodeColorsTL.length);
          while (m-- > 0) {
            colors = colors.concat(nodeColorsTL);
          }
          nodeColorsTL = colors;
        }
        session.style.nodeColorsTableKeys[variable] = valuesTL;
        session.style.nodeColorsTable[variable] = nodeColorsTL;
      }

      let key;
      let tempNodeColors = [];
      for (let v of values) {
        let table = session.style.nodeColorsTableKeys[variable];
        key = table.findIndex(k => k === v);
        tempNodeColors.push(nodeColors[key]);
      }
      nodeColors = temp.style.nodeColor = tempNodeColors; // temp node color maps saved only under timeline
      temp.style.nodeColorKeys = [...values];
    }

    temp.style.nodeColorMap = d3
      .scaleOrdinal(nodeColors)
      .domain(values);

    temp.style.nodeAlphaMap = d3
      .scaleOrdinal(session.style.nodeAlphas)
      .domain(values);

    return aggregates;
  };

  MT.createLinkColorMap = () => {
    let variable = session.style.widgets["link-color-variable"];
    if (variable == "None") {
      temp.style.linkColorMap = () => session.style.widgets["link-color"];
      temp.style.linkAlphaMap = () => 1 - session.style.widgets["link-opacity"];
      return [];
    }

    let linkColors;
    if (session.style.linkColorsTable[variable]) {
      linkColors = session.style.linkColorsTable[variable];
    } else {
      linkColors = session.style.linkColorsTable[variable] = [...session.style.linkColors];
    }

    let aggregates = {};
    let links = MT.getVisibleLinks();
    let i = 0,
      n = links.length,
      l;
    if (variable == "origin") {
      while (i < n) {
        l = links[i++];
        if (!l.visible) continue;

        let src = session.data.nodes.find(dd => dd._id == l.source || dd.id == l.source);
        let tgt = session.data.nodes.find(dd => dd._id == l.target || dd.id == l.target);
        if (src === undefined || src.visible === false) continue;
        if (tgt === undefined || tgt.visible === false) continue;

        l.origin.forEach(o => {
          if (o in aggregates) {
            aggregates[o]++;
          } else {
            aggregates[o] = 1;
          }
        });
      }
    } else {
      while (i < n) {
        l = links[i++];
        if (!l.visible) continue;

        let src = session.data.nodes.find(dd => dd._id == l.source || dd.id == l.source);
        let tgt = session.data.nodes.find(dd => dd._id == l.target || dd.id == l.target);
        if (src === undefined || src.visible === false) continue;
        if (tgt === undefined || tgt.visible === false) continue;

        let lv = l[variable];
        if (lv in aggregates) {
          aggregates[lv]++;
        } else {
          aggregates[lv] = 1;
        }
      }
    }
    let values = Object.keys(aggregates);
    if (values.length > linkColors.length) {
      let colors = [];
      let cycles = Math.ceil(values.length / linkColors.length);
      while (cycles-- > 0) colors = colors.concat(linkColors);
      linkColors = colors;
    }
    if (!session.style.linkAlphas) session.style.linkAlphas = new Array(values.length).fill(1);
    if (values.length > session.style.linkAlphas.length) {
      session.style.linkAlphas = session.style.linkAlphas.concat(
        new Array(values.length - session.style.linkAlphas.length).fill(1)
      );
    }

    if (session.style.widgets["node-timeline-variable"] == 'None') {
      session.style.linkColorsTableKeys[variable] = values;
      session.style.linkColorsTable[variable] = linkColors;
    } else {

      // During timeline mode, user Pause and switch to a different link varaible but linkColorsTableKeys[variable] is not available
      if (!session.style.linkColorsTableKeys[variable]) {
        let aggregatesTL = {};
        let linksTL = MT.getVisibleLinks();
        let linkColorsTL = [...session.style.linkColors];
        let i = 0,
          n = linksTL.length,
          l;
        if (variable == "origin") {
          while (i < n) {
            l = linksTL[i++];
            if (!l.visible) continue;
            let src = session.network.timelineNodes.find(dd => dd._id == l.source || dd.id == l.source);
            let tgt = session.network.timelineNodes.find(dd => dd._id == l.target || dd.id == l.target);
            if (src === undefined || src.visible === false) continue;
            if (tgt === undefined || tgt.visible === false) continue;
            l.origin.forEach(o => {
              if (o in aggregatesTL) {
                aggregatesTL[o]++;
              } else {
                aggregatesTL[o] = 1;
              }
            });
          }
        } else {
          while (i < n) {
            l = linksTL[i++];
            if (!l.visible) continue;
            let src = session.network.timelineNodes.find(dd => dd._id == l.source || dd.id == l.source);
            let tgt = session.network.timelineNodes.find(dd => dd._id == l.target || dd.id == l.target);
            if (src === undefined || src.visible === false) continue;
            if (tgt === undefined || tgt.visible === false) continue;
            let lv = l[variable];
            if (lv in aggregatesTL) {
              aggregatesTL[lv]++;
            } else {
              aggregatesTL[lv] = 1;
            }
          }
        }
        let valuesTL = Object.keys(aggregatesTL);
        if (valuesTL.length > linkColorsTL.length) {
          let colors = [];
          let cycles = Math.ceil(valuesTL.length / linkColorsTL.length);
          while (cycles-- > 0) colors = colors.concat(linkColorsTL);
          linkColorsTL = colors;
        }
        session.style.linkColorsTableKeys[variable] = valuesTL;
        session.style.linkColorsTable[variable] = linkColorsTL;
      }

      let key;
      let tempLinkColors = [];
      for (let v of values) {
        let table = session.style.linkColorsTableKeys[variable];
        key = table.findIndex(k => k === v);
        tempLinkColors.push(linkColors[key]);
      }
      linkColors = temp.style.linkColor = tempLinkColors; // temp link color maps saved only under timeline
      temp.style.linkColorsKeys = [...values];
    }

    temp.style.linkColorMap = d3
      .scaleOrdinal(linkColors)
      .domain(values);

    temp.style.linkAlphaMap = d3
      .scaleOrdinal(session.style.linkAlphas)
      .domain(values);

    return aggregates;
  };

  MT.createPolygonColorMap = () => {
    if (!temp.polygonGroups || !session.style.widgets["polygons-color-show"]) {
      temp.style.polygonColorMap = () => session.style.widgets["polygon-color"];
      return [];
    }

    let aggregates = {};
    let groups = temp.polygonGroups;
    groups.forEach(d => aggregates[d.key] = d.values.length);
    let values = Object.keys(aggregates);

    if (session.style.widgets["polygon-color-table-counts-sort"] == "ASC")
      values.sort(function (a, b) { return aggregates[a] - aggregates[b] });
    else if (session.style.widgets["polygon-color-table-counts-sort"] == "DESC")
      values.sort(function (a, b) { return aggregates[b] - aggregates[a] });
    if (session.style.widgets["polygon-color-table-name-sort"] == "ASC")
      values.sort(function (a, b) { return a - b });
    else if (session.style.widgets["polygon-color-table-name-sort"] == "DESC")
      values.sort(function (a, b) { return b - a });

    if (values.length > session.style.polygonColors.length) {
      let colors = [];
      let m = Math.ceil(values.length / session.style.polygonColors.length);
      while (m-- > 0) {
        colors = colors.concat(session.style.polygonColors);
      }
      session.style.polygonColors = colors;
    }
    if (!session.style.polygonAlphas) session.style.polygonAlphas = new Array(values.length).fill(1);
    if (values.length > session.style.polygonAlphas.length) {
      session.style.polygonAlphas = session.style.polygonAlphas.concat(
        new Array(values.length - session.style.polygonAlphas.length).fill(0.5)
      );
    }
    if (temp.style.polygonColorMap.domain === undefined)
      temp.style.polygonColorMap = d3
        .scaleOrdinal(session.style.polygonColors)
        .domain(values);
    if (temp.style.polygonAlphaMap.domain === undefined)
      temp.style.polygonAlphaMap = d3
        .scaleOrdinal(session.style.polygonAlphas)
        .domain(values);

    return aggregates;
  };

  MT.reset = () => {
    $("#network-statistics-hide").parent().trigger("click");
    // $("#SettingsTab").attr("data-target", "#sequence-controls-modal");

    // temp variables is affecting the recall file's link visibility when recalling the same file
    // reset temp causing register component error since file view has been registered and 2nd_network view via ansyc call also causing register error
    // reset temp but retain componentCache
    let tempComp = self.temp.componentCache;
    self.temp = MT.tempSkeleton();
    self.temp.componentCache = tempComp;

    self.session = MT.sessionSkeleton();
    layout.unbind("stateChanged");
    layout.root.replaceChild(layout.root.contentItems[0], {
      type: "stack",
      content: []
    });
    layout.contentItems = [];
    console.log('getting reset');
    // MT.launchView("files");
  };

  MT.getMapData = type => {
    return new Promise(resolve => {
      let parts = type.split(".");
      let name = parts[0],
        format = parts[1];
      if (temp.mapData[name]) {
        return resolve(temp.mapData[name]);
      }
      $.get("data/" + type, response => {
        if (format == "csv") {
          temp.mapData[name] = Papa.parse(response, { header: true }).data;
        }
        if (format == "json") {
          temp.mapData[name] = response;
        }
        resolve(temp.mapData[name]);
      });
    });
  };

  //Adapted from https://24ways.org/2010/calculating-color-contrast/
  MT.contrastColor = hexcolor => {
    let r = parseInt(hexcolor.substr(1, 2), 16);
    let g = parseInt(hexcolor.substr(3, 2), 16);
    let b = parseInt(hexcolor.substr(5, 2), 16);
    let yiq = r * 299 + g * 587 + b * 114;
    return yiq >= 128000 ? "#000000" : "#ffffff";
  };

  let peek = ra => ra[ra.length - 1];

  // TODO refactor loading layout with multuiple views - not this much code needed 

  MT.loadLayoutItem = (component, parent) => {

    switch(component.type) {

      case "row":

        MT.loadRow(component, parent);

        break;

      case "stack":

        MT.loadStack(component, parent);

        break;

      case "column":

        MT.loadColumn(component, parent);

        break;

      // If neither, then view should be launched - canr have row within a row 
      // type is view 
      default:        
        if (!temp.componentCache[component.type]) {

          $.get("components/" + component.type + ".html", response => {

            temp.componentCache[component.type] = response;
            //This MUST NOT be replace by an arrow function!
            layout.registerComponent(component.type, function (container, state) {
              container.getElement().html(state.text);
            });
    
            let viewInfo = {};

            // Get view info from layout
            layoutDict.forEach(function (item, ind) {
              if (item.view == component.type) {
                viewInfo = item;
              }
            });

            // console.log('conten root: ', layout.root.contentItems);

            console.log('rotttt: ', layout.root.contentItems[0].contentItems[viewInfo["rootIndex"]]);

            // Add another contentItems
            layout.root.contentItems[0].contentItems[viewInfo["rootIndex"]].addChild({
              componentName: component.type,
              componentState: { text: temp.componentCache[component.type] },
              title: MT.titleize(component.type),
              type: "component"
            });

            MT.UpdateViewFields(peek(layout.root.contentItems[0].contentItems[viewInfo["rootIndex"]].contentItems));  

        
          });
        } else {
          let viewInfo = {};

            // Get view info from layout
            layoutDict.forEach(function (item, ind) {
              if (item.view == component.type) {
                viewInfo = item;
              }
            });

           // Add another contentItems
           layout.root.contentItems[0].contentItems[viewInfo["rootIndex"]].addChild({
            componentName: component.type,
            componentState: { text: temp.componentCache[component.type] },
            title: MT.titleize(component.type),
            type: "component"
          });

          MT.UpdateViewFields(peek(layout.root.contentItems[0].contentItems[viewInfo["rootIndex"].contentItems]));  
        }
      }
        
  }

  var contInd = 0;
  var layoutDict = [];

  MT.loadRow = (component, parent) => {


    if(component.type === "row" && component.content && (component.content[0].type === "row" || component.content[0].type === "column" ||component.content[0].type === "stack")) { 
      // Add row
      parent.addChild({ type: component.type });

    }

    component.content.forEach(c => {

      switch(c.type) {

        case "column":

          // Add child below row 
          peek(parent.contentItems).addChild({ type: c.type });

          // Check if child has non layout types (views)
          c.content.forEach(comp => {
            // Add column children to current parent
            MT.loadLayoutItem(comp, peek(parent.contentItems));
          });

          break;

        case "stack":

         // Add child below row 
         peek(parent.contentItems).addChild({ type: c.type });
        
          c.content.forEach(comp => {
            // Add stack children to current parent
            MT.loadLayoutItem(comp, peek(parent.contentItems));
         })

          break;

        // If neither, then reached view and should be launched
        // Type is view
        default:
          if (!temp.componentCache[c.type]) {
            $.get("components/" + c.type + ".html", response => {
              temp.componentCache[c.type] = response;
              //This MUST NOT be replace by an arrow function!
              layout.registerComponent(c.type, function (container, state) {
                container.getElement().html(state.text);
              });
  
              let viewInfo = {};
  
              // Get view info from layout
              layoutDict.forEach(function (item, ind) {
                if (item.view == c.type) {
                  viewInfo = item;
                }
              });

              // Add another contentItems
              layout.root.contentItems[0].contentItems[viewInfo["rootIndex"]].addChild({
                componentName: c.type,
                componentState: { text: temp.componentCache[c.type] },
                title: MT.titleize(c.type),
                type: "component"
              });

              MT.UpdateViewFields(peek(layout.root.contentItems[0].contentItems[viewInfo["rootIndex"]].contentItems));  
          
            });
          } else {
            let viewInfo = {};
  
              // Get view info from layout
              layoutDict.forEach(function (item, ind) {
                if (item.view == c.type) {
                  viewInfo = item;
                }
              });
    
             // Add another contentItems
             layout.root.contentItems[0].contentItems[viewInfo["rootIndex"]].addChild({
              componentName: c.type,
              componentState: { text: temp.componentCache[c.type] },
              title: MT.titleize(c.type),
              type: "component"
            });

            MT.UpdateViewFields(peek(layout.root.contentItems[0].contentItems[viewInfo["rootIndex"]].contentItems));  

          }

      }
    });

  }

  MT.UpdateViewFields = (contentItem, callback) => {

    contentItem.on("itemDestroyed", () => layout.contentItems.splice(layout.contentItems.findIndex(item => item === contentItem), 1));
    console.log('layout cont: ', layout.contentItems);
    layout.contentItems.push(contentItem);

    // Update fields for views
    contentItem.element.find("select.nodeVariables").html(
      "<option>None</option>" +
      session.data.nodeFields.map(field => '<option value="' + field + '">' + MT.titleize(field) + "</option>").join("\n")
    );
    contentItem.element.find("select.linkVariables").html(
      "<option>None</option>" +
      session.data.linkFields.map(field => '<option value="' + field + '">' + MT.titleize(field) + "</option>").join("\n")
    );
    contentItem.element.find("select.mixedVariables").html(
      "<option>None</option>" +
      session.data.linkFields.map(field => '<option value="links-' + field + '">Links ' + MT.titleize(field) + "</option>").join("\n") +
      session.data.nodeFields.map(field => '<option value="nodes-' + field + '">Nodes ' + MT.titleize(field) + "</option>").join("\n")
    );
    contentItem.element.find("select.branch-variables").html(
      "<option>None</option>" +
      ["id", "depth", "height", "length", "value"].map(field => '<option value="' + field + '">' + MT.titleize(field) + "</option>").join("\n")
    );
    contentItem.element.find(".launch-color-options").click(() => {
      $("#style-tab").tab("show");
      setTimeout(() => $("#global-settings-modal").modal("show"), 250);
    });
    contentItem.element.find(".modal-header").on("mousedown", function () {
      let body = $("body");
      let parent = $(this).parent().parent().parent();
      body.on("mousemove", e => {
        parent
          .css("top", parseFloat(parent.css("top")) + e.originalEvent.movementY + "px")
          .css("left", parseFloat(parent.css("left")) + e.originalEvent.movementX + "px");
      });
      body.one("mouseup", () => body.off("mousemove"));
    });
    if (navigator.onLine) contentItem.element.find(".ifOnline").show();
    for (let id in session.style.widgets) {
      let $id = $("#" + id);
      if ($id.length > 0) {
        if (["radio", "checkbox"].includes($id[0].type)) {
          if (session.style.widgets[id]) {
            if ($(contentItem.element[0]).find($id).length > 0) $id.click();   // issue #182
          }
        } else {
          $id.val(session.style.widgets[id]);
        }
      }
    }
    if (callback) {
      callback(contentItem);
    } else {
      return contentItem;
    }
  }

  MT.loadColumn = (component, parent) => {

    if(component.type === "column" && component.content && (component.content[0].type === "row" || component.content[0].type === "column" ||component.content[0].type === "stack")) { 
      // Add column
      parent.addChild({ type: component.type });

    }

    component.content.forEach(c => {

      switch(c.type) {

        case "row":

         // Add child below row 
         peek(parent.contentItems).addChild({ type: c.type });

          c.content.forEach(comp => {
            // Add row children to current parent
            MT.loadLayoutItem(comp, peek(parent.contentItems));
          });

          break;

        case "stack":

         // Add child below row 
         peek(parent.contentItems).addChild({ type: c.type });

          c.content.forEach(comp => {
            // Add stack children to current parent
            MT.loadLayoutItem(comp, peek(parent.contentItems));
          });

          break;

        // If neither, then view should be launched - can have row within a row 
        // type is view 
        default:

          if (!temp.componentCache[c.type]) {
            $.get("components/" + c.type + ".html", response => {
              temp.componentCache[c.type] = response;
              //This MUST NOT be replace by an arrow function!
              layout.registerComponent(c.type, function (container, state) {
                container.getElement().html(state.text);
              });
  
              let viewInfo = {};
  
              // Get view info from layout
              layoutDict.forEach(function (item, ind) {
                if (item.view == c.type) {
                  viewInfo = item;
                }
              });

              console.log('rotttt: ', layout.root.contentItems[0].contentItems[viewInfo["rootIndex"]]);
  
              // Add another contentItems
              layout.root.contentItems[0].contentItems[viewInfo["rootIndex"]].addChild({
                componentName: c.type,
                componentState: { text: temp.componentCache[c.type] },
                title: MT.titleize(c.type),
                type: "component"
              });

              MT.UpdateViewFields(peek(layout.root.contentItems[0].contentItems[viewInfo["rootIndex"]].contentItem));    
          
            });
          } else {
            let viewInfo = {};
  
              // Get view info from layout
              layoutDict.forEach(function (item, ind) {
                if (item.view == c.type) {
                  viewInfo = item;
                }
              });
  
              // Add another contentItems
              layout.root.contentItems[0].contentItems[viewInfo["rootIndex"]].addChild({
                componentName: c.type,
                componentState: { text: temp.componentCache[c.type] },
                title: MT.titleize(c.type),
                type: "component"
              });

            MT.UpdateViewFields(peek(layout.root.contentItems[0].contentItems[viewInfo["rootIndex"]].contentItems));  

          }   

        }
    });
     
  }

  MT.loadStack = (component, parent ) => {

    if(component.type === "stack" && component.content && (component.content[0].type === "row" || component.content[0].type === "column" ||component.content[0].type === "stack")) { 
      // Add column
      parent.addChild({ type: component.type });

    }

    component.content.forEach(c => {

      switch(c.type) {

        case "row":

          // Add child below row 
          peek(parent.contentItems).addChild({ type: c.type });

          c.content.forEach(comp => {
            // Add row children to current parent
            MT.loadLayoutItem(comp, peek(parent.contentItems));
          });

          break;

        case "column":

          // Add child below row 
          peek(parent.contentItems).addChild({ type: c.type });

          c.content.forEach(comp => {
            // Add stack children to current parent
            MT.loadLayoutItem(comp, peek(parent.contentItems));
          });

          break;

        // If neither, then view should be launched - canr have row within a row 
        // type is view 
        default:

          if (!temp.componentCache[c.type]) {
            $.get("components/" + c.type + ".html", response => {
              temp.componentCache[c.type] = response;
              //This MUST NOT be replace by an arrow function!
              layout.registerComponent(c.type, function (container, state) {
                container.getElement().html(state.text);
              });
  
              let viewInfo = {};
  
              // Get view info from layout
              layoutDict.forEach(function (item, ind) {
                if (item.view == c.type) {
                  viewInfo = item;
                }
              });

              console.log('rotttt: ', layout.root.contentItems[0].contentItems[viewInfo["rootIndex"]]);
  
              // Add another contentItems
              layout.root.contentItems[0].contentItems[viewInfo["rootIndex"]].addChild({
                componentName: c.type,
                componentState: { text: temp.componentCache[c.type] },
                title: MT.titleize(c.type),
                type: "component"
              });

              MT.UpdateViewFields(peek(layout.root.contentItems[0].contentItems[viewInfo["rootIndex"]].contentItem));    
          
            });
          } else {
            let viewInfo = {};
  
              // Get view info from layout
              layoutDict.forEach(function (item, ind) {
                if (item.view == c.type) {
                  viewInfo = item;
                }
              });
  
              // Add another contentItems
              layout.root.contentItems[0].contentItems[viewInfo["rootIndex"]].addChild({
                componentName: c.type,
                componentState: { text: temp.componentCache[c.type] },
                title: MT.titleize(c.type),
                type: "component"
              });

            MT.UpdateViewFields(peek(layout.root.contentItems[0].contentItems[viewInfo["rootIndex"]].contentItems));  

          }
      }

    });

  }

  // Count items and create object with properties for view location within layout
  MT.countContentItems = (contentItems, index, depth) => {
    let count = 0;
    contentItems.forEach((item, ind) => {
      if (item.type !== "row" && item.type !== "column" && item.type !== "stack") {

        layoutDict.push({
          view: item.type,
          rootIndex: index,
          contentIndex: contInd,
          depth: depth
        });

        count++;
        contInd++;

      } else {
        if(item.content) {

          // need to go deeper to retrieve view, so increase depth
          if(item.content[0].type !== "row" && item.content[0].type !== "column" && item.content[0].type !== "stack") {
            depth++;
          }

          count += MT.countContentItems(item.content, index, depth);
          
        } else {

          layoutDict.push({
            view: item.type,
            rootIndex: index,
            contentIndex: contInd, 
            depth : depth
          });

          contInd++;
          count++;
        }
      }
    });
    
    return count;
  };


  MT.loadLayout = (component, parent) => {

    if (!parent) {
      parent = layout.root;
    }

    console.log('component: ', component);

    switch(component.type) {

      case "row":

      if(component.content && (component.content[0].type !== "row" && component.content[0].type !== "column" && component.content[0].type !== "stack")) {
        if (["stack", "row", "column"].includes(component.type)) {
          parent.addChild({ type: component.type });
          component.content.forEach(c => MT.loadLayout(c, peek(parent.contentItems)));
        } else {
          MT.launchView(component.type);
        }

      } else {
        component.content.forEach( (c, index) => {
          // adding number of views for each content 
          contInd = 0;
          MT.countContentItems(c.content, index, 0);
        });

        MT.loadRow(component, parent);
      }
        

        break;

      case "stack":

      if (["stack", "row", "column"].includes(component.type)) {
        parent.addChild({ type: component.type });
        component.content.forEach(c => MT.loadLayout(c, peek(parent.contentItems)));
      } else {
        MT.launchView(component.type);
      }

        break;

      case "column":

        if(component.content && (component.content[0].type !== "row" && component.content[0].type !== "column" && component.content[0].type !== "stack")) {
          if (["stack", "row", "column"].includes(component.type)) {
            parent.addChild({ type: component.type });
            component.content.forEach(c => MT.loadLayout(c, peek(parent.contentItems)));
          } else {
            MT.launchView(component.type);
          }
        } else {
          component.content.forEach( (c, index) => {
            // adding number of views for each content 
            contInd = 0;
            MT.countContentItems(c.content, index, 0);
      
          });
  
          MT.loadColumn(component, parent);
  
        }
        break;

      // If neither, then view should be launched - canr have row within a row 
      // type is view 
      default:
        MT.launchView(component.type);
      
    }

  };

  MT.launchMultipleViews = (views, callback) => {

    let contentItem = layout.contentItems.find(item =>
      item.componentName === view
    );

    if (contentItem) {

      contentItem.parent.setActiveContentItem(contentItem);

    // Create  view
    } else {

      contentItem = peek(layout.root.contentItems[0].contentItems[0]);

    }

    if (!temp.componentCache[c.type]) {
      $.get("components/" + c.type + ".html", response => {
        temp.componentCache[c.type] = response;
        //This MUST NOT be replace by an arrow function!
        layout.registerComponent(c.type, function (container, state) {
          container.getElement().html(state.text);
        });

        let viewInfo = {};

        // Get view info from layout
        layoutDict.forEach(function (item, ind) {
          if (item.view == c.type) {
            viewInfo = item;
          }
        });

        // Add another contentItems
        layout.root.contentItems[0].contentItems[viewInfo["rootIndex"]].addChild({
          componentName: c.type,
          componentState: { text: temp.componentCache[c.type] },
          title: MT.titleize(c.type),
          type: "component"
        });

    
      });
    } else {

      let viewInfo = {};

        // Get view info from layout
        layoutDict.forEach(function (item, ind) {
          if (item.view == c.type) {
            viewInfo = item;
          }
        });

       // Add another contentItems
       layout.root.contentItems[0].contentItems[viewInfo["rootIndex"]].addChild({
        componentName: c.type,
        componentState: { text: temp.componentCache[c.type] },
        title: MT.titleize(c.type),
        type: "component"
      });
    }

  }

  MT.launchView = (view, callback) => {

    if (!temp.componentCache[view]) {
      $.get("components/" + view + ".html", response => {
        temp.componentCache[view] = response;
        //This MUST NOT be replace by an arrow function!
        layout.registerComponent(view, function (container, state) {
          container.getElement().html(state.text);
        });
        if (callback) {
          MT.launchView(view, callback);
        } else {
          return MT.launchView(view);
        }
      });
    } else {
      // Check if view matches the content type
      let contentItem = layout.contentItems.find(item =>
        item.componentName === view
      );

      // If view exists, set active
      if (contentItem) {

        contentItem.parent.setActiveContentItem(contentItem);

        // Create  view
      } else if (!contentItem) {
        if (layout.root.contentItems[0] === undefined) {
          layout.root.addChild({ type: 'stack' });
        }
        let lastStack = peek(layout.root.contentItems[0].getItemsByType("stack"));
        if (!lastStack) lastStack = layout.root.contentItems[0];
        
          lastStack.addChild({
            componentName: view,
            componentState: { text: temp.componentCache[view] },
            title: MT.titleize(view),
            type: "component"
          });
          contentItem = peek(lastStack.contentItems);
          contentItem.on("itemDestroyed", () => layout.contentItems.splice(layout.contentItems.findIndex(item => item === contentItem), 1));
          layout.contentItems.push(contentItem);

      }

      // Update fields for views
      contentItem.element.find("select.nodeVariables").html(
        "<option>None</option>" +
        session.data.nodeFields.map(field => '<option value="' + field + '">' + MT.titleize(field) + "</option>").join("\n")
      );
      contentItem.element.find("select.linkVariables").html(
        "<option>None</option>" +
        session.data.linkFields.map(field => '<option value="' + field + '">' + MT.titleize(field) + "</option>").join("\n")
      );
      contentItem.element.find("select.mixedVariables").html(
        "<option>None</option>" +
        session.data.linkFields.map(field => '<option value="links-' + field + '">Links ' + MT.titleize(field) + "</option>").join("\n") +
        session.data.nodeFields.map(field => '<option value="nodes-' + field + '">Nodes ' + MT.titleize(field) + "</option>").join("\n")
      );
      contentItem.element.find("select.branch-variables").html(
        "<option>None</option>" +
        ["id", "depth", "height", "length", "value"].map(field => '<option value="' + field + '">' + MT.titleize(field) + "</option>").join("\n")
      );
      contentItem.element.find(".launch-color-options").click(() => {
        $("#style-tab").tab("show");
        setTimeout(() => $("#global-settings-modal").modal("show"), 250);
      });
      contentItem.element.find(".modal-header").on("mousedown", function () {
        let body = $("body");
        let parent = $(this).parent().parent().parent();
        body.on("mousemove", e => {
          parent
            .css("top", parseFloat(parent.css("top")) + e.originalEvent.movementY + "px")
            .css("left", parseFloat(parent.css("left")) + e.originalEvent.movementX + "px");
        });
        body.one("mouseup", () => body.off("mousemove"));
      });
      if (navigator.onLine) contentItem.element.find(".ifOnline").show();
      for (let id in session.style.widgets) {
        let $id = $("#" + id);
        if ($id.length > 0) {
          if (["radio", "checkbox"].includes($id[0].type)) {
            if (session.style.widgets[id]) {
              if ($(contentItem.element[0]).find($id).length > 0) $id.click();   // issue #182
            }
          } else {
            $id.val(session.style.widgets[id]);
          }
        }
      }
      if (callback) {
        callback(contentItem);
      } else {
        return contentItem;
      }
    }
  };

  MT.cacheLayout = contentItem => {
    if (["stack", "row", "column"].includes(contentItem.type)) {
      return {
        type: contentItem.type,
        content: contentItem.contentItems.map(MT.cacheLayout)
      };
    }
    return { type: contentItem.componentName };
  };


  MT.unparseSVG = svgNode => {
    svgNode.setAttribute("xlink", "http://www.w3.org/1999/xlink");
    let selectorTextArr = [];

    // Add Parent element Id and Classes to the list
    selectorTextArr.push("#" + svgNode.id);
    let nClasses = svgNode.classList.length;
    for (let c = 0; c < nClasses; c++) {
      if (!("." + svgNode.classList[c]).includes(selectorTextArr)) {
        selectorTextArr.push("." + svgNode.classList[c]);
      }
    }

    // Add Children element Ids and Classes to the list
    let nodes = svgNode.getElementsByTagName("*");
    let nNodes = nodes.length;
    for (let i = 0; i < nNodes; i++) {
      let id = nodes[i]._id;
      if (!("#" + id).includes(selectorTextArr)) {
        selectorTextArr.push("#" + id);
      }
      let classes = nodes[i].classList;
      for (let d = 0; d < classes.length; d++) {
        if (!("." + classes[d]).includes(selectorTextArr)) {
          selectorTextArr.push("." + classes[d]);
        }
      }
    }

    // Extract CSS Rules
    let extractedCSSText = "";
    let nStylesheets = document.styleSheets.length;
    for (let j = 0; j < nStylesheets; j++) {
      let s = document.styleSheets[j];
      try {
        if (!s.cssRules) continue;
      } catch (e) {
        if (e.name !== "SecurityError") throw e; // for Firefox
        continue;
      }
      let cssRules = s.cssRules;
      let nRules = cssRules.length;
      for (let r = 0; r < nRules; r++) {
        let rule = cssRules[r];
        if (!rule.selectorText) continue;
        if (rule.selectorText.includes(selectorTextArr)) {
          extractedCSSText += rule.cssText;
        }
        if (rule.selectorText == 'body') {  // issue #110
          extractedCSSText += rule.cssText.replace("body", "text");;
        }
        // if (rule.selectorText == '.nodes path.selected') {  // issue #156
        //   extractedCSSText += rule.cssText;
        // }
      }
    }

    extractedCSSText += ".nodes path.selected { stroke: rgb(255, 131, 0); stroke-width: 4px; }";  // issue #201

    let styleElement = document.createElement("style");
    styleElement.setAttribute("type", "text/css");
    styleElement.innerHTML = extractedCSSText;
    let refNode = svgNode.hasChildNodes() ? svgNode.children[0] : null;
    svgNode.insertBefore(styleElement, refNode);
    let serializer = new XMLSerializer();
    return serializer.serializeToString(svgNode);
  };

  MT.exportHIVTRACE = () => {
    let links = session.data.links.filter(l => l.visible);
    let geneticLinks = links.filter(l => l.origin.includes("Genetic Distance"));
    let sequences = new Set(
      geneticLinks.map(l => l.source).concat(
        geneticLinks.map(l => l.target))
    ).size;
    let pas = {};
    session.data.nodes.forEach(d => {
      Object.keys(d).forEach(key => {
        if (pas[key]) return;
        pas[key] = {
          label: key,
          type: MT.titleize(typeof d[key])
        };
      });
    });
    return JSON.stringify(
      {
        trace_results: {
          "Cluster sizes": session.data.clusters.map(c => c.size),
          Degrees: {
            Distribution: [],
            Model: "Waring",
            fitted: [],
            rho: 0,
            "rho CI": [-1, 1]
          },
          "Directed Edges": {
            Count: 0,
            "Reasons for unresolved directions": {
              "Missing dates": links.length
            }
          },
          "Edge Stages": {},
          Edges: links.map(l => ({
            attributes: ["BULK"],
            directed: false,
            length: l[session.style.widgets["link-sort-variable"]],
            removed: false,
            sequences: [l.source, l.target],
            source: session.data.nodes.findIndex(d => d._id == l.source),
            support: 0,
            target: session.data.nodes.findIndex(d => d._id == l.target)
          })),
          "HIV Stages": {
            "A-1": 0,
            "A-2": 0,
            "A-3": 0,
            Chronic: session.data.nodes.length,
            "E-1": 0,
            "E-2": 0,
            "E-3": 0
          },
          "Multiple sequences": {
            "Followup, days": null,
            "Subjects with": 0
          },
          "Network Summary": {
            Clusters: session.data.clusters.length,
            Edges: links.length,
            Nodes: session.data.nodes.length,
            "Sequences used to make links": sequences
          },
          Nodes: session.data.nodes.map(d => ({
            attributes: [],
            baseline: null,
            cluster: d.cluster,
            edi: null,
            id: d._id,
            patient_attributes: d
          })),
          patient_attribute_schema: pas,
          Settings: {
            "contaminant-ids": [],
            contaminants: "remove",
            "edge-filtering": "remove",
            threshold: session.style.widgets["link-threshold"]
          }
        }
      },
      null,
      2
    );
  };

  MT.size = thing => {
    if (!thing) thing = session;
    return (JSON.stringify(thing).length / 1024 / 1024).toLocaleString() + 'MB';
  };

  MT.watermark = "img/favicon.svg"
  MT.HXB2 = "TGGAAGGGCTAATTCACTCCCAACGAAGACAAGATATCCTTGATCTGTGGATCTACCACACACAAGGCTACTTCCCTGATTAGCAGAACTACACACCAGGGCCAGGGATCAGATATCCACTGACCTTTGGATGGTGCTACAAGCTAGTACCAGTTGAGCCAGAGAAGTTAGAAGAAGCCAACAAAGGAGAGAACACCAGCTTGTTACACCCTGTGAGCCTGCATGGAATGGATGACCCGGAGAGAGAAGTGTTAGAGTGGAGGTTTGACAGCCGCCTAGCATTTCATCACATGGCCCGAGAGCTGCATCCGGAGTACTTCAAGAACTGCTGACATCGAGCTTGCTACAAGGGACTTTCCGCTGGGGACTTTCCAGGGAGGCGTGGCCTGGGCGGGACTGGGGAGTGGCGAGCCCTCAGATCCTGCATATAAGCAGCTGCTTTTTGCCTGTACTGGGTCTCTCTGGTTAGACCAGATCTGAGCCTGGGAGCTCTCTGGCTAACTAGGGAACCCACTGCTTAAGCCTCAATAAAGCTTGCCTTGAGTGCTTCAAGTAGTGTGTGCCCGTCTGTTGTGTGACTCTGGTAACTAGAGATCCCTCAGACCCTTTTAGTCAGTGTGGAAAATCTCTAGCAGTGGCGCCCGAACAGGGACCTGAAAGCGAAAGGGAAACCAGAGGAGCTCTCTCGACGCAGGACTCGGCTTGCTGAAGCGCGCACGGCAAGAGGCGAGGGGCGGCGACTGGTGAGTACGCCAAAAATTTTGACTAGCGGAGGCTAGAAGGAGAGAGATGGGTGCGAGAGCGTCAGTATTAAGCGGGGGAGAATTAGATCGATGGGAAAAAATTCGGTTAAGGCCAGGGGGAAAGAAAAAATATAAATTAAAACATATAGTATGGGCAAGCAGGGAGCTAGAACGATTCGCAGTTAATCCTGGCCTGTTAGAAACATCAGAAGGCTGTAGACAAATACTGGGACAGCTACAACCATCCCTTCAGACAGGATCAGAAGAACTTAGATCATTATATAATACAGTAGCAACCCTCTATTGTGTGCATCAAAGGATAGAGATAAAAGACACCAAGGAAGCTTTAGACAAGATAGAGGAAGAGCAAAACAAAAGTAAGAAAAAAGCACAGCAAGCAGCAGCTGACACAGGACACAGCAATCAGGTCAGCCAAAATTACCCTATAGTGCAGAACATCCAGGGGCAAATGGTACATCAGGCCATATCACCTAGAACTTTAAATGCATGGGTAAAAGTAGTAGAAGAGAAGGCTTTCAGCCCAGAAGTGATACCCATGTTTTCAGCATTATCAGAAGGAGCCACCCCACAAGATTTAAACACCATGCTAAACACAGTGGGGGGACATCAAGCAGCCATGCAAATGTTAAAAGAGACCATCAATGAGGAAGCTGCAGAATGGGATAGAGTGCATCCAGTGCATGCAGGGCCTATTGCACCAGGCCAGATGAGAGAACCAAGGGGAAGTGACATAGCAGGAACTACTAGTACCCTTCAGGAACAAATAGGATGGATGACAAATAATCCACCTATCCCAGTAGGAGAAATTTATAAAAGATGGATAATCCTGGGATTAAATAAAATAGTAAGAATGTATAGCCCTACCAGCATTCTGGACATAAGACAAGGACCAAAGGAACCCTTTAGAGACTATGTAGACCGGTTCTATAAAACTCTAAGAGCCGAGCAAGCTTCACAGGAGGTAAAAAATTGGATGACAGAAACCTTGTTGGTCCAAAATGCGAACCCAGATTGTAAGACTATTTTAAAAGCATTGGGACCAGCGGCTACACTAGAAGAAATGATGACAGCATGTCAGGGAGTAGGAGGACCCGGCCATAAGGCAAGAGTTTTGGCTGAAGCAATGAGCCAAGTAACAAATTCAGCTACCATAATGATGCAGAGAGGCAATTTTAGGAACCAAAGAAAGATTGTTAAGTGTTTCAATTGTGGCAAAGAAGGGCACACAGCCAGAAATTGCAGGGCCCCTAGGAAAAAGGGCTGTTGGAAATGTGGAAAGGAAGGACACCAAATGAAAGATTGTACTGAGAGACAGGCTAATTTTTTAGGGAAGATCTGGCCTTCCTACAAGGGAAGGCCAGGGAATTTTCTTCAGAGCAGACCAGAGCCAACAGCCCCACCAGAAGAGAGCTTCAGGTCTGGGGTAGAGACAACAACTCCCCCTCAGAAGCAGGAGCCGATAGACAAGGAACTGTATCCTTTAACTTCCCTCAGGTCACTCTTTGGCAACGACCCCTCGTCACAATAAAGATAGGGGGGCAACTAAAGGAAGCTCTATTAGATACAGGAGCAGATGATACAGTATTAGAAGAAATGAGTTTGCCAGGAAGATGGAAACCAAAAATGATAGGGGGAATTGGAGGTTTTATCAAAGTAAGACAGTATGATCAGATACTCATAGAAATCTGTGGACATAAAGCTATAGGTACAGTATTAGTAGGACCTACACCTGTCAACATAATTGGAAGAAATCTGTTGACTCAGATTGGTTGCACTTTAAATTTTCCCATTAGCCCTATTGAGACTGTACCAGTAAAATTAAAGCCAGGAATGGATGGCCCAAAAGTTAAACAATGGCCATTGACAGAAGAAAAAATAAAAGCATTAGTAGAAATTTGTACAGAGATGGAAAAGGAAGGGAAAATTTCAAAAATTGGGCCTGAAAATCCATACAATACTCCAGTATTTGCCATAAAGAAAAAAGACAGTACTAAATGGAGAAAATTAGTAGATTTCAGAGAACTTAATAAGAGAACTCAAGACTTCTGGGAAGTTCAATTAGGAATACCACATCCCGCAGGGTTAAAAAAGAAAAAATCAGTAACAGTACTGGATGTGGGTGATGCATATTTTTCAGTTCCCTTAGATGAAGACTTCAGGAAGTATACTGCATTTACCATACCTAGTATAAACAATGAGACACCAGGGATTAGATATCAGTACAATGTGCTTCCACAGGGATGGAAAGGATCACCAGCAATATTCCAAAGTAGCATGACAAAAATCTTAGAGCCTTTTAGAAAACAAAATCCAGACATAGTTATCTATCAATACATGGATGATTTGTATGTAGGATCTGACTTAGAAATAGGGCAGCATAGAACAAAAATAGAGGAGCTGAGACAACATCTGTTGAGGTGGGGACTTACCACACCAGACAAAAAACATCAGAAAGAACCTCCATTCCTTTGGATGGGTTATGAACTCCATCCTGATAAATGGACAGTACAGCCTATAGTGCTGCCAGAAAAAGACAGCTGGACTGTCAATGACATACAGAAGTTAGTGGGGAAATTGAATTGGGCAAGTCAGATTTACCCAGGGATTAAAGTAAGGCAATTATGTAAACTCCTTAGAGGAACCAAAGCACTAACAGAAGTAATACCACTAACAGAAGAAGCAGAGCTAGAACTGGCAGAAAACAGAGAGATTCTAAAAGAACCAGTACATGGAGTGTATTATGACCCATCAAAAGACTTAATAGCAGAAATACAGAAGCAGGGGCAAGGCCAATGGACATATCAAATTTATCAAGAGCCATTTAAAAATCTGAAAACAGGAAAATATGCAAGAATGAGGGGTGCCCACACTAATGATGTAAAACAATTAACAGAGGCAGTGCAAAAAATAACCACAGAAAGCATAGTAATATGGGGAAAGACTCCTAAATTTAAACTGCCCATACAAAAGGAAACATGGGAAACATGGTGGACAGAGTATTGGCAAGCCACCTGGATTCCTGAGTGGGAGTTTGTTAATACCCCTCCCTTAGTGAAATTATGGTACCAGTTAGAGAAAGAACCCATAGTAGGAGCAGAAACCTTCTATGTAGATGGGGCAGCTAACAGGGAGACTAAATTAGGAAAAGCAGGATATGTTACTAATAGAGGAAGACAAAAAGTTGTCACCCTAACTGACACAACAAATCAGAAGACTGAGTTACAAGCAATTTATCTAGCTTTGCAGGATTCGGGATTAGAAGTAAACATAGTAACAGACTCACAATATGCATTAGGAATCATTCAAGCACAACCAGATCAAAGTGAATCAGAGTTAGTCAATCAAATAATAGAGCAGTTAATAAAAAAGGAAAAGGTCTATCTGGCATGGGTACCAGCACACAAAGGAATTGGAGGAAATGAACAAGTAGATAAATTAGTCAGTGCTGGAATCAGGAAAGTACTATTTTTAGATGGAATAGATAAGGCCCAAGATGAACATGAGAAATATCACAGTAATTGGAGAGCAATGGCTAGTGATTTTAACCTGCCACCTGTAGTAGCAAAAGAAATAGTAGCCAGCTGTGATAAATGTCAGCTAAAAGGAGAAGCCATGCATGGACAAGTAGACTGTAGTCCAGGAATATGGCAACTAGATTGTACACATTTAGAAGGAAAAGTTATCCTGGTAGCAGTTCATGTAGCCAGTGGATATATAGAAGCAGAAGTTATTCCAGCAGAAACAGGGCAGGAAACAGCATATTTTCTTTTAAAATTAGCAGGAAGATGGCCAGTAAAAACAATACATACTGACAATGGCAGCAATTTCACCGGTGCTACGGTTAGGGCCGCCTGTTGGTGGGCGGGAATCAAGCAGGAATTTGGAATTCCCTACAATCCCCAAAGTCAAGGAGTAGTAGAATCTATGAATAAAGAATTAAAGAAAATTATAGGACAGGTAAGAGATCAGGCTGAACATCTTAAGACAGCAGTACAAATGGCAGTATTCATCCACAATTTTAAAAGAAAAGGGGGGATTGGGGGGTACAGTGCAGGGGAAAGAATAGTAGACATAATAGCAACAGACATACAAACTAAAGAATTACAAAAACAAATTACAAAAATTCAAAATTTTCGGGTTTATTACAGGGACAGCAGAAATCCACTTTGGAAAGGACCAGCAAAGCTCCTCTGGAAAGGTGAAGGGGCAGTAGTAATACAAGATAATAGTGACATAAAAGTAGTGCCAAGAAGAAAAGCAAAGATCATTAGGGATTATGGAAAACAGATGGCAGGTGATGATTGTGTGGCAAGTAGACAGGATGAGGATTAGAACATGGAAAAGTTTAGTAAAACACCATATGTATGTTTCAGGGAAAGCTAGGGGATGGTTTTATAGACATCACTATGAAAGCCCTCATCCAAGAATAAGTTCAGAAGTACACATCCCACTAGGGGATGCTAGATTGGTAATAACAACATATTGGGGTCTGCATACAGGAGAAAGAGACTGGCATTTGGGTCAGGGAGTCTCCATAGAATGGAGGAAAAAGAGATATAGCACACAAGTAGACCCTGAACTAGCAGACCAACTAATTCATCTGTATTACTTTGACTGTTTTTCAGACTCTGCTATAAGAAAGGCCTTATTAGGACACATAGTTAGCCCTAGGTGTGAATATCAAGCAGGACATAACAAGGTAGGATCTCTACAATACTTGGCACTAGCAGCATTAATAACACCAAAAAAGATAAAGCCACCTTTGCCTAGTGTTACGAAACTGACAGAGGATAGATGGAACAAGCCCCAGAAGACCAAGGGCCACAGAGGGAGCCACACAATGAATGGACACTAGAGCTTTTAGAGGAGCTTAAGAATGAAGCTGTTAGACATTTTCCTAGGATTTGGCTCCATGGCTTAGGGCAACATATCTATGAAACTTATGGGGATACTTGGGCAGGAGTGGAAGCCATAATAAGAATTCTGCAACAACTGCTGTTTATCCATTTTCAGAATTGGGTGTCGACATAGCAGAATAGGCGTTACTCGACAGAGGAGAGCAAGAAATGGAGCCAGTAGATCCTAGACTAGAGCCCTGGAAGCATCCAGGAAGTCAGCCTAAAACTGCTTGTACCAATTGCTATTGTAAAAAGTGTTGCTTTCATTGCCAAGTTTGTTTCATAACAAAAGCCTTAGGCATCTCCTATGGCAGGAAGAAGCGGAGACAGCGACGAAGAGCTCATCAGAACAGTCAGACTCATCAAGCTTCTCTATCAAAGCAGTAAGTAGTACATGTAACGCAACCTATACCAATAGTAGCAATAGTAGCATTAGTAGTAGCAATAATAATAGCAATAGTTGTGTGGTCCATAGTAATCATAGAATATAGGAAAATATTAAGACAAAGAAAAATAGACAGGTTAATTGATAGACTAATAGAAAGAGCAGAAGACAGTGGCAATGAGAGTGAAGGAGAAATATCAGCACTTGTGGAGATGGGGGTGGAGATGGGGCACCATGCTCCTTGGGATGTTGATGATCTGTAGTGCTACAGAAAAATTGTGGGTCACAGTCTATTATGGGGTACCTGTGTGGAAGGAAGCAACCACCACTCTATTTTGTGCATCAGATGCTAAAGCATATGATACAGAGGTACATAATGTTTGGGCCACACATGCCTGTGTACCCACAGACCCCAACCCACAAGAAGTAGTATTGGTAAATGTGACAGAAAATTTTAACATGTGGAAAAATGACATGGTAGAACAGATGCATGAGGATATAATCAGTTTATGGGATCAAAGCCTAAAGCCATGTGTAAAATTAACCCCACTCTGTGTTAGTTTAAAGTGCACTGATTTGAAGAATGATACTAATACCAATAGTAGTAGCGGGAGAATGATAATGGAGAAAGGAGAGATAAAAAACTGCTCTTTCAATATCAGCACAAGCATAAGAGGTAAGGTGCAGAAAGAATATGCATTTTTTTATAAACTTGATATAATACCAATAGATAATGATACTACCAGCTATAAGTTGACAAGTTGTAACACCTCAGTCATTACACAGGCCTGTCCAAAGGTATCCTTTGAGCCAATTCCCATACATTATTGTGCCCCGGCTGGTTTTGCGATTCTAAAATGTAATAATAAGACGTTCAATGGAACAGGACCATGTACAAATGTCAGCACAGTACAATGTACACATGGAATTAGGCCAGTAGTATCAACTCAACTGCTGTTAAATGGCAGTCTAGCAGAAGAAGAGGTAGTAATTAGATCTGTCAATTTCACGGACAATGCTAAAACCATAATAGTACAGCTGAACACATCTGTAGAAATTAATTGTACAAGACCCAACAACAATACAAGAAAAAGAATCCGTATCCAGAGAGGACCAGGGAGAGCATTTGTTACAATAGGAAAAATAGGAAATATGAGACAAGCACATTGTAACATTAGTAGAGCAAAATGGAATAACACTTTAAAACAGATAGCTAGCAAATTAAGAGAACAATTTGGAAATAATAAAACAATAATCTTTAAGCAATCCTCAGGAGGGGACCCAGAAATTGTAACGCACAGTTTTAATTGTGGAGGGGAATTTTTCTACTGTAATTCAACACAACTGTTTAATAGTACTTGGTTTAATAGTACTTGGAGTACTGAAGGGTCAAATAACACTGAAGGAAGTGACACAATCACCCTCCCATGCAGAATAAAACAAATTATAAACATGTGGCAGAAAGTAGGAAAAGCAATGTATGCCCCTCCCATCAGTGGACAAATTAGATGTTCATCAAATATTACAGGGCTGCTATTAACAAGAGATGGTGGTAATAGCAACAATGAGTCCGAGATCTTCAGACCTGGAGGAGGAGATATGAGGGACAATTGGAGAAGTGAATTATATAAATATAAAGTAGTAAAAATTGAACCATTAGGAGTAGCACCCACCAAGGCAAAGAGAAGAGTGGTGCAGAGAGAAAAAAGAGCAGTGGGAATAGGAGCTTTGTTCCTTGGGTTCTTGGGAGCAGCAGGAAGCACTATGGGCGCAGCCTCAATGACGCTGACGGTACAGGCCAGACAATTATTGTCTGGTATAGTGCAGCAGCAGAACAATTTGCTGAGGGCTATTGAGGCGCAACAGCATCTGTTGCAACTCACAGTCTGGGGCATCAAGCAGCTCCAGGCAAGAATCCTGGCTGTGGAAAGATACCTAAAGGATCAACAGCTCCTGGGGATTTGGGGTTGCTCTGGAAAACTCATTTGCACCACTGCTGTGCCTTGGAATGCTAGTTGGAGTAATAAATCTCTGGAACAGATTTGGAATCACACGACCTGGATGGAGTGGGACAGAGAAATTAACAATTACACAAGCTTAATACACTCCTTAATTGAAGAATCGCAAAACCAGCAAGAAAAGAATGAACAAGAATTATTGGAATTAGATAAATGGGCAAGTTTGTGGAATTGGTTTAACATAACAAATTGGCTGTGGTATATAAAATTATTCATAATGATAGTAGGAGGCTTGGTAGGTTTAAGAATAGTTTTTGCTGTACTTTCTATAGTGAATAGAGTTAGGCAGGGATATTCACCATTATCGTTTCAGACCCACCTCCCAACCCCGAGGGGACCCGACAGGCCCGAAGGAATAGAAGAAGAAGGTGGAGAGAGAGACAGAGACAGATCCATTCGATTAGTGAACGGATCCTTGGCACTTATCTGGGACGATCTGCGGAGCCTGTGCCTCTTCAGCTACCACCGCTTGAGAGACTTACTCTTGATTGTAACGAGGATTGTGGAACTTCTGGGACGCAGGGGGTGGGAAGCCCTCAAATATTGGTGGAATCTCCTACAGTATTGGAGTCAGGAACTAAAGAATAGTGCTGTTAGCTTGCTCAATGCCACAGCCATAGCAGTAGCTGAGGGGACAGATAGGGTTATAGAAGTAGTACAAGGAGCTTGTAGAGCTATTCGCCACATACCTAGAAGAATAAGACAGGGCTTGGAAAGGATTTTGCTATAAGATGGGTGGCAAGTGGTCAAAAAGTAGTGTGATTGGATGGCCTACTGTAAGGGAAAGAATGAGACGAGCTGAGCCAGCAGCAGATAGGGTGGGAGCAGCATCTCGAGACCTGGAAAAACATGGAGCAATCACAAGTAGCAATACAGCAGCTACCAATGCTGCTTGTGCCTGGCTAGAAGCACAAGAGGAGGAGGAGGTGGGTTTTCCAGTCACACCTCAGGTACCTTTAAGACCAATGACTTACAAGGCAGCTGTAGATCTTAGCCACTTTTTAAAAGAAAAGGGGGGACTGGAAGGGCTAATTCACTCCCAAAGAAGACAAGATATCCTTGATCTGTGGATCTACCACACACAAGGCTACTTCCCTGATTAGCAGAACTACACACCAGGGCCAGGGGTCAGATATCCACTGACCTTTGGATGGTGCTACAAGCTAGTACCAGTTGAGCCAGATAAGATAGAAGAGGCCAATAAAGGAGAGAACACCAGCTTGTTACACCCTGTGAGCCTGCATGGGATGGATGACCCGGAGAGAGAAGTGTTAGAGTGGAGGTTTGACAGCCGCCTAGCATTTCATCACGTGGCCCGAGAGCTGCATCCGGAGTACTTCAAGAACTGCTGACATCGAGCTTGCTACAAGGGACTTTCCGCTGGGGACTTTCCAGGGAGGCGTGGCCTGGGCGGGACTGGGGAGTGGCGAGCCCTCAGATCCTGCATATAAGCAGCTGCTTTTTGCCTGTACTGGGTCTCTCTGGTTAGACCAGATCTGAGCCTGGGAGCTCTCTGGCTAACTAGGGAACCCACTGCTTAAGCCTCAATAAAGCTTGCCTTGAGTGCTTCAAGTAGTGTGTGCCCGTCTGTTGTGTGACTCTGGTAACTAGAGATCCCTCAGACCCTTTTAGTCAGTGTGGAAAATCTCTAGCA";

  self.MT = MT;
})(self ? self : window);
