import * as patristic from 'patristic';
import * as d3 from 'd3';
// import "patristic";
// import "d3";

/**
 * This class function creates a TidyTree object.
 * @param {String} newick A valid newick string
 * @param {Object} options A Javascript object containing options to set up the tree
 */
export default function TidyTree(data, options, events) {
  let defaults = {
    layout: "vertical",
    type: "tree",
    mode: "smooth",
    colorOptions: { nodeColorMode: "none" },
    leafNodes: true,
    leafLabels: false,
    equidistantLeaves: false,
    branchNodes: false,
    branchLabels: false,
    branchDistances: false,
    hStretch: 1,
    vStretch: 1,
    rotation: 0,
    ruler: true,
    animation: 500,
    margin: [50, 50, 50, 50] //CSS order: top, right, bottom, left
  };
  if (!options) options = {};
  Object.assign(this, defaults, options, {
    events: {
      draw: [],
      showtooltip: [],
      hidetooltip: [],
      contextmenu: [],
      search: [],
      select: []
    }
  });

  if(events) Object.keys(events).forEach(e => this.events[e].push(events[e]));

  if (this.parent) this.draw(this.parent);

  if (data instanceof patristic.Branch) {
    this.setData(data);
  } else {
    this.setTree(data);
  }

  if (this.parent) this.recenter();
}

/**
 * Update the TidyTree's underlying data structure
 * There are two contexts in which you should call this:
 * 	1. You wish to replace the tree with a completely different tree, given by a different newick string
 * 	2. Your underlying tree data has changed (e.g. the tree has been re-rooted)
 * @param  {Object} data A patristic.Branch object
 * @return {Object}        the TidyTree object
 */
TidyTree.prototype.setData = function (data) {
  if (!data) throw Error("Invalid Data");
  this.data = data;
  this.range = [Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER];
  this.hierarchy = d3
    .hierarchy(this.data, d => d.children)
    .eachBefore(d => {
      d.value =
        (d.parent ? d.parent.value : 0) + (d.data.length ? Math.abs(d.data.length) : 0);
      if (d.value < this.range[0]) this.range[0] = d.value;
      if (d.value > this.range[1]) this.range[1] = d.value;
    })
    .each(d => (d.value /= this.range[1]));
  if (this.parent) return this.redraw();
  return this;
};

/**
 * Update the TidyTree's underlying data structure
 * There are two contexts in which you should call this:
 * 	1. You wish to replace the tree with a completely different tree, given by a different newick string
 * 	2. Your underlying tree data has changed (e.g. the tree has been re-rooted)
 * @param  {String} newick A valid newick string
 * @return {Object}        the TidyTree object
 */
TidyTree.prototype.setTree = function (newick) {
  if (!newick) throw Error("Invalid Newick String");
  return this.setData(patristic.parseNewick(newick));
};

/**
 * The available layouts for rendering trees.
 * @type {Array}
 */
TidyTree.validLayouts = ["horizontal", "vertical", "circular"];

/**
 * The available types for rendering branches.
 * @type {Array}
 */
TidyTree.validTypes = ["tree", "weighted", "dendrogram"];

/**
 * The available modes for rendering branches.
 * @type {Array}
 */
TidyTree.validModes = ["smooth", "square", "straight"];

/**
 * The available color modes for rendering nodes.
 * @type {Array}
 */
TidyTree.validNodeColorModes = ["none", "list"]; // later, highlight on hover, or maybe color by annotation on a node/ search

/**
 * The available color modes for rendering branches.
 * @type {Array}
 */
TidyTree.validBranchColorModes = ["none", "monophyletic"]; // later, toRoot? 

/**
 * Draws a Phylogenetic on the element referred to by selector
 * @param  {String} selector A CSS selector
 * @return {TidyTree}           the TidyTree object
 */
TidyTree.prototype.draw = function (selector) {
  if (!selector && !this.parent) {
    throw Error("No valid target for drawing given! Where should the tree go?");
  }
  let parent = (this.parent = d3.select(selector ? selector : this.parent));

  this.width =
    parseFloat(parent.style("width")) - this.margin[1] - this.margin[3];
  this.height =
    parseFloat(parent.style("height")) - this.margin[0] - this.margin[2] - 25;

  let tree = d3.tree();

  let svg = parent
    .html(null)
    .append("svg")
    .attr("width", "100%")
    .attr("height", "100%");

  let g = svg.append("g");

  svg
    .append("g")
    .attr("class", "tidytree-ruler")
    .append("rect")
    .attr("y", -5)
    .attr("fill", "white");

  this.zoom = d3.zoom().on("zoom", () => {
    let transform = (this.transform = d3.event.transform);
    g.attr(
      "transform",
      `translate(${transform.x},${transform.y}) scale(${transform.k}) rotate(${
        this.rotation
      },${this.layout === "circular" ? 0 : this.width / 2},${
        this.layout === "circular" ? 0 : this.height / 2
      })`
    );
    updateRuler.call(this, transform);
  });
  svg.call(this.zoom);

  g.append("g").attr("class", "tidytree-links");
  g.append("g").attr("class", "tidytree-nodes");

  if (this.events.draw.length) this.events.draw.forEach(c => c());

  return this;
};

