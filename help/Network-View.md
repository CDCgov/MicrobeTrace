The default view of the data loaded by MicrobeTrace is the Network view. Immediately after loading the data, you should see a network appear on-screen. From this view, you can:

* pan around, and zoom in and out,
* hover over nodes to see their IDs,
* click to select or de-select individual nodes,
* Ctrl-click to select multiple nodes, and
* right-click nodes to get a context menu, allowing you to copy a node's ID or sequence (if known).

## Network Configuration
You can modify multiple visual characteristics of the displayed network. First we will describe the Global Settings menu, and then describe settings specific to nodes, links and networks.
The Global Settings menu is accessed by selecting Settings on the main menu bar in the upper left window. This menu option has two tabs: the Filtering tab, used to modify cut-off values and other features of the network, and the Styling tab used to color nodes, links and background.
 
## Filtering
This tab lets you set thresholds, prune links, show or hide singletons (nodes that are not connected to any others), and show or hide the network statistics that are automatically generated during the analysis and shown in the box in the lower right of the window.

### Filtering Threshold 
Genetic links or edges are typically generated using a defined nucleotide distance cut-off. For HIV-1 pol sequences, the default is 0.015 nucleotide substitutions/site (genetic distance of 1.5%), which represents ~15 years of combined intra-host viral evolution in a mono-infected person. Depending on your data, you can increase or decrease this threshold either by using the arrows, or by using the mini histogram peaks generated from your data. If you use the histogram, simply use your pointer to select the bar in the histogram you wish to use as the cutoff. Oftentimes, the cutoff is the threshold that best segregates a bi-modal distribution of the genetic distances. You can determine how this affects the network structure (e.g., a higher, or less stringent cutoff value will link more nodes and a lower, more stringent cutoff will prune links from the network)
### Filter Links On 
You can also choose other variables to filter links; the number of single nucleotide polymorphisms (SNPs), for example, if that information was included in your data.

## Node and Link Settings
Select the Toggle Network Settings icon mentioned earlier to display a context menu. You can choose from three tabs: “Nodes”, “Links”, or “Network” to adjust the settings of the various network components.  Using your mouse, hover over each property name to see what it represents.

## Node Properties 
### Labels and tooltips 
You can change labels and tooltips of the node by selecting from drop down menus for each parameter. You can use the slider bar to change label size.
### Shape and size 
You can select Shapes and Sizes to map shapes to the nodes and change sizes of the nodes to demographic characteristics picked from the drop down menu. In Fig. 25, shapes have been mapped to risk factor, and a key for the shapes used for each risk factor in the data is displayed in the top right corner of the window.
### Colors
Selecting the Colors button takes you to the styling tab of the Global Settings menu where you can use drop down menus to map the color of nodes or links to demographic data. You can also change background color. 

Below is an image of a 2 D network with settings buttons circled. 

![2D network with settings buttons circled](https://i.ibb.co/xMbmLf2/2-D-network-4icons.jpg)

Below is a 2D network with node label set to ID, and nodes colored by risk factor. See key on top right corner.

![](https://i.ibb.co/njm2KJc/2-D-colors-colorednodes-IDlabels.jpg)




