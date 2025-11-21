So you want to create a new view? Cool! Here's what you'll need to know. (Verbiage note: the terms _component_ and _view_ are used interchangeably in this document.)

## Step 1: Pick a Model to Copy

The fastest way to bootstrap a new view is to simply duplicate the most similar [existing view](https://github.com/CDCgov/MicrobeTrace/tree/master/components). Any view should be considered fair game, but I'd advise against using the 2d Network or Map views. They're the most complex parts of the app, and once you start to change things, the bug farm will really ramp up.

When you're picking a view to copy, some things to consider:

* Is this view going to be powered by Plotly? If so, use the Histogram, Scatterplot, or Heatmap as your model.
* Is this view going to be powered by D3? If so, check out Bubbles or Gantt.
* Is this a view of nodes? If so, use Bubbles, Gantt or Sequences.
* Is this a view of links? If so, use Scatterplot.
* Is this a view of a Distance Matrix? If so, use Heatmap.
* Is this a view of data associated with either links OR nodes? If so, use Histogram.
* Is this a view of both links and nodes simultaneously? If so, _fine_--use 2d Network or Map. *(dramatic sigh)*

## Step 2: Hook it Up

To get your View into the app and working, you're going to need to change a few things:

1. Add a link in the menu in `index.html`. If your view should be available for any type of data, add a link like this above the `div.dropdown-divider.showForSequence`:

```html
<a href="#" class="dropdown-item viewbutton" data-href="my_new_view">My New View</a>
```

or, if your view should only be accessible to sessions with sequence data, add a link like this after the `div.dropdown-divider.showForSequence`. 

```html
<a href="#" class="dropdown-item viewbutton showForSequence" data-href="my_new_view">My New View</a>
```

The `data-href` attribute should be the file name (sans `.html`), and the file name should be the same as the human-readable version, only lower-cased and with underscores instead of spaces.

2. Create the file in `components/`. If you were wise and chose a view to copy, then simply copy the view you chose as a model to the appropriate filename (remember, it MUST MATCH the `data-href` attribute from step 1). Do a find-and-replace in the file for instances of the model name, and replace them with the new view's name.

## Step 3: Design your Logic

This is the part that I can help least with. After all, if I knew what the logic of your new view was, I probably would've made it myself already. However, once you've got the core functionality done, you're going to want to enable the user to configure it, and I *can* help with that.

1. Add your widgets to the View's div.left_pane. They're all organized the same way: a sliding panel which is off-screen left by default but scrolls right when the user clicks the gear icon at the top-left corner of the view. From there, they should be preceded by a `ul.nav.nav-tabs` and wrapped in a `div.tab-content`. Odds are there will be a little bit of overlap between the widgets your model used and the widgets you'll need. Feel free to preserve/delete as appropriate.

2. Add the logic for the widgets. In general, there's going to be a script tag at the bottom of the view, and those are generally organized in roughly the same way:

 * A self-executing function, to keep the view from leaking stuff to the global namespace. (If you need something to be global for some reason, it should go somewhere in `session` or `app`.)
 * A refreshView function, which builds or rebuilds the view.
 * A bunch of jQuery DOM event handlers, roughly one per widget. These should alter the view. If refreshView is quick (and it should be!), they can all just call refreshView or change events (For performance reasons, try not to use input events if it can be avoided).
 * A few event handlers on $(window), which is how MicrobeTrace passes information about what to update and when. More on these in a minute.
 * Finally, if you need to do anything on first load, kick it off at the bottom of the script.

3. For every widget that you want to be session-saveable (i.e. stored in a session save file), add the widget's `id` and default value to the `app.defaultWidgets` object in `common.js`. Whenever a component is first loaded, it is checked for any widgets with those ids, and if any are found, the associated value is set. For select, numeric and color inputs this works exactly how you expect. For radios, choose the non-default options and set them to `false`.

## Step 4: Check for Data Updates

Remember those event handlers on `$(window)`? The last thing you should do is make sure those are hooked up properly. For example, the simplest is `background-color-change`, on which you should set the background color of your view to `session.style.widgets['background-color']`. However, the ones that should concern you most are `link-threshold-change`, `node-visibility` and `node-selected`. Let's look at each in turn:

* `link-threshold-change` - This one signals that the set of visible links has changed. This can occur when the user adjusts the visibility threshold, toggles Nearest Neighbor filtering, or shows/hides a cluster. You should update your view's copy of the links using `app.getVisibleLinks(true)` and call `refreshView()`
* `node-visibility` - This one occurs when some set of nodes has been shown or hidden. This occurs when the user shows/hides a cluster, shows/hides singletons, or hides singletons and then changes the link threshold (which changes the set of hidden singletons).
* `node-selected` - This one signals that a node has been selected, typically by clicking on it. It should be highlighted, ideally by using the `session.style.widgets['highlight-color']`.

## Step 5: Pass updates back upstream

Which of the above events do you want to cause to occur using your view? If you can see nodes, then you probably want to enable clicking on them to select them, so that's a good first start. Something like this:

```javascript
$(myNode).on('click', function(e){
  $this = $(this);
  session.data.nodes.find(d => d.id === $this.data('id')).selected = true;
  $(window).trigger('node-selected');
});
```

Obviously, you'll want to do more fancy stuff like toggle selection and multi-select using `ctrl`. Figure out for yourself what's intuitive for users.

## Step 6: Commit, Push, Demo, Merge.

Finally, make sure you've committed all this in git and pushed to an upstream repo (anything on your machine must be considered expendable!). Demo it and see what people think about it. If it's a winner, submit a pull request and get it merged. Done!