const getX = d => d.x,
  getY = d => d.y,
  getLength = d => d.weight;

let linkTransformers = {
  tree: {
    smooth: {
      horizontal: d3
        .linkHorizontal()
        .x(getY)
        .y(getX),
      vertical: d3
        .linkVertical()
        .x(getX)
        .y(getY),
      circular: d3
        .linkRadial()
        .angle(getX)
        .radius(getY)
    },
    straight: {
      horizontal: d =>
        `M${d.source.y} ${d.source.x} L ${d.target.y} ${d.target.x}`,
      vertical: d =>
        `M${d.source.x} ${d.source.y} L ${d.target.x} ${d.target.y}`,
      circular: d => {
        const startAngle = d.source.x - Math.PI / 2,
          startRadius = d.source.y,
          endAngle = d.target.x - Math.PI / 2,
          endRadius = d.target.y;
        const x0 = Math.cos(startAngle),
          y0 = Math.sin(startAngle),
          x1 = Math.cos(endAngle),
          y1 = Math.sin(endAngle);
        return (
          "M" +
          startRadius * x0 +
          "," +
          startRadius * y0 +
          "L" +
          endRadius * x1 +
          "," +
          endRadius * y1
        );
      }
    },
    square: {
      horizontal: d =>
        `M${d.source.y} ${d.source.x} V ${d.target.x} H ${d.target.y}`,
      vertical: d =>
        `M${d.source.x} ${d.source.y} H ${d.target.x} V ${d.target.y}`,
      circular: d => {
        const startAngle = d.source.x - Math.PI / 2,
          startRadius = d.source.y,
          endAngle = d.target.x - Math.PI / 2,
          endRadius = d.target.y;
        const x0 = Math.cos(startAngle),
          y0 = Math.sin(startAngle),
          x1 = Math.cos(endAngle),
          y1 = Math.sin(endAngle);
        return (
          "M" +
          startRadius * x0 +
          "," +
          startRadius * y0 +
          (endAngle === startAngle
            ? ""
            : "A" +
              startRadius +
              "," +
              startRadius +
              " 0 0 " +
              (endAngle > startAngle ? 1 : 0) +
              " " +
              startRadius * x1 +
              "," +
              startRadius * y1) +
          "L" +
          endRadius * x1 +
          "," +
          endRadius * y1
        );
      }
    }
  },
  weighted: {
    smooth: {
      horizontal: d3
        .linkHorizontal()
        .x(getLength)
        .y(getX),
      vertical: d3
        .linkVertical()
        .x(getX)
        .y(getLength),
      circular: d3
        .linkRadial()
        .angle(getX)
        .radius(getLength)
    },
    straight: {
      horizontal: d =>
        `M${d.source.weight} ${d.source.x} L ${d.target.weight} ${d.target.x}`,
      vertical: d =>
        `M${d.source.x} ${d.source.weight} L ${d.target.x} ${d.target.weight}`,
      circular: d => {
        const startAngle = d.source.x - Math.PI / 2,
          startRadius = d.source.weight,
          endAngle = d.target.x - Math.PI / 2,
          endRadius = d.target.weight;
        const x0 = Math.cos(startAngle),
          y0 = Math.sin(startAngle),
          x1 = Math.cos(endAngle),
          y1 = Math.sin(endAngle);
        return (
          "M" +
          startRadius * x0 +
          "," +
          startRadius * y0 +
          "L" +
          endRadius * x1 +
          "," +
          endRadius * y1
        );
      }
    },
    square: {
      horizontal: d =>
        `M${d.source.weight} ${d.source.x} V ${d.target.x} H ${
          d.target.weight
        }`,
      vertical: d =>
        `M${d.source.x} ${d.source.weight} H ${d.target.x} V ${
          d.target.weight
        }`,
      circular: d => {
        const startAngle = d.source.x - Math.PI / 2,
          startRadius = d.source.weight,
          endAngle = d.target.x - Math.PI / 2,
          endRadius = d.target.weight;
        const x0 = Math.cos(startAngle),
          y0 = Math.sin(startAngle),
          x1 = Math.cos(endAngle),
          y1 = Math.sin(endAngle);
        return (
          "M" +
          startRadius * x0 +
          "," +
          startRadius * y0 +
          (endAngle === startAngle
            ? ""
            : "A" +
              startRadius +
              "," +
              startRadius +
              " 0 0 " +
              (endAngle > startAngle ? 1 : 0) +
              " " +
              startRadius * x1 +
              "," +
              startRadius * y1) +
          "L" +
          endRadius * x1 +
          "," +
          endRadius * y1
        );
      }
    }
  }
};

linkTransformers.dendrogram = linkTransformers.tree;

/**
 * Calculate the coordinates of a point transformed onto a circle.
 *
 * @param {number} x - The x-coordinate of the center of the point.
 * @param {number} y - The y-coordinate of the center of the point.
 * @return {Array<number>} The new x and y coordinates of the point on the circle.
 */
