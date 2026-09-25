# Cluster-size layout stress dataset

Load both CSV files into a new MicrobeTrace session:

- `ClusterSizeLayoutStressNodes.csv`
- `ClusterSizeLayoutStressLinks.csv`

The node file is required because it carries the four isolated size-1 clusters.

## Expected network

- 204 disconnected clusters
- 5,675 nodes
- 5,520 links
- Four clusters of every size from 1 through 50
- Four large outliers with sizes 75, 100, 150, and 250
- Repeated chain, star, cycle, and binary-tree shapes

## Useful checks

1. Select **Order by cluster size** in the 2D network layout control.
2. Confirm cluster-size groups increase from left to right.
3. Confirm the four clusters sharing each size stay together.
4. Check that the 75-, 100-, 150-, and 250-node outliers remain within the view bounds after fit/zoom.
5. Switch back to **Force directed** and confirm the prior force-directed positions are restored.

