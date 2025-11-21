MicrobeTrace is intended to be a simple program based on a relatively complex biological phenomenon. This essay discusses that phenomenon.

## The Problem

Suppose you are a bioinformatician, and you get short samples from a gene in the genome sequences of three strains of a virus, which we'll call A, B, and C. (The following sequences are given in [FASTA notation](FASTA-Files).)

```FASTA
>A
AAAAAA
>B
AAAAAC
>C
AATAAC
```

Your job is to figure out how the virus is evolving.

## Elementary Bioinformatics

There are a lot of possible evolutionary pathways here. Any of these three could be the ancestor of the other two, which evolved independently. Any of the three could be the ancestor, and any of the remaining two could be and intermediary, and the final could be a descendant. They could be unrelated.

So, let's just start with a hypothesis: say, B and C both evolved from A. Is this the likeliest explanation?

Well, it only takes one mutation to transform A into B, so let's say that happens with some probability. It takes two mutations to transform A into C, so that happens with some smaller probability. However, we can observe that one of the mutations required to turn A into C is the mutation required to turn A into B. Accordingly, it is a simpler (and thus likelier to be true) explanation to propose that A is the ancestor, B is it's descendant, and C is B's descendant.

## Scaling up

This type of reasoning is fundamentally based on computing the genetic distances between sequences. The type of genetic distance in this case is called [Single Nucleotide Polymorphisms](https://github.com/CDCgov/MicrobeTrace/wiki/SNPs), but that's just the fancy name for "count of letters that changed." A and B have a distance of 1, B and C have a distance of 1, and A and C have a distance of 2. When you give MicrobeTrace a [FASTA file](FASTA-File), it does this to every pair of sequences in that file. (Note that MicrobeTrace computes SNPs, but by default uses a different genetic distance algorithm called [TN93](https://en.wikipedia.org/wiki/Models_of_DNA_evolution#TN93_model_(Tamura_and_Nei_1993)), but the general principle is similar).

We can represent this data as an [edge list](Edge-CSV), like so:

| source | target | distance |
| ------ | ------ | -------- |
| A      | B      | 1        |
| A      | C      | 2        |
| B      | C      | 1        |

Not that "source" and "target" are not meaningful in this context, and simply indicate that the column they head contains the identifier for one of the viruses.

Alternately, we can represent this data in the form of a [Distance Matrix](Distance-Matrix). The distance matrix for this network looks like this:

|   | A | B | C |
| - | - | - | - |
| A | 0 | 1 | 2 |
| B | 1 | 0 | 1 |
| C | 2 | 1 | 0 |

Sidenotes:
* See how the distance matrix includes how genetically similar the viruses are to themselves? That distance is always going to be 0.
* See how the distance matrix includes how similar A is to C, but also how similar C is to A? The difference between these two metrics isn't meaningful in our case.

MicrobeTrace enables you to do this for hundreds of nodes in seconds. But there's more:

## Elementary Epidemiology

Now let's suppose that you've just learned that these are sequences from three different people. You also learn from  interviews that Person A and Person B had some contact. The interviewers record this contact in a contact-tracing list, like so:

| source | target |
| ------ | ------ |
| A      | B      |

If you load this contact tracing list in the same MicrobeTrace session as the FASTA file for these viruses, MicrobeTrace will display information from both. The A-B Link will be one color, representing the contact trace, and the B-C link will be another color, representing genetic similarity. The investigators should thus attempt to trace contacts between person B and person C.