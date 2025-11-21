A Distance Metric (in the context of MicrobeTrace) is an objective mathematical measurement of the difference between two sequences. MicrobeTrace computes two: [SNPs](#snps) and [TN93](#tn93), but can accept [link datasets](https://github.com/CDCgov/MicrobeTrace/wiki/Edge-CSVs) containing any other.

## SNPs

SNP stands for _[single-nucleotide polymorphism](https://en.wikipedia.org/wiki/Single-nucleotide_polymorphism)_. This metric represents the number of single-nucleotide polymorphisms which would be required to transform one sequence into another (assuming the two are well-aligned). In other words, it is a simple [Hamming distance](https://en.wikipedia.org/wiki/Hamming_distance) between the two sequences.

## TN93

TN93 is the default distance metric for MicrobeTrace. TN93 stands for _Tamura-Nei 1993_, itself a short reference to a [seminal paper](http://mbe.oxfordjournals.org/cgi/content/abstract/10/3/512).

> K Tamura, M Nei; Estimation of the number of nucleotide substitutions in the control region of mitochondrial DNA in humans and chimpanzees., _Molecular Biology and Evolution_, Volume 10, Issue 3, 1 May 1993, Pages 512–526, https://doi.org/10.1093/oxfordjournals.molbev.a040023
