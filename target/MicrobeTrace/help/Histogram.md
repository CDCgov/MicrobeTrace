If the analysis included a FASTA file with nucleotide sequences, then the genetic distance results calculated with the TN93 nucleotide substitution model can be viewed as a histogram. Although viewing the distribution of genetic distances in the sequences is the main use of the histogram view, it can also be used with contact tracing data as an alternate visualization of the relationship between variables.
The genetic distance histogram is a bar chart that shows the frequency with which a particular genetic distance occurs in the data set. Typically, the frequency distribution in the histogram chart appears bi-modal (two peaks). One peak will contain genetic distances of very closely related sequences and the second will contain more distantly related sequences. The genetic distance which best separates these two peaks can be used to refine the genetic distance threshold selection for your specific analysis. A miniature version of this histogram is also available on the Global Settings Menu (accessed by selecting the Settings on your main MicrobeTrace window) for your convenience. You can use this feature to more easily determine genetic distance cut-off values for your data. 

### Changing histogram settings
Histogram settings can be changed by selecting the Toggle Histogram Settings button ![settings button](https://i.ibb.co/sWwdXF9/Buttons-settings.jpg) . Select the relevant variable from the pull-down menu to choose the type of links used for configuring the histogram (Fig. 43). The default histogram setting uses genetic distance as the variable, displays the frequency of the distances between all links and uses a linear scale for the distances. The genetic distances can also be plotted in linear or log scales by toggling between linear and log scales when distance is the chosen variable to plot. If you have chosen to color nodes or links by any variable in the 2D view, those same colors will be displayed in the Histogram View.
The distances on the bimodal curve can be examined to determine the genetic distance cut-off used for determining linkage of the nucleotide sequences (see genetic distance threshold in the glossary for details). If a different genetic distance cut-off value needs to be used for your specific analysis, then go to the [2D network view](https://github.com/CDCgov/MicrobeTrace/wiki/Network-View) and input this value in the genetic distance threshold under [Network Configuration](https://github.com/CDCgov/MicrobeTrace/wiki/Network-View).

Below is a histogram view with the number of links plotted against genetic distance calculated using the TN93 nucleotide substitution model

![Histogram view with number of links (Y-axis) plotted against TN93 distance (X-axis)](https://i.ibb.co/8KMdz09/Histogram-settings-TN93.jpg)




