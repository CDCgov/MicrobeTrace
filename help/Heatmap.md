If you started with a FASTA file, MicrobeTrace offers a heatmap visualization.

To see it, click on "View" the Menu bar (at the top of the screen), and then "Heatmap". This will open a new window. Note that rendering the heatmap may take a moment, during which the window will appear blank. Once the computation is completed, the heatmap will appear.


## Interpreting

Each cell in the heatmap represents the genetic distance between two sequences in the dataset. The cells across the diagonal (bottom-left to top-right) represent a comparison of a sequence to itself (i.e., will have a genetic distance of zero, resulting in the visibly distinct diagonal line). The scale bar on the right of the heatmap indicates the color scheme used for the range of genetic distances in the dataset analyzed. The actual genetic distance value can be viewed by hovering the mouse pointer over the desired cell in the matrix. A pop-up bubble will show the IDs of the two sequences and their calculated genetic distance.

You can see the actual distance metric by hovering over the desired cell in the map. A popup will show the IDs of the two sequences and their distance.

## Modifying

The heatmap can be customized to suit your styling preferences. You can select the [distance metric](https://github.com/CDCgov/MicrobeTrace/wiki/Distance-Metrics) used to populate the heatmap.

By default, the heatmap shows values emanating from bottom-left to top right, but this can be reconfigured to suit your use case by inverting either or both axes.

The color scheme goes from dark blue in the low ranges to red in the high ranges, with pale yellow in the middle. This was selected for aesthetic value and color-blind accessibility, but can be changed to suit other styling preferences. Simply click on the colors in the Color scheme row and select the desired replacement.

Finally, the heat map can show axis labels. This is disabled by default because it tends to create unreadable jumbles for more than a couple dozen sequences. If you have a reasonably small number of sequences, you might prefer to show the axis labels. See figure below illustrating the features described above.

![Heatmap view with settings displayed](https://i.ibb.co/Qkvwjs1/Heatmap-settings.jpg)

## Exporting

This graphic can be saved. To do this, click the download icon on the top left corner ![download button](https://i.ibb.co/48hqq19/Buttons-download.jpg) . Use the export dialog to navigate to the desired destination and type in a filename. The heatmap graphic can be saved as either a png or jpg image file. 

![Heatmap view- exporting the image](https://i.ibb.co/gzftFZf/Heatmap-save.jpg)