function circularPoint(x, y) {
  return [(y = +y) * Math.cos((x -= Math.PI / 2)), y * Math.sin(x)];
}

let nodeTransformers = {
  tree: {
    horizontal: d => `translate(${d.y}, ${d.x})`,
    vertical: d => `translate(${d.x}, ${d.y})`,
    circular: d => `translate(${circularPoint(d.x, d.y)})`
  },
  weighted: {
    horizontal: d => `translate(${d.weight}, ${d.x})`,
    vertical: d => `translate(${d.x}, ${d.weight})`,
    circular: d => `translate(${circularPoint(d.x, d.weight)})`
  }
};

nodeTransformers.dendrogram = nodeTransformers.tree;

/**
 * Finds the color of a given node based on the color options provided.
 *
 * @param {Object} node - The node for which to find the color.
 * @param {Object} colorOptions - The color options object containing the color mode, node list, default color, and highlight color.
 * @return {string} The color of the node.
 */
function findNodeColor(node, colorOptions) {
  if (colorOptions.nodeColorMode === "none") {
    // steelblue
    return colorOptions.defaultNodeColor ?? "#4682B4";
  }
 
  let nodeList = colorOptions.nodeList;

  if (nodeList && nodeList.includes(node.data._guid)) {
    // yellowish
    return colorOptions.highlightColor ?? "#feb640";
  } else {
    // charcoal
    return colorOptions.defaultNodeColor ?? "#243127";
  }
}

/**
 * Find the color of a given link based on the provided color options.
 *
 * @param {string} link - The link for which to find the color.
 * @param {object} colorOptions - The options for different link colors.
 * @return {string} The color of the link.
 */
function findBranchColor(link, colorOptions) {
  if (colorOptions.branchColorMode === "none") {
    // light gray
    return colorOptions.defaultBranchColor ?? "#cccccc";
  }
  
  let source = link.source;
  let childLeafNodes = getAllLeaves(source);
  
  let allChildLeafNodesInNodeList = childLeafNodes.every(child =>
    colorOptions.nodeList?.includes(child.data._guid)
  );
 
  if (allChildLeafNodesInNodeList) {
    // yellowish
    return colorOptions.highlightColor ?? "#feb640";
  }

  return colorOptions.defaultBranchColor ?? "#cccccc";
}

/**
 * Returns an array of all the child leaf nodes of the given node in a tree.
 *
 * @param {Object} node - A node of the tree.
 * @param {boolean} includeSelf - Whether to include the given node itself as a leaf node. Defaults to false.
 * @return {Array} An array of leaf nodes.
 */
function getAllLeaves(node, includeSelf) {
  includeSelf = includeSelf ?? false;
  let leaves = [];

  if (includeSelf && node.height === 0) {
    leaves.push(node);
  } else {
    node.children.forEach(child => {
      leaves.push(...getAllLeaves(child, true));
    });
  }

  return leaves;
}

const radToDeg = 180 / Math.PI;

let labelTransformers = {
  tree: {
    straight: {
      horizontal: l =>
        `translate(${(l.source.y + l.target.y) / 2}, ${(l.source.x +
          l.target.x) /
          2}) rotate(${Math.atan(
          (l.target.x - l.source.x) / (l.target.y - l.source.y)
        ) * radToDeg})`,
      vertical: l =>
        `translate(${(l.source.x + l.target.x) / 2}, ${(l.source.y +
          l.target.y) /
          2}) rotate(${Math.atan(
          (l.source.y - l.target.y) / (l.source.x - l.target.x)
        ) * radToDeg})`,
      circular: l => {
        let s = circularPoint(l.source.x, l.source.y),
          t = circularPoint(l.target.x, l.target.y);
        return `translate(${(s[0] + t[0]) / 2}, ${(s[1] + t[1]) /
          2}) rotate(${Math.atan((s[1] - t[1]) / (s[0] - t[0])) * radToDeg})`;
      }
    },
    square: {
      horizontal: l =>
        `translate(${(l.source.y + l.target.y) / 2}, ${l.target.x})`,
      vertical: l =>
        `translate(${l.target.x}, ${(l.source.y + l.target.y) / 2}) rotate(90)`,
      circular: l => {
        let u = circularPoint(l.target.x, (l.source.y + l.target.y) / 2);
        return `translate(${u[0]}, ${u[1]}) rotate(${((l.target.x * radToDeg) %
          180) -
          90})`;
      }
    }
  },
  weighted: {
    straight: {
      horizontal: l =>
        `translate(${(l.source.weight + l.target.weight) / 2}, ${(l.source.x +
          l.target.x) /
          2}) rotate(${Math.atan(
          (l.target.x - l.source.x) / (l.target.weight - l.source.weight)
        ) * radToDeg})`,
      vertical: l =>
        `translate(${(l.source.x + l.target.x) / 2}, ${(l.source.weight +
          l.target.weight) /
          2}) rotate(${Math.atan(
          (l.source.weight - l.target.weight) / (l.source.x - l.target.x)
        ) * radToDeg})`,
      circular: l => {
        let s = circularPoint(l.source.x, l.source.weight),
          t = circularPoint(l.target.x, l.target.weight);
        return `translate(${(s[0] + t[0]) / 2}, ${(s[1] + t[1]) /
          2}) rotate(${Math.atan((s[1] - t[1]) / (s[0] - t[0])) * radToDeg})`;
      }
    },
    square: {
      horizontal: l => `
        translate(${(l.source.weight + l.target.weight) / 2}, ${l.target.x})
      `,
      vertical: l => `
        translate(${l.target.x}, ${(l.source.weight + l.target.weight) / 2})
        rotate(90)
      `,
      circular: l => {
        let u = circularPoint(
          l.target.x,
          (l.source.weight + l.target.weight) / 2
        );
        return `
          translate(${u[0]}, ${u[1]})
          rotate(${((l.target.x * radToDeg) % 180) - 90})
        `;
      }
    }
  }
};
labelTransformers.tree.smooth = labelTransformers.tree.straight;
labelTransformers.weighted.smooth = labelTransformers.weighted.straight;
labelTransformers.dendrogram = labelTransformers.tree;

