There are essentially four types of inputs:

* [FASTA Files](https://github.com/CDCgov/MicrobeTrace/wiki/FASTA-Files),
* [Edge CSVs](https://github.com/CDCgov/MicrobeTrace/wiki/Edge-CSVs),
* [Node CSVs](https://github.com/CDCgov/MicrobeTrace/wiki/Node-CSVs), and
* [Distance Matrices]()

[Samples of all of these formats are available here.](https://github.com/CDCgov/MicrobeTrace/raw/master/demo/MicrobetraceDemoData.zip)

MicrobeTrace will theoretically render any combination of any number of these file types. In practice, however, you should generally only need one or two files: one containing either network information (like an Edgte CSV or Distance Matrix) and possibly one containing information about the individuals in the network (like a Node CSV).
