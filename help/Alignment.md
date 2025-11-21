_Alignment_ refers to the process of matching each base (or gap) of a sequence (i.e. one collected from laboratory samples) to a base (or gap) of another known sequence (called a _reference_).

## How Alignment Works

For example, let's discuss HIV. 95% of HIV cases in the US are HIV-1 subtype, for which there is a canonical reference sequence. This sequence is called **HXB2**.

## MicrobeTrace is not intended to be an aligner

In spite of the fact that MicrobeTrace is capable of performing rudimentary alignments on sequences, this has never been its principal application. Accordingly, the best results from MicrobeTrace are likeliest to follow from using it with sequences which have been aligned by a capable bioinformaticist in [another program](https://en.wikipedia.org/wiki/List_of_sequence_alignment_software). However, we have attempted to make the aligner straightforward to use and test.

The first thing to be aware of is the the included aligner uses HXB2 as its reference by default. If you are using MicrobeTrace to analyze sequences from other pathogens or organisms, **YOU MUST PROVIDE YOUR OWN REFERENCE SEQUENCE**. We cannot emphasize this strongly enough. Aligning non-HIV sequences to HXB2 will produce nonsense, and MicrobeTrace cannot tell the difference between HIV and non-HIV sequences to warn you.
See image below to see reference selection options and preview

![ Settings before loading a FASTA file](https://i.ibb.co/PFKDngY/Seq-file-Smith-Watermanpreview.jpg)


Second, the MicrobeTrace aligner has been tuned to the peculiarities of HIV. These may be acceptable for your use case, but you should try modifying the settings to see.

## Interpreting sequence diagrams

A sequence diagram is a simple visualization designed to show you, at a glance, if your alignment is satisfactory. In general, it is a table of colored cells in which each row represents a sequence, and each column represents a nucleotide location in the sequence. So, for example:

![](https://i.imgur.com/UukV173.png)

(Note: this was taken directly from MicrobeTrace using the Aligner "Preview" button.)

Here we can see that columns of reasonably consistent colors represent nucleotides that are well-aligned relative to each other.

## Turning the knobs

One reason we're so cautious about alignments is that it is the only place in the MicrobeTrace workflow where a mis-calibrated option can lead to erroneous conclusions in every other vestige of the application. For example, here is a set of sequences which has been aligned using exceedingly poor configurations:

![A horrible alignment](https://i.imgur.com/0CHxIA2.png)

While you can see that the sequences sort-of line up, the computer cannot. What it sees is that at any given point, the sequences don't match, and it penalizes them accordingly. This alignment is so harmful to the analytic product, it is likely that the analysis would be more accurate with no alignment at all.

![A bad alignment](https://i.imgur.com/F3Mv6AW.png)

Here we have a much better alignment. This is a typical default configuration for this algorithm (though not MicrobeTrace's default). However, we can still see some bases being dropped in unsequenced regions and, more alarmingly, some sequences near the bottom showing slight shifts, which are very bad. However, the net effects may be within the bounds of analytic accuracy. Your mileage may vary.

![A good alignment](https://i.imgur.com/UukV173.png)

Finally, this is a good alignment. We can discern clear columns, and it does not look like any row in the diagram is systematically shifted one direction or the other, relative to its neighbors. This is the alignment using MicrobeTrace's default settings.

Please note that while the default settings created the best alignment, this is the from the use case for which MicrobeTrace's aligner was specifically designed. Again, your mileage may vary. I strongly encourage you to change the default settings and test them using the "Preview" feature.

Below is an image of how a FASTA file looks in the sequence view. This view can be used to double check the integrity of your alignment.

![Sequence view- shows alignment as well as options for settings changes](https://i.ibb.co/5nQVRTr/Sequences-settings-view.jpg)