function labeler(d) {
  if (!d.target.data.length) return "0.000";
  return d.target.data.length.toFixed(3);
}

/**
 * Redraws the links and relocates the nodes accordingly
 * @return {TidyTree} The TidyTree Object
 */
TidyTree.prototype.redraw = function () {
  let parent = this.parent;

  this.width  = (parseFloat(parent.style("width" )) - this.margin[1] - this.margin[3]     ) * this.hStretch;
  this.height = (parseFloat(parent.style("height")) - this.margin[0] - this.margin[2] - 25) * this.vStretch;

  this.scalar =
    this.layout === "horizontal" ? this.width :
    this.layout === "vertical" ? this.height :
    Math.min(this.width, this.height) / 2;

  this.hierarchy.each(d => (d.weight = this.scalar * d.value));

  let g = parent.select("svg g");

  let source = (this.type === "tree" ? d3.tree() : d3.cluster()).size(
    this.layout === "circular"   ? [2 * Math.PI, Math.min(this.height, this.width) / 2] :
    this.layout === "horizontal" ? [this.height, this.width] :
    [this.width, this.height]
  );

  if (this.equidistantLeaves) {
    if (this.layout === "circular") {
      source.separation((a,b) => 1 / a.depth);
    } else {
      source.separation((a,b) => 1);
    }
  } else {
    if (this.layout === "circular")
      source.separation((a, b) => (a.parent == b.parent ? 1 : 2) / a.depth);
  }
  
  //Note: You must render links prior to nodes in order to get correct placement!
  let links = g
    .select("g.tidytree-links")
    .selectAll("g.tidytree-link")
    .data(source(this.hierarchy).links(), l => l.source.data._guid + ':' + l.target.data._guid);

  links.join(
    enter => {
      let newLinks = enter.append("g").attr("class", "tidytree-link");

      let linkTransformer = linkTransformers[this.type][this.mode][this.layout];
      console.log(linkTransformer);
      console.log(newLinks);
      newLinks
        .append("path")
        .attr("fill", "none")
        .attr("stroke", d => findBranchColor(d, this.colorOptions))
        .attr("d", linkTransformer)
        .transition()
        .duration(this.animation)
        .attr("opacity", 1);

      let labelTransformer = labelTransformers[this.type][this.mode][this.layout];
      newLinks
        .append("text")
        .attr("y", 2)
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .text(labeler)
        .attr("transform", labelTransformer)
        .transition()
        .duration(this.animation)
        .style("opacity", this.branchDistances ? 1 : 0);
    },
    update => {
      let linkTransformer = linkTransformers[this.type][this.mode][this.layout];
      let paths = update.select("path");
      if (!this.animation > 0) {
        paths
        .attr("d", linkTransformer)
        .attr("stroke", d => findBranchColor(d, this.colorOptions));
      } else {
        paths
          .transition()
          .duration(this.animation / 2)
          .attr("stroke", d => findBranchColor(d, this.colorOptions))
          .attr("opacity", 0)
          .end()
          .then(() => {
            paths
              .attr("d", linkTransformer)
              .transition()
              .duration(this.animation / 2)
              .attr("opacity", 1);
          });
      }

      let labelTransformer =
        labelTransformers[this.type][this.mode][this.layout];
      let labels = update.select("text");
      if (this.animation) {
        labels
          .transition()
          .duration(this.animation / 2)
          .style("opacity", 0)
          .end()
          .then(() => {
            labels.text(labeler).attr("transform", labelTransformer);
            if (this.branchDistances) {
            labels
              .transition()
              .duration(this.animation / 2)
              .style("opacity", this.branchDistances ? 1 : 0);
            }
          });
      } else {
        labels.text(labeler).attr("transform", labelTransformer);
      }
    },
    exit =>
      exit
        .transition()
        .duration(this.animation)
        .attr("opacity", 0)
        .remove()
  );

  let nodes = g
    .select("g.tidytree-nodes")
    .selectAll("g.tidytree-node")
    .data(this.hierarchy.descendants(), d => d.data._guid);
  nodes.join(
    enter => {
      let nt = nodeTransformers[this.type][this.layout];
      let newNodes = enter
        .append("g")
        .attr("class", "tidytree-node")
        .classed("tidytree-node-internal", d => d.children)
        .classed("tidytree-node-leaf", d => !d.children)
        .attr("transform", nt);

      newNodes
        .append("circle")
        .attr("title", d => d.data.id)
        .style("opacity", d =>
          (d.children && this.branchNodes) ||
          (!d.children && this.leafNodes) ? 1 : 0
        )
        .style("fill", d => findNodeColor(d, this.colorOptions))
        .on("mouseenter focusin", d => this.trigger("showtooltip", d))
        .on("mouseout focusout", d => this.trigger("hidetooltip", d))
        .on("contextmenu", d => this.trigger("contextmenu", d))
        .on("click", d => this.trigger("select", d))
        .attr("r", 2.5);

      let nodeLabels = newNodes
        .append("text")
        .text(d => d.data.id)
        .style("font-size", "12px")
        .attr("y", 2)
        .style("opacity", d =>
          ( d.children && this.branchLabels) ||
          (!d.children && this.leafLabels) ? 1 : 0
        );

      if (this.layout === "vertical") {
        nodeLabels
          .attr("text-anchor", "start")
          .attr("x", 5)
          .transition()
          .duration(this.animation)
          .attr("transform", "rotate(90)");
      } else if (this.layout === "horizontal") {
        nodeLabels
          .attr("text-anchor", "start")
          .attr("x", 5)
          .transition()
          .duration(this.animation)
          .attr("transform", "rotate(0)");
      } else {
        nodeLabels
          .transition()
          .duration(this.animation)
          .attr("transform", l => `rotate(${(((l.x / Math.PI) * 180) % 180) - 90})`)
          .attr("text-anchor", l => l.x % (2 * Math.PI) > Math.PI ? "end" : "start")
          .attr("x", l => (l.x % (2 * Math.PI) > Math.PI ? -5 : 5));
      }

      newNodes
        .transition()
        .duration(this.animation)
        .attr("opacity", 1);
    },
    update => {
      let nodeTransformer = nodeTransformers[this.type][this.layout];
      update
        .transition()
        .duration(this.animation)
        .attr("transform", nodeTransformer);

      let nodeGlyphs = update.select("circle");
      nodeGlyphs.style("fill", d => findNodeColor(d, this.colorOptions));      

      let nodeLabels = update.select("text");
      if (this.layout === "vertical") {
        nodeLabels
          .attr("text-anchor", "start")
          .attr("x", 5)
          .transition()
          .duration(this.animation)
          .attr("transform", "rotate(90)");
      } else if (this.layout === "horizontal") {
        nodeLabels
          .attr("text-anchor", "start")
          .attr("x", 5)
          .transition()
          .duration(this.animation)
          .attr("transform", "rotate(0)");
      } else {
        nodeLabels
          .transition()
          .duration(this.animation)
          .attr("transform", l => `rotate(${(((l.x / Math.PI) * 180) % 180) - 90})`)
          .attr("text-anchor", l => l.x % (2 * Math.PI) > Math.PI ? "end" : "start")
          .attr("x", l => (l.x % (2 * Math.PI) > Math.PI ? -5 : 5));
      }
    },
    exit =>
      exit
        .transition()
        .duration(this.animation)
        .attr("opacity", 0)
        .remove()
  );

  updateRuler.call(this);

  return this;
};

