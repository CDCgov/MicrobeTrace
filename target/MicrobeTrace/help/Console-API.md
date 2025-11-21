If you need to do something in MicrobeTrace that's outside the bounds of the UI constraints, you can work around it from the Developer Console. Here are some tricks:

## Set Filtering Epsilon to a Large Value

MicrobeTrace's Filtering Epsilon (ε) varies between -9 and 0. When Nearest Neighbor is recomputed, MicrobeTrace's true tolerance is 10^(ε). If you need tolerances greater than 1, you'll need to circumvent the UI using the console. Run this line:

```javascript
session.style.widgets['filtering-epsilon'] = 2; //Or whatever you need the value to be

// Just run the rest of this.
app.computeNN(session.style.widgets['link-sort-variable'], function(){
  app.updateNetwork($('#node-singletons-hide').is(':checked'));
  app.updateStatistics();
  $(window).trigger('link-threshold-change');
});
```