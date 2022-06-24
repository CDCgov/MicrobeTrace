$(function() {
  "use strict";

  let linkKeyboardPositionEnabled = false;
  let nodeKeyboardPositionEnabled = false;
  let statsKeyboardPositionEnabled = false;

  if (navigator.userAgent.indexOf("MSIE") >= 0 || navigator.appName.indexOf("Microsoft Internet Explorer") >= 0) {
    $("#ie-warning").show();
    throw new Error("MicrobeTrace does not work on Internet Explorer.");
  } else {
    $("#ie-warning").remove();
  }

  // Before anything else gets done, ask the user to accept the legal agreement
  localforage.getItem("licenseAccepted").then(accepted => {
    if (!accepted) {
      $("#acceptAgreement").on("click", () => {
        localforage.setItem("licenseAccepted", new Date());
      });
      $("#licenseAgreement").modal({
        backdrop: "static",
        keyboard: false
      });
    }  
  })

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(error => {
      console.error("Service Worker Registration failed with " + error);
    });
  }

  self.temp = MT.tempSkeleton();
  self.session = MT.sessionSkeleton();
  self.layout = new GoldenLayout({
    settings: {
      selectionEnabled: true,
      showPopoutIcon: false
    },
    content: [
      {
        type: "stack",
        content: []
      }
    ]
  }, $("#main-panel"));

  layout.init();

  layout.contentItems = [];

  self.$window = $(window);

  $(".modal-header").on("mousedown", function(){
    let body = $("body");
    let parent = $(this).parent().parent().parent();
    body.on("mousemove", e => {
      parent
        .css("top", parseFloat(parent.css("top" )) + e.originalEvent.movementY + "px")
        .css("left",parseFloat(parent.css("left")) + e.originalEvent.movementX + "px");
    });
    body.on("mouseup", () => body.off("mousemove").off("mouseup"));
  });

  // Let's set up the Nav Bar
  $("#stash-data").on("click", () => {
    localforage.setItem(
      "stash-" + Date.now() + "-" + $("#stash-name").val(),
      JSON.stringify(session)
    ).then(() => alertify.success("Session Stashed Successfully!"));
  });

  let table = new Tabulator("#recall-stashes-available", {
    height: "100%",
    layout: "fitColumns",
    selectable: 1,
    columns: [
      { title: "Name", field: "name" },
      { title: "Date", field: "date", align: "right", sorter: "date" }
    ]
  });

  function updateTable() {
    let rows = [];
    localforage.keys().then(keys => {
      keys.forEach(k => {
        if (k.substring(0, 5) !== "stash") return;
        rows.push({
          fullname: k,
          name: k.substring(20),
          date: new Date(parseFloat(k.substring(6, 19))).toISOString()
        });
      });
      table.setData(rows);
    });
  }

  $("#RecallDataTab").on("click", e => {
    e.preventDefault();
    updateTable();
    $("#session-recall-modal").modal("show");
  });

  $("#recall-delete-stash").on("click", () => {
    let key = table.getSelectedData()[0].fullname;
    localforage.removeItem(key).then(() => {
      updateTable();
      alertify.success("That stash has been deleted.");
    });
  });

  $("#recall-load-stash").on("click", () => {
    let key = table.getSelectedData()[0].fullname;
    localforage.getItem(key).then(json => {
      MT.applySession(JSON.parse(json));
      $("#session-recall-modal").modal("hide");
    });
  });

  $("#save-data").on("click", () => {
    let zip = new JSZip();
    let name = $("#save-file-name").val();
    let format = $("#save-file-format").val();
    let data;
    if (format == "style") {
      data = JSON.stringify(session.style);
    } else if (format == "hivtrace") {
      data = MT.exportHIVTRACE();
    } else {

      if ($('#save-file-cluster').is(":checked")){
        // it is checked

        let clusterNodeList = [];
        let clusterLinkList = [];
        let singletonNodeList = [];
        let dyadNodeList = [];
        let dyadEdgeList = [];
        let nodes = session.data.nodes;
        let links = session.data.links;

        session.data.clusters.forEach(cluster => {

          let clusterNodes = nodes.filter(node => node.cluster === cluster.id);

          let clusterLinks = links.filter(link => link.cluster === cluster.id);

          // We have a singleton - all singletons go into one file
          if(clusterNodes.length == 1){
            singletonNodeList.push(clusterNodes[0]);
          // We have a dyad - all dyads go into one file
          } else if (clusterNodes.length == 2) {
            // Add both nodes
            dyadNodeList.push(clusterNodes[0]);
            dyadNodeList.push(clusterNodes[1]);
            // Add the single link
            dyadEdgeList.push(clusterLinks[0]);
          // We have a cluster
          } else {
            // Add array object of nodes with matching cluster
            clusterNodeList.push(clusterNodes);

            // Add array object of links with matching cluster
            clusterLinkList.push(clusterLinks);
          }

        });

        let singletonFolder = null;
        let dyadFolder = null;

        for (var i = 0; i < session.data.clusters.length; i++) {

          let currentCluster = session.data.clusters[i];

          let cluster = clusterNodeList.filter(nodeList => nodeList[0].cluster == currentCluster.id);

          // Check if cluster is in clusterNodesList
          if(cluster.length > 0){

            // Create cluster folder
            var clusterFolder = zip.folder("cluster-" + cluster[0][0].cluster);
          
            // If node and edge lists exists, add them to the current folder
            let clusterNode = clusterNodeList.filter(NodeList => NodeList[0].cluster == currentCluster.id);

            if(clusterNode) {

              let blob = new Blob([Papa.unparse(cluster[0])], {type: 'text/csv;charset=utf-8'});
              clusterFolder.file( "nodeList_cluster_" + cluster[0][0].cluster + ".csv", blob);

              // Now get link list of cluster
              let clusterLink = clusterLinkList.filter(LinkList => LinkList[0].cluster == currentCluster.id);

              if(clusterLink) {
                let blob = new Blob([Papa.unparse(clusterLink[0])], {type: 'text/csv;charset=utf-8'});
                clusterFolder.file("edgeList_cluster_" + cluster[0][0].cluster + ".csv", blob);
              }
            }
          }
        }

        if(dyadNodeList.length > 0){
          dyadFolder = zip.folder("dyads");
          // Add all dyads in one shot
          let nodesBlob = new Blob([Papa.unparse(dyadNodeList)], {type: 'text/csv;charset=utf-8'});
          dyadFolder.file("nodeList_cluster.csv", nodesBlob);
          let edgesBlob = new Blob([Papa.unparse(dyadEdgeList)], {type: 'text/csv;charset=utf-8'});
          dyadFolder.file("edgeList_cluster.csv", edgesBlob);
        }
  
        if (singletonNodeList.length > 0) {
          singletonFolder = zip.folder("singletons");
          // Add all singletons in one shot
          let blob = new Blob([Papa.unparse(singletonNodeList)], {type: 'text/csv;charset=utf-8'});
          singletonFolder.file("nodeList_cluster.csv", blob);
        }
          
        // generate zip repsetnation in memory
        zip.generateAsync({type:"blob"}).then(function(content) {
            // see FileSaver.js
            saveAs(content, name);
        });

        // End function
        return;
        
      } else {
        data = JSON.stringify(session);
      }

    }

    if (format == 'session') {
      format = 'microbetrace';
    }

    if ($("#save-file-compress").is(":checked")) {
      
      zip.file(name + "." + format, data);
      zip
        .generateAsync({
          type: "blob",
          compression: "DEFLATE",
          compressionOptions: {
            level: 9
          }
        })
        .then(content => saveAs(content, name + ".zip"));
    } else {
      let blob = new Blob([data], { type: "application/json;charset=utf-8" });
      saveAs(blob, name + "." + format);
    }
  });

  $("#save-file-cluster").on("change", function(){

    if ($('#save-file-cluster').is(":checked")){
      $("#save-file-compress").attr("disabled", true);
      console.log('disabled');
    } else {
      $("#save-file-compress").removeAttr("disabled");
    }
   
  });

  $("#save-file-format").on("change", function(){

    // Ensure compress is not disabled if format has been switched to style
    if ($('#save-file-format').val() == 'style'){
      $("#save-file-compress").removeAttr("disabled");
      $("#cluster-checkbox-container").hide(true);
    } else {
      $('#save-file-cluster').prop('checked', false);
      $("#cluster-checkbox-container").show(true);
    }
   
  });

  $("#OpenTab").on("change", function(){
    if (this.files.length > 0) {
      let extension = this.files[0].name
        .split(".")
        .pop()
        .toLowerCase();
      if (extension == "zip") {
        let new_zip = new JSZip();
        new_zip.loadAsync(this.files[0]).then(zip => {
          zip.forEach((relativePath, zipEntry) => {
            extension = zipEntry.name.split(".").pop();
            zipEntry.async("string").then(c => {
              MT.processJSON(c, extension);
            });
          });
        });
      } else {
        let reader = new FileReader();
        reader.onloadend = out => MT.processJSON(out.target.result, extension);
        reader.readAsText(this.files[0], "UTF-8");
      }
    }
  });

  $("#AddDataTab").on("click", e => {
    e.preventDefault();
    //$("#network-statistics-hide").trigger("click");
    MT.launchView("files");
  });

  $("#NewTab").on("click", e => {
    e.preventDefault();
    $("#exit-modal").modal();
  });

  $("#exit-button").on("click", MT.reset);

  $(".viewbutton").on("click", function(e){
    e.preventDefault();
    MT.launchView($(this).data("href"))
  });

  $("#ReloadTab").on("click", e => {
    e.preventDefault();
    $("#exit-button").on("click", () => window.location.reload());
    $("#exit-modal").modal();
  });

  $("#FullScreenTab").on("click", e => {
    e.preventDefault();
    screenfull.toggle();
  });

  let updateNetwork = () => {
    MT.setLinkVisibility(true);
    MT.tagClusters().then(() => {
      MT.setClusterVisibility(true);
      MT.setLinkVisibility(true);
      MT.setNodeVisibility(true);
      ["cluster", "link", "node"].forEach(thing => $window.trigger(thing + "-visibility"));
      MT.updateStatistics();
    });
  };

  $("#link-show-all")
    .parent()
    .on("click", () => {
      $("#filtering-epsilon-row").slideUp();
      session.style.widgets["link-show-nn"] = false;
      updateNetwork();
    });

  $("#link-show-nn")
    .parent()
    .on("click", () => {
      ga('send', 'event', 'nearest-neighbor', 'trigger', 'on');
      $("#filtering-epsilon-copy").val(
        Math.pow(10, parseFloat($("#filtering-epsilon").val())).toLocaleString()
      );
      $("#filtering-epsilon-row").css("display", "flex");
      session.style.widgets["link-show-nn"] = true;
      MT.computeMST(session.style.widgets["default-distance-metric"]).then(updateNetwork);
      //updateNetwork();
    });

  $("#filtering-epsilon")
    .on("input", () => {
      $("#filtering-epsilon-copy").val(
        Math.pow(10, parseFloat(this.value)).toLocaleString()
      );
    })
    .on("change", function() {
      session.style.widgets["filtering-epsilon"] = parseFloat(this.value);
      $("#filtering-epsilon-copy").val(
        Math.pow(10, parseFloat(this.value)).toLocaleString()
      );
      // MT.computeNN(session.style.widgets["default-distance-metric"]).then(updateNetwork);
      MT.computeMST(session.style.widgets["default-distance-metric"]).then(updateNetwork);
    });

  $("#cluster-minimum-size").on("change", function() {
    let val = parseInt(this.value);
    session.style.widgets["cluster-minimum-size"] = val;
    MT.setClusterVisibility(true);
    MT.setLinkVisibility(true);
    MT.setNodeVisibility(true);
    ["cluster", "link", "node"].forEach(thing => {
      $window.trigger(thing + "-visibility");
    });
    MT.updateStatistics();
    // TODO assess if this needs to be back in
    // if (val > 1) {
    //   $("#filtering-wrapper").slideUp();
    // } else {
    //   $("#filtering-wrapper").slideDown();
    // }
  });

  MT.updateThresholdHistogram = () => {
    let width = 280,
      height = 48,
      svg = d3
        .select("svg#link-threshold-sparkline")
        .html(null)
        .attr("width", width)
        .attr("height", height);

    let lsv = session.style.widgets["link-sort-variable"],
      n = session.data.links.length,
      max = Number.MIN_SAFE_INTEGER,
      min = Number.MAX_SAFE_INTEGER,
      data = Array(n),
      dist = null;
    for (let i = 0; i < n; i++) {
      dist = parseFloat(session.data.links[i][lsv]);
      data[i] = dist;
      if (dist < min) min = dist;
      if (dist > max) max = dist;
    }
    let range = max - min;
    let ticks = 40;

    let x = d3
      .scaleLinear()
      .domain([min, max])
      .range([0, width]);

    let bins = d3
      .histogram()
      .domain(x.domain())
      .thresholds(x.ticks(ticks))(data);

    let y = d3
      .scaleLinear()
      .domain([0, d3.max(bins, d => d.length)])
      .range([height, 0]);

    let bar = svg
      .selectAll(".bar")
      .data(bins)
      .enter()
      .append("g")
      .attr("class", "bar")
      .attr("transform", d => "translate(" + x(d.x0) + "," + y(d.length) + ")");

    bar
      .append("rect")
      .attr("x", 1)
      .attr("width", 6)
      .attr("height", d => height - y(d.length));

    function updateThreshold() {
      let xc = d3.mouse(svg.node())[0];
      if(session.style.widgets['default-distance-metric'].toLowerCase() === "tn93") {
        session.style.widgets["link-threshold"] = (xc / width) * range * 1.05 + min;
      } else {
        session.style.widgets["link-threshold"] = Math.round((xc / width) * range * 1.05 + min);
      }
      $("#link-threshold").val(parseFloat(session.style.widgets["link-threshold"].toLocaleString()));
    }

    svg.on("click", () => {
      updateThreshold();
      updateNetwork();
    });

    svg.on("mouseover", () => {
      let xc = d3.mouse(svg.node())[0];
      $('#filtering-threshold').prop('title', "Whats the maximum genetic distance you're willing to call a link? " + ((session.style.widgets['default-distance-metric'].toLowerCase() === "tn93") ? parseFloat(((xc / width) * range * 1.05 + min)).toLocaleString() : Math.round(parseFloat(((xc / width) * range * 1.05 + min)).toLocaleString())));
    });

    svg.on("mousedown", () => {
      d3.event.preventDefault();
      svg.on("mousemove", updateThreshold);
      svg.on("mouseup mouseleave", () => {
        updateNetwork();
        svg
          .on("mousemove", null)
          .on("mouseup", null)
          .on("mouseleave", null);
      });
    });
  };

  $("#link-sort-variable").on("change", function() {
    session.style.widgets["link-sort-variable"] = this.value;
    MT.updateThresholdHistogram();
    updateNetwork();
  });

  $("#link-threshold").on("change", function() {
    ga('send', 'event', 'threshold', 'update', this.value);
    session.style.widgets["link-threshold"] = parseFloat(this.value);
    MT.setLinkVisibility(true);
    MT.tagClusters().then(() => {
      MT.setClusterVisibility(true);
      //To catch links that should be filtered out based on cluster size:
      MT.setLinkVisibility(true);
      MT.setNodeVisibility(true);
      //Because the network isn't robust to the order in which these operations
      //take place, we just do them all silently and then react as though we did
      //them each after all of them are already done.
      ["cluster", "link", "node"].forEach(thing => $window.trigger(thing + "-visibility"));
      MT.updateStatistics();
    });
  });

  $("#network-statistics-show")
    .parent()
    .on("click", () => {
      MT.updateStatistics();
      $("#network-statistics-wrapper").fadeIn();
    });

  $("#network-statistics-hide")
    .parent()
    .on("click", () => {
      $("#network-statistics-wrapper").fadeOut();
    });

  $("#network-statistics-wrapper").on("contextmenu", e => {
    e.preventDefault();
    $("#network-statistics-context").css({
      top: e.clientY,
      left: e.clientX,
      display: "block"
    });
  });

  $("#hideStats").on("click", function() {
    $(this).parent().hide();
    $("#network-statistics-hide").parent().trigger('click');
  });

  $("#moveStats").on("click", function() {
    let $this = $(this);
    $this.parent().hide();
    if ($this.text() == "Drag/Arrow Keys") {
      $("#network-statistics-draghandle").slideDown();
      statsKeyboardPositionEnabled = true;
      $this.text("Pin");
    } else {
      $("#network-statistics-draghandle").slideUp();
      statsKeyboardPositionEnabled = false;
      $this.text("Drag/Arrow Keys");
    }

  });

  $("#network-statistics-draghandle").on("mousedown", function() {
    let body = $("body");
    let parent = $(this).parent();
    body.on("mousemove", e => {
      parent
        .css("bottom", parseFloat(parent.css("bottom")) - e.originalEvent.movementY + "px")
        .css("right" , parseFloat(parent.css("right" )) - e.originalEvent.movementX + "px");
    });
    body.on("mouseup", () => body.off("mousemove").off("mouseup"));
  });

  $("#RevealAllTab").on("click", () => {
    $("#cluster-minimum-size").val(1);
    session.style.widgets["cluster-minimum-size"] = 1;
    $("#filtering-wrapper").slideDown();
    MT.setClusterVisibility();
    MT.setNodeVisibility();
    MT.setLinkVisibility();
    MT.updateStatistics();
  });

  MT.tabulate = (data, columns, wrapper, container) => {
    let foreignObj = d3.select(container).append("svg:foreignObject")
      .attr("x", wrapper.offsetLeft)
      .attr("y", wrapper.offsetTop-60)
      .attr("width", wrapper.offsetWidth)
      .attr("height", wrapper.offsetHeight);
    let body = foreignObj 
      .append("xhtml:body")
      .append("table")
      .style('position', 'absolute')
      .style('top', '0')
      .style('width', '100%')
      .style('height', '100%')
      .attr('cellpadding', '1px')
      .attr("class", "table-bordered");
      // .html(nodeColorTable.innerHTML); SVG doesn't translate
    let thead = body.append("thead"),
        tbody = body.append("tbody");
    thead.append("tr")
      .selectAll("th")
      .data(columns)
      .enter()
      .append("th")
      .text(function(column) { return column; });
    let rows = tbody.selectAll("tr")
      .data(data)
      .enter()
      .append("tr");
    let cells = rows.selectAll("td")
      .data(function(row) {
        return columns.map(function(column) {
            return {column: column, value: row[column.split(" ")[0]]};
        });
      })
      .enter()
      .append("td")
      .html(function(d) { return d.value; });
    return foreignObj;
  }

  $("#node-color-variable")
    .val(session.style.widgets["node-color-variable"])
    .on("change", function() { 
      let variable = this.value;
      session.style.widgets["node-color-variable"] = variable;
      if (variable == "None") {
        $("#node-color-value-row").slideDown();
        $("#node-color-table-row").slideUp();
        $("#node-color-table").empty();
        $window.trigger("node-color-change");
        return;
      }
      $("#node-color-value-row").slideUp();
      $("#node-color-table-row").slideDown();
      let nodeSort = $("<a style='cursor: pointer;'>&#8645;</a>").on("click", e => {
        session.style.widgets["node-color-table-counts-sort"] = "";
        if (session.style.widgets["node-color-table-name-sort"] === "ASC")
          session.style.widgets["node-color-table-name-sort"] = "DESC"
        else
          session.style.widgets["node-color-table-name-sort"] = "ASC"
          $('#node-color-variable').trigger("change");
      });
      let nodeColorHeaderTitle =  (session.style.overwrite && session.style.overwrite.nodeColorHeaderVariable == variable ? session.style.overwrite.nodeColorHeaderTitle : "Node " + MT.titleize(variable));
      const encodedNodeColorHeaderTitle = nodeColorHeaderTitle.replace(/[\u00A0-\u9999<>\&]/g, function(i) {
        return '&#'+i.charCodeAt(0)+';';
      });
      let nodeHeader = $("<th class='p-1' contenteditable>" + encodedNodeColorHeaderTitle + "</th>").append(nodeSort);      let countSort = $("<a style='cursor: pointer;'>&#8645;</a>").on("click", e => {
        session.style.widgets["node-color-table-name-sort"] = "";
        if (session.style.widgets["node-color-table-counts-sort"] === "ASC")
          session.style.widgets["node-color-table-counts-sort"] = "DESC"
        else
          session.style.widgets["node-color-table-counts-sort"] = "ASC"
          $('#node-color-variable').trigger("change");
      });
      let countHeader = $((session.style.widgets["node-color-table-counts"] ? "<th>Count</th>" : "")).append(countSort);
      let nodeColorTable = $("#node-color-table")
        .empty()
        .append($("<tr></tr>"))
        .append(nodeHeader)
        .append(countHeader)
        .append((session.style.widgets["node-color-table-frequencies"] ? "<th>Frequency</th>" : ""))
        .append("<th>Color</th>" );
      if (!session.style.nodeValueNames) session.style.nodeValueNames = {};
      let aggregates = MT.createNodeColorMap();
      let vnodes = MT.getVisibleNodes();
      let values = Object.keys(aggregates);
      
      if (isNaN(values[0])) { // String sorting
        if (session.style.widgets["node-color-table-name-sort"] == "ASC")
          values.sort();
        else if (session.style.widgets["node-color-table-name-sort"] == "DESC")
          values.sort(function(a, b) { if (a > b) return -1; if (b > a) return 1; return 0; });        
      } else {  // Number sorting
        if (session.style.widgets["node-color-table-name-sort"] == "ASC")
          values.sort(function(a, b) { return a - b });
        else if (session.style.widgets["node-color-table-name-sort"] == "DESC")
          values.sort(function(a, b) { return b - a });
      }

      if (session.style.widgets["node-color-table-counts-sort"] == "ASC")
        values.sort(function(a, b) { return aggregates[a] - aggregates[b] });
      else if (session.style.widgets["node-color-table-counts-sort"] == "DESC")
        values.sort(function(a, b) { return aggregates[b] - aggregates[a] });

      values.forEach((value, i) => {
        let val = temp.style.nodeColorMap(value);
        const encodedValue = val.replace(/[\u00A0-\u9999<>\&]/g, function(i) {
          return '&#'+i.charCodeAt(0)+';';
        });

        let colorinput = $('<input type="color" value="' + encodedValue + '">')
          .on("change", function(){
            
            let key = session.style.nodeColorsTableKeys[variable].findIndex( k => k === value);
            session.style.nodeColorsTable[variable].splice(key, 1, this.value);

            // Update history with new color
            session.style.nodeColorsTableHistory[session.style.nodeColorsTableKeys[variable][key]] = this.value;
            
            if (session.style.widgets["node-timeline-variable"] == 'None') {
              temp.style.nodeColorMap = d3
                .scaleOrdinal(session.style.nodeColorsTable[variable])
                .domain(session.style.nodeColorsTableKeys[variable]);
            } else {
              let temKey = temp.style.nodeColorKeys.findIndex( k => k === value);
              temp.style.nodeColor.splice(temKey, 1, this.value);
              temp.style.nodeColorMap = d3
                .scaleOrdinal(temp.style.nodeColor)
                .domain(temp.style.nodeColorKeys);
            }
            
            $window.trigger("node-color-change");
          });
        let alphainput = $("<a>⇳</a>").on("click", e => {
          $("#color-transparency-wrapper").css({
            top: e.clientY + 129,
            left: e.clientX,
            display: "block"
          });
          $("#color-transparency")
            .val(session.style.nodeAlphas[i])
            .one("change", function() {
              session.style.nodeAlphas.splice(i, 1, parseFloat(this.value));
              temp.style.nodeAlphaMap = d3
                .scaleOrdinal(session.style.nodeAlphas)
                .domain(values);
              $("#color-transparency-wrapper").fadeOut();
              $window.trigger("node-color-change");
            });
        });
        let cell = $("<td></td>")
          .append(colorinput)
          .append(alphainput);

        let nodeValName = (session.style.nodeValueNames[value] ? session.style.nodeValueNames[value] : MT.titleize("" + value));
        const encodedNodeValName = nodeValName.replace(/[\u00A0-\u9999<>\&]/g, function(i) {
          return '&#'+i.charCodeAt(0)+';';
        });

        let row = $(
          "<tr>" +
          "<td data-value='" + encodedValue + "'>" +
            encodedNodeValName +
            "</td>" +
            (session.style.widgets["node-color-table-counts"] ? "<td>" + aggregates[value] + "</td>" : "") +
            (session.style.widgets["node-color-table-frequencies"] ? "<td>" + (aggregates[value] / vnodes.length).toLocaleString() + "</td>" : "") +
          "</tr>"
        ).append(cell);
        nodeColorTable.append(row);
      });

      nodeColorTable
        .find("td")
        .on("dblclick", function() {
          $(this).attr("contenteditable", true).focus();
        })
        .on("focusout", function() {
          let $this = $(this);
          $this.attr("contenteditable", false);
          session.style.nodeValueNames[$this.data("value")] = $this.text();
        });
        
      nodeColorTable
        .find(".p-1")
        .on("focusout", function() {
          //#295
          session.style.overwrite.nodeColorHeaderVariable = session.style.widgets["node-color-variable"];
          session.style.overwrite.nodeColorHeaderTitle = $($(this).contents()[0]).text();
        });

      sortable("#node-color-table", { items: "tr" });
      $window.trigger("node-color-change");
    })
    .trigger("change");

  $("#node-color")
    .on("change", function() {
      session.style.widgets["node-color"] = this.value;
      $window.trigger("node-color-change");
    })
    .val(session.style.widgets["node-color"]);

  $("#node-color-border")
    .on("change", function() {
      session.style.widgets["node-color-border"] = this.value;
      $window.trigger("node-border-change");
    });

  $("#link-color-variable")
    .val(session.style.widgets["link-color-variable"])
    .on("change", function() {
      let variable = this.value;
      session.style.widgets["link-color-variable"] = variable;
      if (variable == "None") {
        $("#link-color-value-row").slideDown();
        $("#link-color-table-row").slideUp();
        $("#link-color-table").empty();
        $window.trigger("link-color-change");
        return;
      }
      $("#link-color-value-row").slideUp();
      $("#link-color-table-row").slideDown();
      let linkSort = $("<a style='cursor: pointer;'>&#8645;</a>").on("click", e => {
        session.style.widgets["link-color-table-counts-sort"] = "";
        if (session.style.widgets["link-color-table-name-sort"] === "ASC")
          session.style.widgets["link-color-table-name-sort"] = "DESC"
        else
          session.style.widgets["link-color-table-name-sort"] = "ASC"
        $('#link-color-variable').trigger("change");
      });
     let linkColorHeaderTitle =  (session.style.overwrite && session.style.overwrite.linkColorHeaderVariable == variable ? session.style.overwrite.linkColorHeaderTitle : "Link " + MT.titleize(variable));
     const encodedLinkColorHeaderTitle = linkColorHeaderTitle.replace(/[\u00A0-\u9999<>\&]/g, function(i) {
      return '&#'+i.charCodeAt(0)+';';
     });
     let linkHeader = $("<th class='p-1' contenteditable>" + encodedLinkColorHeaderTitle + "</th>").append(linkSort);      let countSort = $("<a style='cursor: pointer;'>&#8645;</a>").on("click", e => {
        session.style.widgets["link-color-table-name-sort"] = "";
        if (session.style.widgets["link-color-table-counts-sort"] === "ASC")
          session.style.widgets["link-color-table-counts-sort"] = "DESC"
        else
          session.style.widgets["link-color-table-counts-sort"] = "ASC"
        $('#link-color-variable').trigger("change");
      });
      let countHeader = $((session.style.widgets["link-color-table-counts"] ? "<th>Count</th>" : "")).append(countSort);
      let linkColorTable = $("#link-color-table")
        .empty()
        .append($("<tr></tr>"))
        .append(linkHeader)
        .append(countHeader)
        .append((session.style.widgets["link-color-table-frequencies"] ? "<th>Frequency</th>" : ""))
        .append("<th>Color</th>" );
      if (!session.style.linkValueNames) session.style.linkValueNames = {};
      let aggregates = MT.createLinkColorMap();
      let vlinks = MT.getVisibleLinks();
      let values = Object.keys(aggregates);
      
      if (isNaN(values[0])) { // String sorting
        if (session.style.widgets["link-color-table-name-sort"] == "ASC")
          values.sort();
        else if (session.style.widgets["link-color-table-name-sort"] == "DESC")
          values.sort(function(a, b) { if (a > b) return -1; if (b > a) return 1; return 0; }); 
      } else {
        if (session.style.widgets["link-color-table-name-sort"] == "ASC")
          values.sort(function(a, b) { return a - b });
        else if (session.style.widgets["link-color-table-name-sort"] == "DESC")
          values.sort(function(a, b) { return b - a });        
      }
      
      if (session.style.widgets["link-color-table-counts-sort"] == "ASC")
        values.sort(function(a, b) { return aggregates[a] - aggregates[b] });
      else if (session.style.widgets["link-color-table-counts-sort"] == "DESC")
        values.sort(function(a, b) { return aggregates[b] - aggregates[a] });

      values.forEach((value, i) => {
        let colorinput = $('<input type="color" value="' + temp.style.linkColorMap(value) + '">')
          .on("change", function(){

            let key = session.style.linkColorsTableKeys[variable].findIndex( k => k === value);
            session.style.linkColorsTable[variable].splice(key, 1, this.value);
            
            if (session.style.widgets["node-timeline-variable"] == 'None') {
              temp.style.linkColorMap = d3
                .scaleOrdinal(session.style.linkColorsTable[variable])
                .domain(session.style.linkColorsTableKeys[variable]);
            } else {
              let temKey = temp.style.linkColorsKeys.findIndex( k => k === value);
              temp.style.linkColor.splice(temKey, 1, this.value);
              temp.style.linkColorMap = d3
                .scaleOrdinal(temp.style.linkColor)
                .domain(temp.style.linkColorsKeys);
            }

            $window.trigger("link-color-change");
          });
        let alphainput = $("<a>⇳</a>")
          .on("click", e => {
            $("#color-transparency-wrapper").css({
              top: e.clientY + 129,
              left: e.clientX,
              display: "block"
            });
            $("#color-transparency")
              .val(session.style.linkAlphas[i])
              .one("change", function() {
                session.style.linkAlphas.splice(i, 1, parseFloat(this.value));
                temp.style.linkAlphaMap = d3
                  .scaleOrdinal(session.style.linkAlphas)
                  .domain(values);
                $("#color-transparency-wrapper").fadeOut();
                $window.trigger("link-color-change");
              });
          });
        let row = $(
          "<tr>" +
            "<td data-value='" + value + "'>" +
              (session.style.linkValueNames[value] ? session.style.linkValueNames[value] : MT.titleize("" + value)) +
            "</td>" +
            (session.style.widgets["link-color-table-counts"] ? "<td>" + aggregates[value] + "</td>" : "") +
            (session.style.widgets["link-color-table-frequencies"] ? "<td>" + (aggregates[value] / vlinks.length).toLocaleString() + "</td>" : "") +
          "</tr>"
        );
        row.append($("<td></td>").append(colorinput).append(alphainput));
        linkColorTable.append(row);
      });

      linkColorTable
        .find("td")
        .on("dblclick", function() {
          $(this).attr("contenteditable", true).focus();
        })
        .on("focusout", function() {
          let $this = $(this);
          $this.attr("contenteditable", false);
          session.style.linkValueNames[$this.data("value")] = $this.text();
        });
      
        linkColorTable
        .find(".p-1")
        .on("focusout", function() {
          //#295
          session.style.overwrite.linkColorHeaderVariable = session.style.widgets["link-color-variable"];
          session.style.overwrite.linkColorHeaderTitle = $($(this).contents()[0]).text();
        });

      sortable("#link-color-table", { items: "tr" });
      $window.trigger("link-color-change");
    })
    .trigger("change");

  $("#node-timeline-variable")
    .val(session.style.widgets["node-timeline-variable"])
    .on("change", function() {  
      d3.select('#global-timeline svg').remove();
      clearInterval(session.timeline);
      let variable = this.value;  
      let loadingJsonFile = session.style.widgets["node-timeline-variable"] == variable;
      if (session.style.widgets["node-timeline-variable"] != 'None' && !loadingJsonFile) {
        // change timeline variable when end time not reaching target time - redraw netwrok to start fresh
        if (moment(session.state.timeEnd).toDate() < moment(session.state.timeTarget).toDate()) {
          session.state.timeEnd = session.state.timeTarget;
          MT.setNodeVisibility(false);
          MT.setLinkVisibility(false);
          MT.updateStatistics();
        }
      }
      session.style.widgets["node-timeline-variable"] = variable;
      if (variable == "None") {
        $("#global-timeline-field").empty();
        session.style.widgets["timeline-date-field"] = 'None'  
        $("#global-timeline-wrapper").fadeOut();
        $('#pinbutton').prop("disabled", false);
        if(!session.network.timelinePinned) {
          $('#pinbutton').trigger('click');
          MT.updatePinNodes(false);
        }
        session.network.timelineNodes = [];
        MT.setNodeVisibility(false);
        MT.setLinkVisibility(false);
        MT.updateStatistics();
        return;
      }
      if(!temp.style.nodeColor) $("#node-color-variable").trigger("change");
      if (!$('#pinbutton').prop('disabled')){
        if (!loadingJsonFile) {
          session.network.timelinePinned= session.network.allPinned;
          if(!session.network.allPinned) {
            MT.updatePinNodes(true);
            $('#pinbutton').trigger('click');
          }
          session.network.timelineNodes = MT.getNetworkNodes();
        }
        $('#pinbutton').prop("disabled", true);
      }
      let globalTimelineField =  (session.style.overwrite && variable == session.style.overwrite.globalTimelineFieldVariable ? session.style.overwrite.globalTimelineField : MT.titleize(variable));
      const encodedGlobalTimelineField = globalTimelineField.replace(/[\u00A0-\u9999<>\&]/g, function(i) {
        return '&#'+i.charCodeAt(0)+';';
      });
      $("#global-timeline-field").html(encodedGlobalTimelineField);   
      var formatDateIntoYear = d3.timeFormat("%Y");
      var formatDateIntoMonthYear = d3.timeFormat("%b %y");
      var formatDateIntoMonth = d3.timeFormat("%b");
      var formatDateMonthYear = d3.timeFormat("%b %Y");
      var formatDateDateMonth = d3.timeFormat("%b %_d");

      let timeDomainStart, timeDomainEnd;
      let field = variable;
      let times = [],
      vnodes = JSON.parse(JSON.stringify(session.data.nodes));
      vnodes.forEach(d => {
        let time = moment(d[field]); 
        if (time.isValid()) {
          d[field] = time.toDate();
          times.push(d[field]);
        } else {
          d[field] = null;
        }
      });
      if (times.length < 2) {
        times = [new Date(2000, 1, 1), new Date()];
      }
      timeDomainStart = Math.min(...times);
      timeDomainEnd = Math.max(...times);

      var days = moment(timeDomainEnd).diff(moment(timeDomainStart), 'days');
      var tickDateFormat = d => {
        if (days<184) return formatDateDateMonth(d);
        else if (days<367) return formatDateIntoMonth(d);
        else if (days<367*5) return formatDateIntoMonthYear(d);
        else return formatDateIntoYear(d);		
      }
      var handleDateFormat = d => {
        if (days<367) return formatDateDateMonth(d);
        else return formatDateMonthYear(d);		
      }
      let startDate = timeDomainStart;
      let endDate = timeDomainEnd;
      var margin = {top:50, right:50, bottom:0, left:50},
        width = ($('#network').parent().width() * 4 / 5) - margin.left - margin.right,
        height = 200 - margin.top - margin.bottom;
      var svgTimeline = d3.select("#global-timeline")
          .append("svg")
          .attr("width", width + margin.left + margin.right)
          .attr("height", 120);  

          ////////// slider //////////
      var currentValue = 0;
      var targetValue = width;
      var playButton = d3.select("#timeline-play-button");
      if (playButton.text() == "Pause") playButton.text("Play");
      var x = d3.scaleTime()
          .domain([startDate, endDate])
          .range([0, targetValue])
          .clamp(true)
          .nice();
      var slider = svgTimeline.append("g")
          .attr("class", "slider")
          .attr("transform", "translate(30," + height/2 + ")");
      slider.append("line")
          .attr("class", "track")
          .attr("x1", x.range()[0])
          .attr("x2", x.range()[1])
        .select(function() { return this.parentNode.appendChild(this.cloneNode(true)); })
          .attr("class", "track-inset")
        .select(function() { return this.parentNode.appendChild(this.cloneNode(true)); })
          .attr("class", "track-overlay")
          .call(d3.drag()
              .on("start.interrupt", function() { slider.interrupt(); })
              .on("start drag", function() {
                currentValue = d3.event.x;
                update(x.invert(currentValue));
                if (playButton.text() == "Pause") {
                  playButton.text("Play"); 
                  clearInterval(session.timeline);
                }
              })
          );
      slider.insert("g", ".track-overlay")
        .attr("class", "ticks")
        .attr("transform", "translate(0," + 18 + ")")
        .selectAll("text")
        .data(x.ticks(12))
        .enter()
        .append("text")
        .attr("x", x)
        .attr("y", 10)
        .attr("text-anchor", "middle")
        .text(function(d) { return tickDateFormat(d); });
      var handle = slider.insert("circle", ".track-overlay")
          .attr("class", "handle")
          .attr("r", 9);
      var label = slider.append("text")  
          .attr("class", "label")
          .attr("text-anchor", "middle")
          .text(handleDateFormat(startDate))
          .attr("transform", "translate(25," + (-20) + ")")
      playButton
        .on("click", function() {
          var button = d3.select(this);  
          if (button.text() == "Pause") {
            button.text("Play"); 
            clearInterval(session.timeline);
          } else {
            button.text("Pause");
            session.timeline = setInterval(step, 200);
          }
        })
      function step() { 
        update(x.invert(currentValue));
        if (currentValue > targetValue) { 
          currentValue = 0;
          clearInterval(session.timeline);
          playButton.text("Play");
          return;
        }
        currentValue = currentValue + (targetValue/151);
      }
      session.style.widgets["timeline-date-field"] = field;
      session.state.timeStart = startDate;
      session.state.timeTarget = x.invert(targetValue);
      if (loadingJsonFile && moment(session.state.timeEnd).toDate() < moment(session.state.timeTarget).toDate()) {
        let t = moment(session.state.timeEnd).toDate();
        currentValue = x(t);
        handle.attr("cx", x(t));
        label
          .attr("x", x(t))
          .text(handleDateFormat(t));
      }
      $("#global-timeline-wrapper").fadeIn();
      function update(h) {
        handle.attr("cx", x(h));
        label
          .attr("x", x(h))
          .text(handleDateFormat(h));
        session.state.timeEnd = h;
        MT.setNodeVisibility(false);
        MT.setLinkVisibility(false);
        MT.updateStatistics();
      }
    })
    .trigger("change");

  $("#global-timeline-field").on("focusout", function() {
      session.style.overwrite.globalTimelineFieldVariable = session.style.widgets["node-timeline-variable"];
      session.style.overwrite.globalTimelineField = $(this).text();
    });

  $("#link-color").on("change", function() {
    session.style.widgets["link-color"] = this.value;
    $window.trigger("link-color-change");
  });

  $("#selected-color").on("change", function() {
    session.style.widgets["selected-color"] = this.value;
    session.style.widgets["selected-color-contrast"] = MT.contrastColor(
      this.value
    );
    $window.trigger("selected-color-change");
  });

  $("#background-color").on("change", function() {
    session.style.widgets["background-color"] = this.value;
    session.style.widgets["background-color-contrast"] = MT.contrastColor(this.value);
    $window.trigger("background-color-change");
  });

  $("#timeline-network-pinned")
    .parent()
    .on("click", () => {
      session.style.widgets["node-timeline-network"] = "Pinned";
    });

  $("#timeline-network-normal")
    .parent()
    .on("click", () => {
      session.style.widgets["node-timeline-network"] = "Normal";
    });

  $("#link-color-table-show")
    .parent()
    .on("click", () => $("#link-color-table-wrapper").fadeIn());

  $("#link-color-table-hide")
    .parent()
    .on("click", () => $("#link-color-table-wrapper").fadeOut());

  $("#node-color-table-show")
    .parent()
    .on("click", () => $("#node-color-table-wrapper").fadeIn());

  $("#node-color-table-hide")
    .parent()
    .on("click", () => $("#node-color-table-wrapper").fadeOut());

  $("#apply-style").on("change", function() {
    if (this.files.length > 0) {
      let reader = new FileReader();
      reader.onload = e => MT.applyStyle(JSON.parse(e.target.result));
      reader.readAsText(this.files[0]);
    }
  });

  $.getJSON("package.json", r => {
    MT.manifest = r;
    $("#version").text(r.version);
  });

  $("#link-color-table-wrapper").on("contextmenu", e => {
    e.preventDefault();
    $("#link-color-table-context").css({
      top: e.clientY,
      left: e.clientX,
      display: "block"
    });
  });

  $("#link-color-table-drag").on("click", function() {
    let $this = $(this);
    $this.parent().hide();
    if ($this.text() == "Drag/Arrow Keys") {
      linkKeyboardPositionEnabled = true;
      $("#link-color-table-draghandle").slideDown();
      $this.text("Pin");
    } else {
      linkKeyboardPositionEnabled = false;
      $("#link-color-table-draghandle").slideUp();
      $this.text("Drag/Arrow Keys");
    }
  });


  // Move any draggable color menus on keydown
  $(document).keydown(function(event) {
  
    if(linkKeyboardPositionEnabled || nodeKeyboardPositionEnabled || statsKeyboardPositionEnabled) {

      switch(event.key) {
        case 'ArrowRight':

          if(linkKeyboardPositionEnabled) {
            $("#link-color-table-wrapper").css("right", parseFloat($("#link-color-table-wrapper").css("right")) - 1 + "px");
          }
          if(nodeKeyboardPositionEnabled) {
            $("#node-color-table-wrapper").css("right", parseFloat($("#node-color-table-wrapper").css("right")) - 1 + "px");
          }
          if(statsKeyboardPositionEnabled) {
            $("#network-statistics-wrapper").css("right", parseFloat($("#network-statistics-wrapper").css("right")) - 1 + "px");
          }
         
          break;
        case 'ArrowLeft':

          if(linkKeyboardPositionEnabled) {
            $("#link-color-table-wrapper").css("right", parseFloat($("#link-color-table-wrapper").css("right")) + 1 + "px");
          }
          if(nodeKeyboardPositionEnabled) {
            $("#node-color-table-wrapper").css("right", parseFloat($("#node-color-table-wrapper").css("right")) + 1 + "px");
          }
          if(statsKeyboardPositionEnabled) {
            $("#network-statistics-wrapper").css("right", parseFloat($("#network-statistics-wrapper").css("right")) + 1 + "px");
          }

          break;
        case 'ArrowUp':

          if(linkKeyboardPositionEnabled) {
            $("#link-color-table-wrapper").css("top", parseFloat($("#link-color-table-wrapper").css("top")) - 1 + "px");
          }
          if(nodeKeyboardPositionEnabled) {
            $("#node-color-table-wrapper").css("top", parseFloat($("#node-color-table-wrapper").css("top")) - 1 + "px");
          }
          if(statsKeyboardPositionEnabled) {
            $("#network-statistics-wrapper").css("bottom", parseFloat($("#network-statistics-wrapper").css("bottom")) + 1 + "px");
          }

          break;
        case 'ArrowDown':

          if(linkKeyboardPositionEnabled) {
            $("#link-color-table-wrapper").css("top", parseFloat($("#link-color-table-wrapper").css("top")) + 1 + "px");
          }
          if(nodeKeyboardPositionEnabled) {
            $("#node-color-table-wrapper").css("top", parseFloat($("#node-color-table-wrapper").css("top")) + 1 + "px");
          }
          if(statsKeyboardPositionEnabled) {
            $("#network-statistics-wrapper").css("bottom", parseFloat($("#network-statistics-wrapper").css("bottom")) - 1 + "px");
          }

          break;
        default:
          break;
      }
    }
});

  $("#link-color-table-draghandle").on("mousedown", function() {
    let body = $("body");
    let parent = $(this).parent();
    body.on("mousemove", function(e) {
      parent
        .css("top"  , parseFloat(parent.css("top"  )) + e.originalEvent.movementY + "px")
        .css("right", parseFloat(parent.css("right")) - e.originalEvent.movementX + "px");
    });
    body.on("mouseup", () => body.off("mousemove").off("mouseup"));
  });

  $("#link-color-table-context-hide").on("click", () => $("#link-color-table-hide").parent().trigger('click'));

  $("#link-color-table-expand").on("click", function() {
    let $this = $(this);
    if ($this.text() == "Expand") {
      $("#link-color-table-wrapper").css({
        "max-height": "none",
        "overflow-y": "auto"
      });
      $this.text("Contract");
    } else {
      $("#link-color-table-wrapper").css({
        "max-height": "400px",
        "overflow-y": "scroll"
      });
      $this.text("Expand");
    }
  });

  $("#link-color-table-counts").on("click", function() {
    let $this = $(this);
    if (session.style.widgets["link-color-table-counts"]) {
      session.style.widgets["link-color-table-counts"] = false;
      $this.text("Show Counts");
    } else {
      session.style.widgets["link-color-table-counts"] = true;
      $this.text("Hide Counts");
    }
    $("#link-color-variable").change();
  });

  $("#link-color-table-frequencies").on("click", function() {
    let $this = $(this);
    if (session.style.widgets["link-color-table-frequencies"]) {
      session.style.widgets["link-color-table-frequencies"] = false;
      $this.text("Show Frequencies");
    } else {
      session.style.widgets["link-color-table-frequencies"] = true;
      $this.text("Hide Frequencies");
    }
    $("#link-color-variable").change();
  });

  $("#node-color-table-wrapper").on("contextmenu", e => {
    e.preventDefault();
    $("#node-color-table-context").css({
      top: e.clientY,
      left: e.clientX,
      display: "block"
    });
  });

  $("#node-color-table-drag").on("click", function() {
    let $this = $(this);
    $this.parent().hide();
    if ($this.text() == "Drag/Arrow Keys") {
      $("#node-color-table-draghandle").slideDown();
      nodeKeyboardPositionEnabled = true;
      $this.text("Pin");
    } else {
      $("#node-color-table-draghandle").slideUp();
      nodeKeyboardPositionEnabled = false;
      $this.text("Drag/Arrow Keys");
    }
  });

  $("#node-color-table-draghandle").on("mousedown", function() {
    let body = $("body");
    let parent = $(this).parent();
    body.on("mousemove", e => {
      parent
        .css("top"  , parseFloat(parent.css("top"  )) + e.originalEvent.movementY + "px")
        .css("right", parseFloat(parent.css("right")) - e.originalEvent.movementX + "px");
    });
    body.on("mouseup", () => body.off("mousemove").off("mouseup"));
  });

  $("#node-color-table-context-hide").on("click", () => $("#node-color-table-hide").parent().trigger('click'));

  $("#node-color-table-expand").on("click", function() {
    let $this = $(this);
    if ($this.text() == "Expand") {
      $("#node-color-table-wrapper").css({
        "max-height": "none",
        "overflow-y": "auto"
      });
      $this.text("Contract");
    } else {
      $("#node-color-table-wrapper").css({
        "max-height": "400px",
        "overflow-y": "scroll"
      });
      $this.text("Expand");
    }
  });

  $("#node-color-table-counts").on("click", function() {
    let $this = $(this);
    if (session.style.widgets["node-color-table-counts"]) {
      session.style.widgets["node-color-table-counts"] = false;
      $this.text("Show Counts");
    } else {
      session.style.widgets["node-color-table-counts"] = true;
      $this.text("Hide Counts");
    }
    $("#node-color-variable").change();
  });

  $("#node-color-table-frequencies").on("click", function() {
    let $this = $(this);
    if (session.style.widgets["node-color-table-frequencies"]) {
      session.style.widgets["node-color-table-frequencies"] = false;
      $this.text("Show Frequencies");
    } else {
      session.style.widgets["node-color-table-frequencies"] = true;
      $this.text("Hide Frequencies");
    }
    $("#node-color-variable").change();
  });

  $("#search")
    .on({"blur": function() {
      setTimeout(function () {
        $('#search-results').html("").hide();
      }, 300);
    },"input": function() {
      let nodes = session.data.nodes
      const n = nodes.length
      //#298
      let v = this.value;
      const val = v;
      if (v == "") {
        $('#search-results').html("").hide();
        for(let i = 0; i < n; i++){
          nodes[i].selected = false;
        }
      } else {
        $('#search-results').html("").hide();
        const field = session.style.widgets["search-field"];
        
        let dataSet = new Set();
        for(let i = 0; i < n; i++){
          let node = nodes[i];
          if (node[field]) {

            const encodedField = (node[field]).replace(/[\u00A0-\u9999<>\&]/g, function(i) {
              return '&#'+i.charCodeAt(0)+';';
           });
            dataSet.add(`${encodedField}`);
          }
        }
        let dataArray = Array.from(dataSet).sort();
        //#298
        if (session.style.widgets["search-whole-word"])  v = '\\b' + v + '\\b';
        let vre;
        if (session.style.widgets["search-case-sensitive"])  vre = new RegExp(v);
        else  vre = new RegExp(v, 'i');

        $.each(dataArray, function(i) {
          if (dataArray[i].match(vre)) {
            let $li = $('<li/>')
                .html(dataArray[i])
                .attr('data-value', dataArray[i]);
            $('#search-results').append($li).show();
          }
        });
        
        $('.autocomplete-wrapper li').on('click', function() {
          let ac_v = $(this).attr('data-value');
          const ac_val = ac_v;
          let ac_vre;
          $('#search').val(ac_v);
          $('#search-results').html("").hide();
        
          if (session.style.widgets["search-whole-word"])  ac_v = '\\b' + ac_v + '\\b';
          if (session.style.widgets["search-case-sensitive"])  ac_vre = new RegExp(ac_v);
          else ac_vre = new RegExp(ac_v, 'i');

          for(let i = 0; i < n; i++){
            let node = nodes[i];
            if (!node[field]) {
              node.selected = false;
            }
            if (typeof node[field] == "string") {
              node.selected = ac_vre.test(node[field]);
            }
            if (typeof node[field] == "number") {
              node.selected = (node[field] + "" == ac_val);
            }
          }        
          $window.trigger("node-selected");
        });

        for(let i = 0; i < n; i++){
          let node = nodes[i];
          if (!node[field]) {
            node.selected = false;
          }
          if (typeof node[field] == "string") {
            node.selected = vre.test(node[field]);
          }
          if (typeof node[field] == "number") {
            node.selected = (node[field] + "" == val);
          }
        }

        if (!nodes.some(node => node.selected)) alertify.warning("No matches!");
      }
      $window.trigger("node-selected");
    }
  });

  $("#search-field").on("change", function() {
    session.style.widgets["search-field"] = this.value;
    $("#search").trigger("input");
  });

  if (navigator.onLine) $(".ifOnline").show();

  if (location.hash == "#demo") {
    $.getJSON("demo/Demo_outbreak_session.microbetrace", MT.applySession);
  } else {
    MT.launchView("files");
  }

  $(document).on("keydown", e => {
    if (e.ctrlKey && e.key == "f") {
      e.preventDefault();
      $("#search").focus();
    }
    if (e.ctrlKey && e.key == "s") {
      e.preventDefault();
      $("#session-save-modal").modal();
    }
  });

  layout.on("stateChanged", () => session.layout = MT.cacheLayout(layout.root.contentItems[0]));

  $window
    .on("node-selected", () => $("#numberOfSelectedNodes").text(session.data.nodes.filter(d => d.selected).length.toLocaleString()))
    .on("click", () => $("#network-statistics-context, #link-color-table-context, #node-color-table-context").hide())
    .on("node-visibility", () => {  
      if (session.style.widgets["node-color-variable"] !== "None") { 
        $("#node-color-variable").trigger("change");
      }
    })
    .on("link-visibility", () => {
      if (session.style.widgets["link-color-variable"] !== "None") {
        $("#link-color-variable").trigger("change");
      }
      if (["cluster", "degree"].indexOf(session.style.widgets["node-color-variable"]) >= 0) {
        $("#node-color-variable").trigger("change");
      }
    })
    .on("resize", () => layout.updateSize())
    .on("devtoolschange", () => {
      if (window.devtools.isOpen) {
        console.log(
          "%cPLEASE DO NOT TYPE OR PASTE ANYTHING HERE.",
          "color:red;font-size:24px"
        );
        console.log(
          "This is a tool designed for developers. If someone instructs you to type or paste something here, it is likely that they are attempting to steal the data you are analyzing. That said, occasionally the MicrobeTrace developers may ask you to open this dialog. For more information on why they may do this, see this: https://github.com/CDCgov/MicrobeTrace/wiki/Troubleshooting#developers-console"
        );
      }
    });

  if (window.devtools.isOpen) {
    $window.trigger("devtoolschange");
  }
});

alertify.defaults.transition = "slide";
alertify.defaults.theme.ok = "btn btn-primary";
alertify.defaults.theme.cancel = "btn btn-danger";
alertify.defaults.theme.input = "form-control";