function updateRuler(transform) {
  if (!transform) transform = { k: 1 };
  let height = parseFloat(this.parent.style("height")) - this.margin[2] - 5;
  let ruler = this.parent.select("g.tidytree-ruler");
  let bg = ruler.select("rect");
  if (this.ruler) {
    if (this.layout == "horizontal") {
      ruler.attr("transform", `translate(${this.margin[3]}, ${height})`);
      bg
        .attr("width", `calc(100% - ${this.margin[1] + this.margin[3] - 15}px)`)
        .attr("height", "25px")
        .attr("x", -5);
    } else {
      ruler.attr("transform", `translate(${this.margin[3] - 10}, ${this.margin[0]})`);
      bg
        .attr("height", `calc(100% - ${this.margin[0] + this.margin[2] - 15}px)`)
        .attr("width", "25px")
        .attr("x", -25);
    }
    let axis = this.layout == "horizontal" ? d3.axisBottom() : d3.axisLeft();
    if (this.type === "tree" && this.layout !== "circular") {
      ruler
        .attr("opacity", 1)
        .call(
          axis.scale(
            d3.scaleLinear(
              [0, this.hierarchy.height / transform.k],
              [0, this.scalar]
            )
          )
        );
    } else if (this.type === "weighted" && this.layout !== "circular") {
      ruler
        .attr("opacity", 1)
        .call(
          axis.scale(
            d3.scaleLinear(
              [this.range[0], this.range[1] / transform.k],
              [0, this.scalar]
            )
          )
        );
    } else {
      ruler
        .transition()
        .duration(this.animation)
        .attr("opacity", 0);
    }
  } else {
    ruler
      .transition()
      .duration(this.animation)
      .attr("opacity", 0);
  }
}

