MicrobeTrace is equipped with a flexible search platform. To use it, load some data ([click here if you want to try it with demo data](https://devmicrobetrace.herokuapp.com/#demo)). Then hit Ctrl-f or click the search bar in the top-right of the window. Type a character, and you'll see some nodes in the network light up. When search matches with a node, it sets that node as selected, which you can see in the 2D network and Table views (among others).

## Setting the search field

By default, MicrobeTrace searches through node IDs. However, you can configure this if you want to search any other node fields. Just pick the value you wish to search from the dropdown attached to the right of the search bar.

## Wildcard searching

MicrobeTrace creates a regular expression from search queries, so if you know how to use regular expressions, you can create fine-grained searches. If you don't, here are some rudimentary cheat codes:

| Sequence   | Description                 | Example                              |
|------------|-----------------------------|--------------------------------------|
| `.`        | A single wildcard character | `a.c` matches `abc`                  |
| `.*`       | Any number of characters    | `a.*c` matches `abc` and `acrobatic` |
| `^`        | Starts with                 | `^a` matches `abc` but not `zabc`    |
| `$`        | Ends with                   | `c$` matches `abc` but not `abcd`    |

MicrobeTrace handles known numeric values as a special case. Instead of constructing a regular expression, MicrobeTrace compares those values *directly*. The benefit of this is that typing `10` will match only nodes with a field value of exactly 10, instead node with values of 100, 110, 210, etc.