MicrobeTrace include an _Aggregation_ view. This is similar to the table view (in that it shows a sortable table), but it does one thing very differently. Instead of showing the raw Node, Link, or Cluster dataset, the Aggregation view takes a given variable, figures out all the different values that populate that variable within the dataset, and count the number of members of the dataset with each value. (Database Nerds will recognize this as a `SELECT COUNT(1) from <Dataset> GROUP BY <Variable>` query.)

## Example

To give a more concrete example, consider a node dataset which includes a "Gender" variable. If we open the aggregation view and select the "Node Gender" from the dropdown, we'll see a table which resembles the following:

| Node Gender | Number | Percentage |
| ----------- | ------ | ---------- |
| Female      |    485 |      48.5% |
| Male        |    490 |      49.0% |
| Other       |     25 |       2.5% |

*Please note that I just made these numbers up, and they should not be construed as anything other than a demonstrative example of this technology.*

So, of the 1000 nodes in the dataset, 485 represent females, 490 represent males, and 25 represent people who didn't identify as either.

## Multiple Aggregations

The Aggregate view enables you to view multiple such aggregations simultaneously. To do so, simple click "Add Variable" and select the variable you wish to see in the second table. 

![Settings for aggregation view](https://i.ibb.co/9Zfgtb7/Aggregate-settings.jpg)

The tables can be sorted by dragging the up-and-down-arrow beside the variable drop down.

![Aggregate view with three variables](https://i.ibb.co/Smz1Df2/Aggregate-3-variables.jpg)

## Exporting

Aggregate view offers some export options which are unique to it: 

* PDF - a printable document showing the serialized tables.
* XLSX - an Excel workbook containing one worksheet for each aggregate table.
* CSV.ZIP - a zip file containing one CSV file for each aggregate table.