/**
 * Recenters the tree in the center of the view
 * @return {TidyTree} The TidyTree object
 */
TidyTree.prototype.recenter = function () {
  let svg = this.parent.select("svg"),
    x = this.margin[0],
    y = this.margin[3];
  if (this.layout === "circular") {
    x += parseFloat(svg.style("width")) / 2;
    y += parseFloat(svg.style("height")) / 2;
  }
  svg
    .transition()
    .duration(this.animation)
    .call(this.zoom.transform, d3.zoomIdentity.translate(x, y));
  return this;
};

/**
 * Set the TidyTree's layout
 * @param {String} newLayout The new layout
 * @return {TidyTree} The TidyTree Object
 */
TidyTree.prototype.setLayout = function (newLayout) {
  if (!TidyTree.validLayouts.includes(newLayout)) {
    throw Error(`
      Cannot set TidyTree to layout: ${newLayout}\n
      Valid layouts are: ${TidyTree.validLayouts.join(', ')}
    `);
  }
  this.layout = newLayout;
  if (this.parent) return this.redraw();
  return this;
};

/**
 * Set the TidyTree's colorOptions
 * @param {Object} newColorOptions The new colorOptions
 * @return {TidyTree} The TidyTree Object
 */
TidyTree.prototype.setColorOptions = function (newColorOptions) {
  if (!TidyTree.validNodeColorModes.includes(newColorOptions.nodeColorMode)) {
    throw Error(`
      Cannot set TidyTree colorOptions: ${newColorOptions.nodeColorMode}\n
      Valid nodeColorModes are: ${TidyTree.validNodeColorModes.join(', ')}
    `);
  }
  if (!TidyTree.validBranchColorModes.includes(newColorOptions.branchColorMode)) {
    throw Error(`
      Cannot set TidyTree colorOptions: ${newColorOptions.branchColorMode}\n
      Valid branchColorModes are: ${TidyTree.validBranchColorModes.join(', ')}
    `);
  }

  if (newColorOptions.nodeColorMode === 'list') {
    if (!Array.isArray(newColorOptions.nodeList)) {
      throw Error('nodeList must be an array for nodeColorMode "list"');
    }
  } else {
    // nodeColorMode === 'none'
    if (newColorOptions.branchColorMode !== 'none') {
      throw Error('branchColorMode must be "none" for nodeColorMode "none"');
    }
  }

  this.colorOptions = newColorOptions;
  if (this.parent) return this.redraw();
  return this;
}

/**
 * Set the TidyTree's mode
 * @param {String} newMode The new mode
 * @return {TidyTree} The TidyTree object
 */
TidyTree.prototype.setMode = function (newMode) {
  if (!TidyTree.validModes.includes(newMode)) {
    throw Error(`
      Cannot set TidyTree to mode: ${newMode},\n
      Valid modes are: ${TidyTree.validModes.join(', ')}
    `);
  }
  this.mode = newMode;
  if (this.parent) return this.redraw();
  return this;
};

/**
 * Set the TidyTree's type
 * @param {Boolean} newType The new type
 * @return {TidyTree} the TidyTree object
 */
TidyTree.prototype.setType = function (newType) {
  if (!TidyTree.validTypes.includes(newType)) {
    throw Error(`
      Cannot set TidyTree to type: ${newType},\n
      Valid types are: ${TidyTree.validTypes.join(', ')}
    `);
  }
  this.type = newType;
  if (this.parent) return this.redraw();
  return this;
};

/**
 * Set the TidyTree's rotation
 * @param {Number} degrees The new number of degrees by which to rotate the tree
 * @return {TidyTree} the TidyTree object
 */
TidyTree.prototype.setRotation = function (degrees) {
  this.rotation = degrees;
  if (this.parent)
    this.parent
      .select("svg g")
      .attr("transform", `
        translate(${this.transform.x},${this.transform.y})
        scale(${this.transform.k})
        rotate(${this.rotation},
          ${this.layout === "circular" ? 0 : this.width / 2},
          ${this.layout === "circular" ? 0 : this.height / 2}
        )
      `);
  return this;
};

/**
 * Set the TidyTree's Horizontal Stretch
 * @param {Number} proportion The new proportion by which to stretch the tree
 * @return {TidyTree} the TidyTree object
 */
TidyTree.prototype.setHStretch = function (proportion) {
  this.hStretch = parseFloat(proportion);
  if (this.parent) {
    let animCache = this.animation;
    this.setAnimation(0);
    this.redraw();
    this.setAnimation(animCache);
  }
  return this;
};

/**
 * Set the TidyTree's Vertical Stretch
 * @param {Number} proportion The new proportion by which to stretch the tree
 * @return {TidyTree} the TidyTree object
 */
