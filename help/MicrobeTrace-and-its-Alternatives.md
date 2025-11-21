MicrobeTrace is a tool that's trying to make a particular type of analysis easier. There are some other, similar tools trying to accomplish the same thing. Let's talk about a few of them, and compare pros and cons:

## HIV-TRACE

[HIV-TRACE](https://github.com/veg/hivtrace), or HIV-TRAnsmission Clustering Engine is a software package designed to consume a FASTA file containing HIV sequences, compute a genetic distance matrix (using the tn93 algorithm), label pairwise links between sequences according to whether they fall below a predefined threshold, and output the results.

If this sounds vaguely familiar, that's because it's almost exactly what MicrobeTrace does. And there's a good reason for this: MicrobeTrace was originally a wrapper for HIV-TRACE. However, circa Spring of 2017, we realized that the executable environment containing [all of HIV-TRACE's dependency stack](https://github.com/veg/hivtrace#system-dependencies) was unwieldy and difficult to use. To solve this problem, we replicated the data workflow in Javascript, enabling MicrobeTrace to perform all of the above steps in a single environment. This transition came at a performance cost. Because HIV-TRACE can access the machine on which it's running more-or-less directly, it can perform certain operations much more rapidly.

MicrobeTrace brings other substantial advantages to the table. Instead of a complex (error-prone) installation process with multiple dependencies, MicrobeTrace is a website. To load it, simply visit the URL. Furthermore, HIVTRACE is used on the command-line, which is confusing and difficult (if not frightening) for non-technical users. MicrobeTrace is a Graphical User Interface which is designed to guide the user gently through every step of the process. Finally, MicrobeTrace's output is also graphical. MicrobeTrace _shows_ you a network, where HIVTrace merely outputs a statistical description of it, and a network file (which MicrobeTrace can open, BTW).

## DataMonkey and Secure HIV-TRACE

While MicrobeTrace sought to make HIV-TRACE analysis available through the Browser, [DataMonkey](https://www.datamonkey.org/hivtrace) and Secure HIV-TRACE both sought to make HIV-TRACE available through a server. 

## GHOST

[GHOST](https://www.ncbi.nlm.nih.gov/pubmed/29244005), or the global hepatitis outbreak and surveillance technology

## MicroReact

[MicroReact](https://microreact.org/showcase)

## NextFlu and NextStrain

[NextFlu](https://bedford.io/projects/nextflu/) and [NextStrain](https://nextstrain.org/)

## NextHIV

[NextHIV](https://github.com/sdwfrost/nexthiv)

## ...which brings us back to MicrobeTrace

MicrobeTrace is the only platform which pairs a premium on ease-of-use with data security guarantees. For the non- or semi-technical analyst, it's more feature-full than any other molecular epidemiology platform presently available.