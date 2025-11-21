One of MicrobeTrace's views is a Scatterplot. If you have two continuous variables in one of your datasets, a scatterplot is a good way to determine if they're correlated. First, pick the relevant dataset (Nodes, Links, or Clusters). Then Set the X and Y dropdowns to the two variables you wish to compare. What will appear on-screen is a scatterplot in which each circle corresponds to the entities of the dataset you've selected.

![Scatterplot of nodes. X-axis is year plotted against Y-axis which is degree](https://i.ibb.co/YRXXHfm/Scatter-plot-for-Github.jpg)

## Example

For simplicity sake, let's say you've selected "Nodes" as your dataset. This means that each node on the scatterplot has a twin on the network. Ditto in the Phylogenetic tree. (If you have the nodes colored by a variable, this should be pretty obvious.)

Now, let's select continuous variables for our axes. For X, let's suppose the dataset has a variable called "Age". For Y, let's use "Degree" (which all node datasets in MicrobeTrace will have). It's basically the number of links that connect to that node.

To read a scatterplot, start at the bottom-left corner. This corresponds to the smallest values of each variable (usually zero in both cases). As you move right across the screen, what happens to the nodes? Do the tend to get higher up? If so, we can say that "As age increases, the degree of a node also increases."