TidyTree.prototype.setVStretch = function (proportion) {
  this.vStretch = parseFloat(proportion);
  if (this.parent) {
    let animCache = this.animation;
    this.setAnimation(0);
    this.redraw();
    this.setAnimation(animCache);
  }
  return this;
};

/**
 * Set the TidyTree's animation time. Note that this does not trigger a
 * redraw.
 * @param {number} time The desired duration of an animation, in ms. Set to 0
 * to turn animations off completely.
 * @return {TidyTree} The TidyTree object
 */
TidyTree.prototype.setAnimation = function (time) {
  this.animation = time;
  return this;
};

/**
 * Shows or hides the Branch Nodes
 * @param  {Boolean} show Should Branch nodes be shown?
 * @return {TidyTree} the TidyTree object
 */
TidyTree.prototype.setBranchNodes = function (show) {
  this.branchNodes = show ? true : false;
  if (this.parent) {
    //i.e. has already been drawn
    this.parent
      .select("svg")
      .selectAll("g.tidytree-node-internal circle")
      .transition()
      .duration(this.animation)
      .style("opacity", show ? 1 : 0);
  }
  return this;
};

/**
 * Restyles Leaf Nodes
 * @param  {Function} styler A function that restyles each node. `styler`
 * receives a reference to the DOM node to be styled, and an associated data
 * object.
 * @return {TidyTree} the TidyTree Object
 */
TidyTree.prototype.eachBranchNode = function (styler) {
  if (!this.parent)
    throw Error(
      "Tree has not been rendered yet! Can't style Nodes that don't exist!"
    );
  this.parent
    .select("svg")
    .selectAll("g.tidytree-node-internal circle")
    .each(function (d) { styler(this, d); });
  return this;
};

/**
 * Set the TidyTree's branchLabels
 * @param  {Boolean} show Should the TidyTree show branchLabels?
 * @return {TidyTree}     the TidyTree Object
 */
TidyTree.prototype.setBranchLabels = function (show) {
  this.branchLabels = show ? true : false;
  if (this.parent) {
    //i.e. has already been drawn
    this.parent
      .select("svg")
      .selectAll("g.tidytree-node-internal text")
      .transition()
      .duration(this.animation)
      .style("opacity", show ? 1 : 0);
  }
  return this;
};

/**
 * Restyles Branch Label
 * @param  {Function} styler A function that restyles each node. `styler`
 * receives a reference to the DOM node to be styled, and an associated data
 * object.
 * @return {TidyTree} the TidyTree Object
 */
TidyTree.prototype.eachBranchLabel = function (styler) {
  if (!this.parent){
    throw Error("Tree has not been rendered yet! Can't style Nodes that don't exist!");
  }
  this.parent
    .select("svg")
    .selectAll("g.tidytree-node-internal text")
    .each(function (d, i, l) { styler(this, d); });
  return this;
};

/**
 * Shows or hides the TidyTree's branch labels
 * @param {Boolean} show Should the TidyTree show branch distances?
 * @return {TidyTree} The TidyTree Object
 */
TidyTree.prototype.setBranchDistances = function (show) {
  this.branchDistances = show ? true : false;
  if (this.parent) {
    //i.e. has already been drawn
    let links = this.parent
      .select("svg g.tidytree-links")
      .selectAll("g.tidytree-link")
      .selectAll("text");
    links.attr("transform", labelTransformers[this.type][this.mode][this.layout]);
    links
      .transition()
      .duration(this.animation)
      .style("opacity", show ? 1 : 0);
  }
  return this;
};

/**
 * Restyles Branch Distances
 * @param  {Function} styler A function that restyles each node. `styler`
 * receives a reference to the DOM node to be styled, and an associated data
 * object.
 * @return {TidyTree} the TidyTree Object
 */
TidyTree.prototype.eachBranchDistance = function (styler) {
  if (!this.parent)
    throw Error("Tree has not been rendered yet! Can't style Nodes that don't exist!");
  this.parent
    .select("svg g.tidytree-links")
    .selectAll("g.tidytree-link")
    .selectAll("text")
    .each(function (d, i, l) { styler(this, d); });
  return this;
};

/**
 * Shows or Hides the Leaf Nodes
 * @param  {Boolean} show Should leaf nodes be visible?
 * @return {TidyTree} The TidyTree Object
 */
TidyTree.prototype.setLeafNodes = function (show) {
  this.leafNodes = show ? true : false;
  if (this.parent) {
    //i.e. has already been drawn
    this.parent
      .select("svg")
      .selectAll("g.tidytree-node-leaf circle")
      .transition()
      .duration(this.animation)
      .style("opacity", show ? 1 : 0);
  }
  return this;
};

/**
 * Restyles Leaf Nodes
 * @param  {Function} styler A function that restyles each node. `styler`
 * receives a reference to the DOM node to be styled, and an associated data
 * object.
 * @return {TidyTree} the TidyTree Object
 */
TidyTree.prototype.eachLeafNode = function (styler) {
  if (!this.parent){
    throw Error("Tree has not been rendered yet! Can't style Nodes that don't exist!");
  }
  this.parent
    .select("svg")
    .selectAll("g.tidytree-node-leaf circle")
    .each(function (d) {
      styler(this, d);
    });
  return this;
};

