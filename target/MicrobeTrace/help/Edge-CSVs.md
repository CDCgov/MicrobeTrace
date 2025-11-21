An Edge CSV is a list of links, for which each link represents
some relationship between two individuals. These links could represent a
report of high-risk sexual contact. The file extension must be ".csv". The
contents of an Edge CSV should look something like this:

    source,target,length
    A,B,1
    A,C,2
    B,C,1
    A,D,.5

Each row represents an edge in the network. The `source` and `target` columns
represent the individuals (or *nodes*). Note that these column headers are
spelled using all-lower case. These columns are *mandatory*: a network cannot
be built without them. Any other columns are allowed.