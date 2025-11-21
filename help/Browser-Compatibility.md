MicrobeTrace makes heavy usage of cutting-edge (as of July 2019) web technologies. Accordingly, Browser support for MicrobeTrace is inconsistent. The following table shows the most common browsers and MicrobeTrace features known to be supported (or not):

|                    | Chrome | Opera | Firefox | Safari | Edge | IE11 |
|--------------------|--------|-------|---------|--------|------|------|
| Loading Files      | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| 2D Networks        | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| 3D Networks        | ✓ | ✓ | ✗ | ? | ✗ | ✗ |
| Histograms         | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Scatterplots       | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Flow Diagrams      | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Tables             | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Aggregations       | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Crosstabs          | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Bubbles            | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Phylogenetic Trees | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Physics Trees      | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Waterfalls         | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Maps               | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Globes             | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Choropleths        | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Gantt Charts       | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Timelines          | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Heatmaps           | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Sequences          | ✓ | ✓ | ? | ✓ | ✗ | ✗ |

Where ✓ means "Works great!", ✗ means "Nope!", and ? means "not sure, need to test it."

## Note regarding Microsoft Edge

In late 2018, Microsoft announced that it's preferred browser (Edge) would be transitioning from it's own Javascript engine (Chakra) to using the open-source V8 engine (which powers Chrome). At the time of writing (July 2019), this new version of Edge is [only available in development builds](https://www.microsoftedgeinsider.com/en-us/). Once the production Edge is updated to this new version, Edge support should essentially come into line with Chrome.

## Note regarding Internet Explorer

MicrobeTrace does not and will never support any version of Internet Explorer. To learn why this is the case, please see [this wiki's article on the subject](https://github.com/CDCgov/MicrobeTrace/wiki/Internet-Explorer).