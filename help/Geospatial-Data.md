MicrobeTrace contains a small dataset of useful geographic data. This enables it to plot data points on maps, even if the location information is generic and imprecise (e.g. US State).

MicrobeTrace's geospatial data catalog includes:
* [Countries](https://github.com/CDCgov/MicrobeTrace/blob/master/data/countries.json) (Boundaries and Centroids)
* [US States](https://github.com/CDCgov/MicrobeTrace/blob/master/data/states.json) (Boundaries and Centroids)
* [US Counties](https://github.com/CDCgov/MicrobeTrace/blob/master/data/counties.json) (Boundaries and Centroids)
* [Zipcodes](https://github.com/CDCgov/MicrobeTrace/blob/master/data/zipcodes.json) (Centroids only)
* [Census Tracts](https://github.com/CDCgov/MicrobeTrace/blob/master/data/tracts.json) (Centroids only)

Nodes in the data can be displayed in a global, geographic map using Map View if geo-coordinates are included in the node file. The map allows you to zoom to the geolocation indicated in the node list. Although latitude and longitude give you the most precise location, zip codes and other geopolitical demarcations (counties, and states) are also rendered on the map if latitude longitude data is unavailable.
Select View and select Map to display the Map View, which by default will just display an empty map.

![Opening map view, settings unselected](https://i.ibb.co/Scrb8MP/Map-openingview.jpg) 


![selecting lat long from the Data tab](https://i.ibb.co/rxZbLFK/Map-settings-data-Tab-Lat-lon.jpg)


If your dataset contains latitudes and longitudes, you should select those. Selecting additional geospatial data fields will *not* improve the accuracy or precision of the map. However, if your data are incomplete (e.g., you have lat/lons for some datapoints but not for others, but zipcodes for all), then setting additional fields may increase the number of data points available to be plotted on the map. Note that these additional data points will have a different degree of accuracy than the initial set, and MicrobeTrace will make no indication to warn the user which is which (or even that this disparity exists). Thus, **MicrobeTrace should not be treated as a high-precision GIS platform.**

## Components tab 
Selecting Components will enable making changes to the actual network that will be displayed , including nodes and links. You can also choose whether to use Map View if you are online or offline (See figures below). This option will determine which features are displayed. When offline, you can choose to show or hide countries, states and counties. When online, you can choose to display either base map or satellite view layers that are not available offline in MicrobeTrace. If online and you select these options, MicrobeTrace will download the base map and satellite geographic data (called tiles) from the internet, which are similar to the Google map features. MicrobeTrace also has the capability to load GeoJSON files if you have generated data with specific location information in that file format. To add GeoJSON files into MicrobeTrace, select User-Provided, browse to the location on your computer where the file is stored, and load the file 

In the example below, we would like to visualize data by latitude and longitude. *NOTE*: The map display is hierarchical, so if your data set has all the data columns listed below, and you select multiple properties, the map displayed will default to the highest available level of geographic precision. Please ensure you select only the variable that works best for your dataset, and leave the others as None. In this example of a dataset of Atlanta area HIV-1 pol sequences, we have latitude and longitude (lat lon) information in the node list, and have selected these as the geographic parameters to use.

![Components tab of the map settings](https://i.ibb.co/p6q0r7x/Map-settings-Components-Tab.jpg)
## Nodes tab
Select Nodes to change the appearance of nodes on the map (see figure below). Nodes can be colored by any variable in your node file. Selecting Color Options opens up the Global Settings menu, and you can customize the Style settings, background, etc. as in other views. 
The transparency and jitter speed of the nodes are changed using the respective slider bars. *PLEASE NOTE: In many datasets, there can be many nodes that share the same geographic co-ordinates causing a very high node density in the map such that these nodes appears as a single large dot. In order to separate nodes with the same geographic coordinates, use the jitter slider bar to increase the jitter level to separate or jitter the nodes so they are visible.  Use Tooltip to change which variables are displayed when the mouse pointer is placed (“hovers”) over a node. For example, if you choose ID from the Tooltip drop-down menu, the node ID will be displayed when the mouse pointer is over that node.

![mapping node characteristics on map using the Nodes tab](https://i.ibb.co/XpMqLqJ/Map-settings-Nodes-Tab.jpg)

## Links tab
Select Links to change the link settings (see figure below). The features are identical to those in the Node tab. You can adjust color, transparency and tooltip settings.

![adjusting link characteristics using Links tab](https://i.ibb.co/ySXRPZz/Map-settings-Links-Tab.jpg)

MicrobeTrace displays the node data in the map based on the various options you selected. The figure below shows the map with nodes colored by risk factor, and links hidden. When viewing a map, the scroll bar on your mouse can be used to pan around or zoom in and out. By default, the map is zoomed out, and you see a circle with a number that represents the number of nodes. When you zoom in, the nodes pop out to form smaller, more discrete groups. Individual or multiple nodes can be selected or de-selected by using the mouse pointer. These selections will propagate to the Network and Table Views. This enables tracking of particular individuals between multiple visualization windows. As with other views, map images can be exported and saved as .png, .svg, or .jpg image files.

![Map view showing nodes colored by risk factor, and links are hidden](https://i.ibb.co/FmWK8vn/Map-View-node-zoom.jpg)

You could also choose to display satellite features as shown in the figure below.

![Map view showing satellite features](https://i.ibb.co/PZ4x0gw/Map-Satellite-View.jpg)