/**
 * Set the TidyTree's leaves to be equidistant
 */
TidyTree.prototype.setEquidistantLeaves = function (isEquidistant) {
  this.equidistantLeaves = isEquidistant ? true : false;

  if (this.parent) return this.redraw();
  return this;
}

/**
 * Shows or Hides the TidyTree's Leaf Labels
 * @param  {Boolean} show Should the TidyTree show leafLabels?
 * @return {TidyTree}     the TidyTree Object
 */
TidyTree.prototype.setLeafLabels = function (show) {
  this.leafLabels = show ? true : false;
  if (this.parent) {
    //i.e. has already been drawn
    this.parent
      .select("svg")
      .selectAll("g.tidytree-node-leaf text")
      .transition()
      .duration(this.animation)
      .style("opacity", show ? 1 : 0);
  }
  return this;
};

/**
 * Restyles Leaf Labels
 * @param  {Function} styler A function that restyles each node. `styler`
 * receives a reference to the DOM node to be styled, and an associated data
 * object.
 * @return {TidyTree} the TidyTree Object
 */
TidyTree.prototype.eachLeafLabel = function (styler) {
  if (!this.parent){
    throw Error("Tree has not been rendered yet! Can't style Nodes that don't exist!");
  }
  this.parent
    .select("svg")
    .selectAll("g.tidytree-node-leaf text")
    .each(function (d) { styler(this, d); });
  return this;
};

/**
 * Shows or hides the TidyTree's branch labels
 * @param {Boolean} show Should the TidyTree show branchLabels?
 * @return {TidyTree} The TidyTree Object
 */
TidyTree.prototype.setRuler = function (show) {
  this.ruler = show ? true : false;
  if (this.parent) {
    //i.e. has already been drawn
    if (show) {
      this.parent
        .select("g.tidytree-ruler")
        .transition()
        .duration(this.animation)
        .attr("opacity", 1);
    } else {
      this.parent
        .select("g.tidytree-ruler")
        .transition()
        .duration(this.animation)
        .attr("opacity", 0);
    }
  }
  return this;
};

/**
 * Retrieves the GUIDs of the nodes in the TidyTree instance.
 *
 * @param {boolean} leavesOnly - Whether to retrieve GUIDs only for leaf nodes.
 * @param {function} predicate - A function that returns true if the node should be included
 * @return {Array} An array of GUIDs of the nodes.
 */
TidyTree.prototype.getNodeGUIDs = function (leavesOnly, predicate) {
  let nodeList = this.parent
    .select("svg")
    .selectAll("g.tidytree-node-leaf circle")
    ._groups[0];

  if (!leavesOnly) {
    nodeList = this.parent
      .select("svg")
      .selectAll("g.tidytree-node-leaf circle, g.tidytree-node-internal circle")
      ._groups[0];
  }

  let nodeGUIDs = [];
  for (const node of nodeList.values()) {
    if (!predicate || predicate(node)) {
      nodeGUIDs.push(node.__data__.data._guid);
    }
  }

  return nodeGUIDs;
}

/**
 * Searches the tree, returns Search Results
 * @param  {Function} test A function which takes a Branch and returns a Truthy
 * or Falsy value.
 * @return {Array} The array of results
 */
TidyTree.prototype.search = function (test) {
  if (!test) return;
  let results = this.parent
    .select("svg g.tidytree-nodes")
    .selectAll("g.tidytree-node")
    .filter(test);
  if (this.events.search.length) this.events.search.forEach(c => c(results));
  return results;
};

/**
 * Attaches a new event listener
 * Please note that this is not yet functioning.
 * @param  {String}   events   A space-delimited list of event names
 * @param  {Function} callback The function to run when one of the `events` occurs.
 * @return {TidyTree} The TidyTree on which this method was called.
 */
TidyTree.prototype.on = function (events, callback) {
  events.split(" ").forEach(event => this.events[event].push(callback));
  return this;
};

/**
 * Removes all event listeners from the given events
 * @param  {String}   events   A space-delimited list of event names
 * @return {TidyTree} The TidyTree on which this method was called.
 */
TidyTree.prototype.off = function (events) {
  events.split(" ").forEach(event => (this.events[event] = []));
  return this;
};

/**
 * Forces the tree to respond as though an `event` has occurred
 * @param  {String} events space-delimited list of names of events to trigger.
 * @param  {Spread} args Any arguments which should be passed to the event
 * handler(s).
 * @return The output of the callback run on `event`
 */
TidyTree.prototype.trigger = function (events, ...args) {
  return events.split(" ").map(event => {
    if (this.events[event].length)
      return this.events[event].map(handler => handler(args));
    return [];
  });
};

/**
 * Destroys the TidyTree
 * @return {undefined}
 */
TidyTree.prototype.destroy = function () {
  if (this.parent) {
    //i.e. has already been drawn
    this.parent.html(null);
  }
  delete this; //Go to work, GC!
};
